import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, ComponentType, GuildMember, MessageFlags, StringSelectMenuBuilder } from "discord.js"
import type { Texts } from "../../i18n/index.js"
import { Track } from "moonlink.js"
import { BClient } from "../client/BClient.js"
import logger from "../client/logger.js"
import { SavedTrack } from "../db/database.js"
import { PlaybackStrategy, queryErrors, startIfIdle } from "../strategy/PlaybackStrategy.js"
import { warnJoinToVC, warnNeedSameVC } from "../strategy/PlayBackStrategy.messages.js"
import { checkUserVC } from "../strategy/PlayBackStrategy.modules.js"
import { EmptyEmbed } from "../../utils/messages.js"
import { chunkArray, formatMS_HHMMSS, titleCleaner } from "../../utils/tools.js"

// Lo que comparten /favoritos y /playlist: elegir qué guardar, cargar lo guardado en la cola y la lista paginada.

/** Tope de canciones por carga: cada una es una búsqueda en Lavalink */
export const MAX_LOAD = 100
/** Búsquedas a la vez al cargar (para no saturar Lavalink ni YouTube) */
const SEARCH_BATCH = 5
const PAGE_SIZE = 10
/** Cuánto tiempo responden los botones y el menú de la lista */
const VIEW_TIME = 2 * 60 * 1000

/** Mismas sugerencias que /play, pero sin pedir canal de voz: guardar no reproduce nada */
class SavedTrackSearch extends PlaybackStrategy {
    protected suggestionsNeedVoice = false
}
export const savedTrackSearch = new SavedTrackSearch()

type Color = "Green" | "Yellow" | "Red"
/** Responde editando el mensaje diferido con un embed simple */
export const editReplyEmbed = (inter: ChatInputCommandInteraction<"cached">, description: string, color: Color) =>
    inter.editReply({ embeds: [EmptyEmbed({ description }).setColor(color)] })

const toSaved = (track: Track): SavedTrack => ({ uri: track.uri!, title: track.title, author: track.author, duration: track.duration, artworkUrl: track.artworkUrl })

/**
 * Qué guardar: lo de la opción `search` o, si está vacía, la canción que suena.
 * Con `allowPlaylist`, un enlace de playlist devuelve todas sus canciones (y su nombre).
 * Requiere `deferReply` hecho. Si no hay nada que guardar, ya respondió y devuelve `undefined`.
 */
export async function resolveTracksToSave(client: BClient, inter: ChatInputCommandInteraction<"cached">, t: Texts, allowPlaylist = false)
    : Promise<{ tracks: SavedTrack[], playlistName?: string } | undefined> {
    const query = inter.options.getString("search")?.trim()

    if (!query) {
        const track = client.getPlayer(inter.guildId)?.current
        if (!track) return void await editReplyEmbed(inter, t.saved.nothingToSave, "Yellow")
        if (!track.uri) return void await editReplyEmbed(inter, t.saved.cannotSave, "Red")
        return { tracks: [toSaved(track)] }
    }

    if (query === queryErrors.NO_RESULTS || query === queryErrors.JOIN_VC) return void await editReplyEmbed(inter, t.saved.noResults, "Yellow")

    const res = await client.music.search({ query, requester: inter.user }).catch(err => {
        logger.error(`[${inter.commandName}] Error buscando "${query}":`, err)
        return null
    })
    if (res === null) return void await editReplyEmbed(inter, t.saved.searchError, "Red")

    if (res?.loadType === "playlist") {
        if (!allowPlaylist) return void await editReplyEmbed(inter, t.saved.noPlaylists, "Yellow")
        const tracks = res.tracks.filter((t: Track) => t.uri).map(toSaved)
        if (!tracks.length) return void await editReplyEmbed(inter, t.saved.playlistEmpty, "Yellow")
        return { tracks, playlistName: res.playlistInfo?.name ?? t.play.playlistFallback }
    }

    const track = res?.tracks?.[0]
    if (!track) return void await editReplyEmbed(inter, t.saved.noResults, "Yellow")
    if (!track.uri) return void await editReplyEmbed(inter, t.saved.cannotSave, "Red")
    return { tracks: [toSaved(track)] }
}

/** Mismos chequeos de voz que /play. Devuelve el canal o `undefined` si ya avisó al usuario */
export async function voiceChannelFor(client: BClient, inter: ChatInputCommandInteraction<"cached">): Promise<string | undefined> {
    const VCID = (inter.member as GuildMember).voice.channelId
    if (!VCID) return void await warnJoinToVC(inter)
    if (!checkUserVC(inter)) return

    const existing = client.getPlayer(inter.guildId)
    if (existing?.connected && existing.voiceChannelId !== VCID) return void await warnNeedSameVC(inter)
    return VCID
}

/**
 * Busca cada canción guardada por su enlace (de a SEARCH_BATCH, conservando el orden),
 * la agrega a la cola y arranca si no sonaba nada. Requiere `deferReply` hecho.
 */
export async function queueSavedTracks(client: BClient, inter: ChatInputCommandInteraction<"cached">, VCID: string, items: SavedTrack[]) {
    const tracks: Track[] = []
    const failed: SavedTrack[] = []
    for (const batch of chunkArray(items, SEARCH_BATCH)) {
        const results = await Promise.all(batch.map(item =>
            client.music.search({ query: item.uri, requester: inter.user })
                .then(res => res?.tracks?.[0])
                .catch(err => { logger.debug(`[${inter.commandName}] Error buscando ${item.uri}: ${err}`); return undefined })))
        results.forEach((track, i) => track ? tracks.push(track) : failed.push(batch[i]))
    }

    if (failed.length) logger.warn(`[${inter.commandName}] No se pudieron cargar ${failed.length} canciones de ${inter.user.username}: ${failed.map(f => f.uri).join(", ")}`)
    if (!tracks.length) return { tracks, failed, queueSize: 0 }

    const player = await client.getPlayerOrDefault(inter, inter.guildId)
    if (!player.connected) {
        if (player.voiceChannelId !== VCID) player.setVoiceChannelId(VCID)
        await player.connect({ selfDeaf: true, selfMute: false })
    }

    player.queue.add(tracks)
    await startIfIdle(player)
    return { tracks, failed, queueSize: player.queue.size }
}

/** Canción de una lista con una clave estable para el menú (no cambia aunque se quiten otras) */
export interface SavedListItem extends SavedTrack {
    key: string
}

interface SavedListOptions {
    /** Título del embed, ej. "Favoritos de Brayan ❤️" */
    title: string
    /** Prefijo de los customId, para que el colector solo atienda sus controles */
    idPrefix: string
    /** Texto del pie, ej. "/favoritos play para escucharlos" */
    hint: string
    load: () => Promise<SavedListItem[]>
    /** Quita la canción (y deja el log). Se llama con la versión recién leída de la lista */
    remove: (item: SavedListItem) => Promise<void>
}

function renderPage(items: SavedListItem[], page: number, opts: SavedListOptions, t: Texts) {
    const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
    const start = page * PAGE_SIZE
    const pageItems = items.slice(start, start + PAGE_SIZE)

    const embed = EmptyEmbed()
        .setAuthor({ name: opts.title })
        .setColor(0x1DB954)
        .setDescription(pageItems.length
            ? pageItems.map((item, i) => `**${start + i + 1}.** [${titleCleaner(item.title, item.author)}](${item.uri}) · ${item.author} · \`${formatMS_HHMMSS(item.duration)}\``).join("\n")
            : t.saved.noneLeft)
        .setFooter({ text: t.saved.pageFooter(page + 1, pages, items.length, opts.hint) })

    const components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = []
    if (pageItems.length) components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`${opts.idPrefix}-remove`)
            .setPlaceholder(t.saved.removePlaceholder)
            .addOptions(pageItems.map((item, i) => ({
                label: `${start + i + 1}. ${titleCleaner(item.title, item.author)}`.slice(0, 100),
                description: item.author.slice(0, 100),
                value: item.key,
            })))))
    if (pages > 1) components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`${opts.idPrefix}-prev`).setEmoji("⬅️").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId(`${opts.idPrefix}-next`).setEmoji("➡️").setStyle(ButtonStyle.Secondary).setDisabled(page >= pages - 1)))

    return { embeds: [embed], components }
}

/** Lista paginada, solo para quien la pide, con un menú para quitar canciones. La lista no debe estar vacía */
export async function showSavedList(inter: ChatInputCommandInteraction<"cached">, t: Texts, opts: SavedListOptions) {
    let items = await opts.load()
    let page = 0
    const { resource } = await inter.reply({ ...renderPage(items, page, opts, t), flags: MessageFlags.Ephemeral, withResponse: true })
    if (!resource?.message) return

    // Colector atado a este mensaje y a sus controles: si no, también atrapa el ❤️ del reproductor
    const collector = resource.message.createMessageComponentCollector({
        time: VIEW_TIME,
        filter: i => i.user.id === inter.user.id && i.customId.startsWith(`${opts.idPrefix}-`),
    })

    collector.on("collect", async i => {
        try {
            if (i.componentType === ComponentType.StringSelect) {
                // Se busca en la lista recién leída: puede haber cambiado desde otra ventana
                const item = (await opts.load()).find(it => it.key === i.values[0])
                if (item) await opts.remove(item)
                items = await opts.load()
            } else if (i.customId.endsWith("-prev")) page--
            else if (i.customId.endsWith("-next")) page++

            page = Math.min(Math.max(page, 0), Math.max(0, Math.ceil(items.length / PAGE_SIZE) - 1))
            await i.update(renderPage(items, page, opts, t))
        } catch (err) {
            logger.error(`[${inter.commandName}] Error en la lista de ${inter.user.username}:`, err)
        }
    })

    // Al vencer, se sacan los controles para que no queden botones que no responden
    collector.on("end", () => { inter.editReply({ components: [] }).catch(() => { }) })
}
