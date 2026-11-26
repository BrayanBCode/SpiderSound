import logger from "../../../core/client/logger.js"
import { en, es, esLocales } from "../../../i18n/index.js";
import { SlashCommand } from "../../../core/classes/SlashCommand.js"
import { PlaybackStrategy } from "../../../core/strategy/PlaybackStrategy.js"



class Play extends PlaybackStrategy { }

const play = new Play()

export default new SlashCommand()
    .setName("play")
    .setDescription(en.commands.play).setDescriptionLocalizations(esLocales(es.commands.play))
    .setCategory("Music")
    .setExecute(
        async (client, inter) => {
            try {
                await play.execute(client, inter)

            } catch (err) {
                logger.error(`[/play] Error no controlado en el comando:`, err)
            }
        })
    .setAutoComplete(
        async (client, inter) => {
            try {
                await play.autocomplete(client, inter)
            } catch (err) {
                logger.error(`[/play] Error en el autocompletado:`, err)
            }

        }
    )
    .addStringOption(
        o => o
            .setName("search").setNameLocalizations(esLocales(es.names.search))
            .setDescription(en.commands.search).setDescriptionLocalizations(esLocales(es.commands.search))
            .setAutocomplete(true)
            .setRequired(true))
