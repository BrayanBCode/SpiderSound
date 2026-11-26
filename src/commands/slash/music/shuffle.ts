import { SlashCommand } from "../../../core/classes/SlashCommand.js";
import { es, textsFor } from "../../../i18n/index.js";
import { deleteAfterTimer, EmptyEmbed, replyEmbed } from "../../../utils/messages.js";
import { requireListener } from "../../../core/music/player.js";
import logger from "../../../core/client/logger.js";

export default new SlashCommand()
    .setName("shuffle")
    .setDescription(es.commands.shuffle)
    .setCategory("Music")
    .setExecute(
        async (client, inter) => {
            const t = await textsFor(client, inter.guildId);
            const player = await requireListener(client, inter);
            if (!player) return;

            if (player.queue.size < 2)
                return deleteAfterTimer(await replyEmbed({
                    interaction: inter,
                    embed: EmptyEmbed().setDescription(t.common.needTwoToShuffle).setColor("Yellow"),
                    ephemeral: true,
                }), 15000);

            // player.shuffle (no queue.shuffle): emite playerTriggeredShuffle y el PlayerMessage actualiza "Siguiente"
            player.shuffle();
            logger.info(`[/shuffle] ${inter.user.username} mezcló ${player.queue.size} canciones en ${inter.guild.name}`);

            return inter.reply({ embeds: [EmptyEmbed().setDescription(t.shuffle.done(player.queue.size)).setColor("Green")] });
        }
    )
