import { ChatInputCommandInteraction, MessageFlags } from "discord.js"
import { es, textsFor, type Texts } from "../../../i18n/index.js";
import { SlashCommand } from "../../../core/classes/SlashCommand.js"
import { BClient } from "../../../core/client/BClient.js"
import logger from "../../../core/client/logger.js"
import { editReplyEmbed, MAX_LOAD, queueSavedTracks, resolveTracksToSave, savedTrackSearch, showSavedList, voiceChannelFor } from "../../../core/music/savedTracks.js"
import { EmptyEmbed, replyEmbed } from "../../../utils/messages.js"
import { shuffle, titleCleaner } from "../../../utils/tools.js"

const noFavorites = (t: Texts) => EmptyEmbed({ description: t.favorites.none }).setColor("Yellow")

/** /favoritos agregar: guarda una canción buscada, o la que suena si no se escribe nada */
async function add(client: BClient, inter: ChatInputCommandInteraction<"cached">) {
    // Buscar puede tardar más de los 3 s que da Discord; la respuesta la ve solo quien la pide
    await inter.deferReply({ flags: MessageFlags.Ephemeral })
    const t = await textsFor(client, inter.guildId)

    const resolved = await resolveTracksToSave(client, inter, t)
    if (!resolved) return
    const [track] = resolved.tracks

    const title = titleCleaner(track.title, track.author)
    if (!await client.db.addFavorite(inter.user.id, track)) return editReplyEmbed(inter, t.favorites.already(title), "Yellow")

    logger.info(`[Favoritos] ${inter.user.username} agregó "${track.title}" (${track.uri}) desde /favoritos agregar en ${inter.guild.name}`)
    return editReplyEmbed(inter, t.favorites.added(title), "Green")
}

/** /favoritos play: carga los favoritos del usuario en la cola */
async function play(client: BClient, inter: ChatInputCommandInteraction<"cached">) {
    const VCID = await voiceChannelFor(client, inter)
    if (!VCID) return
    const t = await textsFor(client, inter.guildId)

    const favorites = await client.db.getFavorites(inter.user.id)
    if (!favorites.length) return replyEmbed({ interaction: inter, embed: noFavorites(t), ephemeral: true })

    const amount = inter.options.getInteger("cantidad") ?? MAX_LOAD
    const mix = inter.options.getBoolean("mezclar") ?? false
    const selected = (mix ? shuffle(favorites) : favorites).slice(0, amount)

    // Buscar cada enlace puede tardar más de los 3 s que da Discord
    await inter.deferReply()
    const { tracks, failed, queueSize } = await queueSavedTracks(client, inter, VCID, selected)
    if (!tracks.length) return editReplyEmbed(inter, t.favorites.loadFailed, "Red")

    logger.info(`[favoritos] ${inter.user.username} cargó ${tracks.length} favoritos${mix ? " mezclados" : ""} en ${inter.guild.name} (fallaron: ${failed.length}, cola: ${queueSize})`)

    const embed = EmptyEmbed()
        .setAuthor({ name: t.favorites.of(inter.member.displayName), iconURL: inter.user.displayAvatarURL() })
        .setDescription(t.saved.added(tracks.length, mix))
        .setThumbnail(tracks[0].artworkUrl ?? null)
        .setColor("Green")
    if (failed.length) embed.addFields({ name: t.saved.failedField, value: t.saved.failedValue(failed.length) })
    if (favorites.length > selected.length) embed.setFooter({ text: t.favorites.loaded(favorites.length, selected.length) })

    return inter.editReply({ embeds: [embed] })
}

/** /favoritos ver: lista paginada, solo para quien la pide, con un menú para quitar canciones */
async function view(client: BClient, inter: ChatInputCommandInteraction<"cached">) {
    // Momento en que se agregó: identifica la canción aunque la lista cambie desde otra ventana
    const load = async () => (await client.db.getFavorites(inter.user.id)).map(fav => ({ ...fav, key: String(fav.addedAt) }))
    const t = await textsFor(client, inter.guildId)
    if (!(await load()).length) return replyEmbed({ interaction: inter, embed: noFavorites(t), ephemeral: true })

    return showSavedList(inter, t, {
        title: t.favorites.of(inter.member.displayName),
        idPrefix: "fav",
        hint: t.favorites.hint,
        load,
        remove: async fav => {
            if (await client.db.removeFavorite(inter.user.id, fav.uri))
                logger.info(`[Favoritos] ${inter.user.username} quitó "${fav.title}" (${fav.uri}) desde /favoritos ver`)
        },
    })
}

export default new SlashCommand()
    .setName("favoritos")
    .setDescription(es.commands.favorites)
    .setCategory("Music")
    .setExecute(async (client, inter) => {
        try {
            const sub = inter.options.getSubcommand()
            if (sub === "play") await play(client, inter)
            else if (sub === "agregar") await add(client, inter)
            else await view(client, inter)
        } catch (err) {
            logger.error(`[/favoritos] Error no controlado en el comando:`, err)
        }
    })
    .setAutoComplete(async (client, inter) => {
        try {
            await savedTrackSearch.autocomplete(client, inter)
        } catch (err) {
            logger.error(`[/favoritos] Error en el autocompletado:`, err)
        }
    })
    .addSubcommand(sub => sub
        .setName("play")
        .setDescription(es.commands.favoritesPlay)
        .addIntegerOption(o => o
            .setName("cantidad")
            .setDescription(es.commands.favoritesAmount(MAX_LOAD))
            .setMinValue(1)
            .setMaxValue(MAX_LOAD))
        .addBooleanOption(o => o
            .setName("mezclar")
            .setDescription(es.commands.favoritesMix)))
    .addSubcommand(sub => sub
        .setName("agregar")
        .setDescription(es.commands.favoritesAdd)
        .addStringOption(o => o
            .setName("busqueda")
            .setDescription(es.commands.savedSearch)
            .setAutocomplete(true)))
    .addSubcommand(sub => sub
        .setName("ver")
        .setDescription(es.commands.favoritesView))
