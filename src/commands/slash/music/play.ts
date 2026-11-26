import logger from "../../../core/client/logger.js"
import { es } from "../../../i18n/index.js";
import { SlashCommand } from "../../../core/classes/SlashCommand.js"
import { PlaybackStrategy } from "../../../core/strategy/PlaybackStrategy.js"



class Play extends PlaybackStrategy { }

const play = new Play()

export default new SlashCommand()
    .setName("play")
    .setDescription(es.commands.play)
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
            .setName("busqueda")
            .setDescription(es.commands.search)
            .setAutocomplete(true)
            .setRequired(true))
