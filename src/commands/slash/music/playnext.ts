import { Player, Track } from "moonlink.js";
import { en, es, esLocales } from "../../../i18n/index.js";
import { SlashCommand } from "../../../core/classes/SlashCommand.js";
import { PlaybackStrategy } from "../../../core/strategy/PlaybackStrategy.js";
import logger from "../../../core/client/logger.js";


class PlayNext extends PlaybackStrategy {
    protected override addMode = "next" as const

    override async addTracks(player: Player, tracks: Track | Track[]): Promise<void> {
        // insert pasa por la API de la cola (eventos y estado) en vez de tocar el array directo
        player.queue.insert(0, tracks)
    }

    override async afterAddToQueue(player: Player): Promise<void> {
        // No hace nada despues de agregar a la cola
    }
}

const playNext = new PlayNext()

export default new SlashCommand()
    .setName("playnext")
    .setDescription(en.commands.playnext).setDescriptionLocalizations(esLocales(es.commands.playnext))
    .setCategory("Music")
    .setExecute(async (client, inter) => {
        try {
            await playNext.execute(client, inter)
        } catch (err) {
            logger.error(`[/playnext] Error no controlado en el comando:`, err)
        }
    })
    .setAutoComplete(async (client, inter) => {
        try {
            await playNext.autocomplete(client, inter)
        } catch (err) {
            logger.error(`[/playnext] Error en el autocompletado:`, err)
        }
    })
    .addStringOption(
        o => o
            .setName("search").setNameLocalizations(esLocales(es.names.search))
            .setDescription(en.commands.search).setDescriptionLocalizations(esLocales(es.commands.search))
            .setAutocomplete(true)
            .setRequired(true))

