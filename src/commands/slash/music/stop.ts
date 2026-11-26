import logger from "../../../core/client/logger.js";
import { es, textsFor } from "../../../i18n/index.js";
import { SlashCommand } from "../../../core/classes/SlashCommand.js";
import { deleteAfterTimer, EmptyEmbed, replyEmbed } from "../../../utils/messages.js";
import { requireListener } from "../../../core/music/player.js";

export default new SlashCommand()
    .setName("stop")
    .setDescription(es.commands.stop)
    .setCategory("Music")
    .setExecute(
        async (client, inter) => {
            const t = await textsFor(client, inter.guildId);
            const player = await requireListener(client, inter);
            if (!player) return;

            // stop() en moonlink 5 no vacía la cola ni dispara queueEnd: destroy desconecta y limpia todo
            logger.info(`[Stop] ${inter.user.username} detuvo la reproducción con /stop en ${inter.guild?.name}`);
            await player.destroy("stop");

            return inter.reply({
                embeds: [
                    EmptyEmbed()
                        .setAuthor({ name: t.stop.author, iconURL: inter.user.displayAvatarURL() })
                        .setDescription(t.stop.done)
                        .setColor("Green")
                ]
            });
        }
    )