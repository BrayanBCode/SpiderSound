import { ActionRowBuilder, AutocompleteInteraction, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, MessageFlags } from "discord.js"
import { en, es, esLocales, textsFor, type Texts } from "../../../i18n/index.js"
import { SlashCommand } from "../../../core/classes/SlashCommand.js"
import { BClient } from "../../../core/client/BClient.js"
import logger from "../../../core/client/logger.js"
import { PlaylistSummary } from "../../../core/db/database.js"
import { editReplyEmbed, MAX_LOAD, queueSavedTracks, resolveTracksToSave, savedTrackSearch, showSavedList, voiceChannelFor } from "../../../core/music/savedTracks.js"
import { EmptyEmbed, replyEmbed } from "../../../utils/messages.js"
import { shuffle, titleCleaner } from "../../../utils/tools.js"

/** Discord muestra hasta 25 opciones en el autocompletado */
const MAX_PLAYLISTS = 25
/** Igual al tope de carga: así una playlist siempre se reproduce entera */
const MAX_TRACKS = MAX_LOAD
const NAME_MAX = 50
const CONFIRM_TIME = 30 * 1000

type Inter = ChatInputCommandInteraction<"cached">

const replyEphemeral = (inter: Inter, description: string, color: "Green" | "Yellow" | "Red") =>
    replyEmbed({ interaction: inter, embed: EmptyEmbed({ description }).setColor(color), ephemeral: true })

/** La playlist elegida en la opción `playlist`. Si no existe (o es de otro), avisa y devuelve `undefined` */
async function findPlaylist(client: BClient, inter: Inter, t: Texts, deferred = false): Promise<PlaylistSummary | undefined> {
    const name = inter.options.getString("playlist", true).trim()
    const playlist = await client.db.getPlaylist(inter.user.id, name)
    if (playlist) return playlist

    const msg = t.playlist.notFound(name)
    if (deferred) await editReplyEmbed(inter, msg, "Yellow")
    else await replyEphemeral(inter, msg, "Yellow")
}

async function create(client: BClient, inter: Inter) {
    const t = await textsFor(client, inter.guildId)
    const name = inter.options.getString("name", true).trim()
    if (!name) return replyEphemeral(inter, t.playlist.emptyName, "Yellow")
    if ((await client.db.getPlaylists(inter.user.id)).length >= MAX_PLAYLISTS)
        return replyEphemeral(inter, t.playlist.max(MAX_PLAYLISTS), "Yellow")

    const playlist = await client.db.createPlaylist(inter.user.id, name)
    if (!playlist) return replyEphemeral(inter, t.playlist.exists(name), "Yellow")

    logger.info(`[Playlist] ${inter.user.username} creó "${name}" en ${inter.guild.name}`)
    return replyEphemeral(inter, t.playlist.created(name), "Green")
}

async function add(client: BClient, inter: Inter) {
    // Buscar puede tardar más de los 3 s que da Discord; la respuesta la ve solo quien la pide
    await inter.deferReply({ flags: MessageFlags.Ephemeral })
    const t = await textsFor(client, inter.guildId)

    const playlist = await findPlaylist(client, inter, t, true)
    if (!playlist) return
    if (playlist.trackCount >= MAX_TRACKS)
        return editReplyEmbed(inter, t.playlist.full(playlist.name, MAX_TRACKS), "Yellow")

    // Acepta enlaces de playlists (ej. de YouTube): se agregan todas sus canciones
    const resolved = await resolveTracksToSave(client, inter, t, true)
    if (!resolved) return

    if (!resolved.playlistName) {
        const [track] = resolved.tracks
        const title = titleCleaner(track.title, track.author)
        if (!await client.db.addToPlaylist(playlist.id, track)) return editReplyEmbed(inter, t.playlist.alreadyIn(title, playlist.name), "Yellow")

        logger.info(`[Playlist] ${inter.user.username} agregó "${track.title}" (${track.uri}) a "${playlist.name}" en ${inter.guild.name}`)
        return editReplyEmbed(inter, t.playlist.addedTrack(title, playlist.name, playlist.trackCount + 1), "Green")
    }

    // Se agregan en orden hasta llenar el lugar libre; las repetidas se saltean sin ocupar lugar
    let added = 0, repeated = 0, free = MAX_TRACKS - playlist.trackCount
    for (const track of resolved.tracks) {
        if (added >= free) break
        if (await client.db.addToPlaylist(playlist.id, track)) added++
        else repeated++
    }
    const leftOut = resolved.tracks.length - added - repeated

    logger.info(`[Playlist] ${inter.user.username} agregó ${added} canciones de la playlist "${resolved.playlistName}" a "${playlist.name}" en ${inter.guild.name} (repetidas: ${repeated}, sin lugar: ${leftOut})`)

    const notes = [
        repeated ? t.playlist.repeated(repeated) : "",
        leftOut ? t.playlist.leftOut(leftOut, MAX_TRACKS) : "",
    ].filter(Boolean).join(" · ")
    return editReplyEmbed(inter,
        t.playlist.addedPlaylist(added, resolved.playlistName, playlist.name, playlist.trackCount + added) + (notes ? `\n${notes}` : ""),
        added ? "Green" : "Yellow")
}

async function play(client: BClient, inter: Inter) {
    const VCID = await voiceChannelFor(client, inter)
    if (!VCID) return
    const t = await textsFor(client, inter.guildId)

    const playlist = await findPlaylist(client, inter, t)
    if (!playlist) return

    const saved = await client.db.getPlaylistTracks(playlist.id)
    if (!saved.length) return replyEphemeral(inter, t.playlist.empty(playlist.name), "Yellow")

    const mix = inter.options.getBoolean("shuffle") ?? false

    // Buscar cada enlace puede tardar más de los 3 s que da Discord
    await inter.deferReply()
    const { tracks, failed, queueSize } = await queueSavedTracks(client, inter, VCID, mix ? shuffle(saved) : saved)
    if (!tracks.length) return editReplyEmbed(inter, t.playlist.loadFailed(playlist.name), "Red")

    logger.info(`[playlist] ${inter.user.username} cargó "${playlist.name}" (${tracks.length} canciones${mix ? ", mezcladas" : ""}) en ${inter.guild.name} (fallaron: ${failed.length}, cola: ${queueSize})`)

    const embed = EmptyEmbed()
        .setAuthor({ name: t.playlist.of(inter.member.displayName), iconURL: inter.user.displayAvatarURL() })
        .setTitle(playlist.name)
        .setDescription(t.saved.added(tracks.length, mix))
        .setThumbnail(tracks[0].artworkUrl ?? null)
        .setColor("Green")
    if (failed.length) embed.addFields({ name: t.saved.failedField, value: t.saved.failedValue(failed.length) })

    return inter.editReply({ embeds: [embed] })
}

async function view(client: BClient, inter: Inter) {
    const t = await textsFor(client, inter.guildId)
    // Sin playlist: el resumen de todas
    if (!inter.options.getString("playlist")) {
        const playlists = await client.db.getPlaylists(inter.user.id)
        if (!playlists.length) return replyEphemeral(inter, t.playlist.none, "Yellow")

        return replyEmbed({
            interaction: inter,
            ephemeral: true,
            embed: EmptyEmbed()
                .setAuthor({ name: t.playlist.listOf(inter.member.displayName) })
                .setColor(0x1DB954)
                .setDescription(playlists.map(p => t.playlist.listLine(p.name, t.common.tracks(p.trackCount))).join("\n"))
                .setFooter({ text: t.playlist.listFooter(playlists.length, MAX_PLAYLISTS) }),
        })
    }

    const playlist = await findPlaylist(client, inter, t)
    if (!playlist) return

    // Posición: identifica la canción aunque la lista cambie desde otra ventana
    const load = async () => (await client.db.getPlaylistTracks(playlist.id)).map(track => ({ ...track, key: String(track.position) }))
    if (!(await load()).length) return replyEphemeral(inter, t.playlist.empty(playlist.name), "Yellow")

    return showSavedList(inter, t, {
        title: `${playlist.name} 📁`,
        idPrefix: "pl",
        hint: t.playlist.hint,
        load,
        remove: async item => {
            if (await client.db.removeFromPlaylist(playlist.id, Number(item.key)))
                logger.info(`[Playlist] ${inter.user.username} quitó "${item.title}" (${item.uri}) de "${playlist.name}"`)
        },
    })
}

async function rename(client: BClient, inter: Inter) {
    const t = await textsFor(client, inter.guildId)
    const playlist = await findPlaylist(client, inter, t)
    if (!playlist) return

    const newName = inter.options.getString("new_name", true).trim()
    if (!newName) return replyEphemeral(inter, t.playlist.emptyName, "Yellow")
    if (!await client.db.renamePlaylist(inter.user.id, playlist.id, newName))
        return replyEphemeral(inter, t.playlist.otherExists(newName), "Yellow")

    logger.info(`[Playlist] ${inter.user.username} renombró "${playlist.name}" a "${newName}"`)
    return replyEphemeral(inter, t.playlist.renamed(playlist.name, newName), "Green")
}

async function remove(client: BClient, inter: Inter) {
    const t = await textsFor(client, inter.guildId)
    const playlist = await findPlaylist(client, inter, t)
    if (!playlist) return

    // Borrar no se puede deshacer: se pide confirmación con botones
    const { resource } = await inter.reply({
        embeds: [EmptyEmbed({ description: t.playlist.confirmDelete(playlist.name, playlist.trackCount) }).setColor("Red")],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("pl-delete-yes").setLabel(t.playlist.deleteButton).setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("pl-delete-no").setLabel(t.playlist.cancelButton).setStyle(ButtonStyle.Secondary))],
        flags: MessageFlags.Ephemeral,
        withResponse: true,
    })
    if (!resource?.message) return

    try {
        const answer = await resource.message.awaitMessageComponent({
            time: CONFIRM_TIME,
            filter: i => i.user.id === inter.user.id && i.customId.startsWith("pl-delete-"),
        })

        if (answer.customId === "pl-delete-no")
            return answer.update({ embeds: [EmptyEmbed({ description: t.playlist.cancelled(playlist.name) })], components: [] })

        const deleted = await client.db.deletePlaylist(inter.user.id, playlist.id)
        if (deleted) logger.info(`[Playlist] ${inter.user.username} borró "${playlist.name}" (${playlist.trackCount} canciones)`)
        return answer.update({
            embeds: [EmptyEmbed({ description: deleted ? t.playlist.deleted(playlist.name) : t.playlist.didNotExist(playlist.name) }).setColor(deleted ? "Green" : "Yellow")],
            components: [],
        })
    } catch {
        // Se venció el tiempo sin respuesta
        return inter.editReply({ embeds: [EmptyEmbed({ description: t.playlist.timedOut(playlist.name) })], components: [] }).catch(() => { })
    }
}

/** Sugiere las playlists del usuario, o canciones si se está escribiendo `search` */
async function autocomplete(client: BClient, inter: AutocompleteInteraction) {
    const focused = inter.options.getFocused(true)
    if (focused.name === "search") return savedTrackSearch.autocomplete(client, inter)

    const text = focused.value.toLowerCase()
    const t = await textsFor(client, inter.guildId)
    return inter.respond((await client.db.getPlaylists(inter.user.id))
        .filter(p => p.name.toLowerCase().includes(text))
        .slice(0, 25)
        .map(p => ({ name: t.playlist.option(p.name, t.common.tracks(p.trackCount)).slice(0, 100), value: p.name })))
}

const subcommands: Record<string, (client: BClient, inter: Inter) => Promise<unknown>> = {
    create, add, play, view, rename, delete: remove,
}

export default new SlashCommand()
    .setName("playlist")
    .setDescription(en.commands.playlist).setDescriptionLocalizations(esLocales(es.commands.playlist))
    .setCategory("Music")
    .setExecute(async (client, inter) => {
        try {
            await subcommands[inter.options.getSubcommand()]?.(client, inter)
        } catch (err) {
            logger.error(`[/playlist] Error no controlado en el comando:`, err)
        }
    })
    .setAutoComplete(async (client, inter) => {
        try {
            await autocomplete(client, inter)
        } catch (err) {
            logger.error(`[/playlist] Error en el autocompletado:`, err)
        }
    })
    .addSubcommand(sub => sub
        .setName("create").setNameLocalizations(esLocales(es.names.create))
        .setDescription(en.commands.playlistCreate).setDescriptionLocalizations(esLocales(es.commands.playlistCreate))
        .addStringOption(o => o.setName("name").setNameLocalizations(esLocales(es.names.name)).setDescription(en.commands.playlistName).setDescriptionLocalizations(esLocales(es.commands.playlistName)).setRequired(true).setMaxLength(NAME_MAX)))
    .addSubcommand(sub => sub
        .setName("add").setNameLocalizations(esLocales(es.names.add))
        .setDescription(en.commands.playlistAdd).setDescriptionLocalizations(esLocales(es.commands.playlistAdd))
        .addStringOption(o => o.setName("playlist").setDescription(en.commands.playlistAddTo).setDescriptionLocalizations(esLocales(es.commands.playlistAddTo)).setRequired(true).setAutocomplete(true))
        .addStringOption(o => o.setName("search").setNameLocalizations(esLocales(es.names.search)).setDescription(en.commands.playlistAddSearch).setDescriptionLocalizations(esLocales(es.commands.playlistAddSearch)).setAutocomplete(true)))
    .addSubcommand(sub => sub
        .setName("play")
        .setDescription(en.commands.playlistPlay).setDescriptionLocalizations(esLocales(es.commands.playlistPlay))
        .addStringOption(o => o.setName("playlist").setDescription(en.commands.playlistPlayWhich).setDescriptionLocalizations(esLocales(es.commands.playlistPlayWhich)).setRequired(true).setAutocomplete(true))
        .addBooleanOption(o => o.setName("shuffle").setNameLocalizations(esLocales(es.names.shuffle)).setDescription(en.commands.playlistMix).setDescriptionLocalizations(esLocales(es.commands.playlistMix))))
    .addSubcommand(sub => sub
        .setName("view").setNameLocalizations(esLocales(es.names.view))
        .setDescription(en.commands.playlistView).setDescriptionLocalizations(esLocales(es.commands.playlistView))
        .addStringOption(o => o.setName("playlist").setDescription(en.commands.playlistViewWhich).setDescriptionLocalizations(esLocales(es.commands.playlistViewWhich)).setAutocomplete(true)))
    .addSubcommand(sub => sub
        .setName("rename").setNameLocalizations(esLocales(es.names.rename))
        .setDescription(en.commands.playlistRename).setDescriptionLocalizations(esLocales(es.commands.playlistRename))
        .addStringOption(o => o.setName("playlist").setDescription(en.commands.playlistRenameWhich).setDescriptionLocalizations(esLocales(es.commands.playlistRenameWhich)).setRequired(true).setAutocomplete(true))
        .addStringOption(o => o.setName("new_name").setNameLocalizations(esLocales(es.names.new_name)).setDescription(en.commands.playlistNewName).setDescriptionLocalizations(esLocales(es.commands.playlistNewName)).setRequired(true).setMaxLength(NAME_MAX)))
    .addSubcommand(sub => sub
        .setName("delete").setNameLocalizations(esLocales(es.names.delete))
        .setDescription(en.commands.playlistDelete).setDescriptionLocalizations(esLocales(es.commands.playlistDelete))
        .addStringOption(o => o.setName("playlist").setDescription(en.commands.playlistDeleteWhich).setDescriptionLocalizations(esLocales(es.commands.playlistDeleteWhich)).setRequired(true).setAutocomplete(true)))
