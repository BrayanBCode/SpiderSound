import { SlashCommand } from "../../../core/classes/SlashCommand.js";
import { es, textsFor } from "../../../i18n/index.js";
import { deleteAfterTimer, EmptyEmbed, replyEmbed } from "../../../utils/messages.js";
import { requireListener } from "../../../core/music/player.js";
import logger from "../../../core/client/logger.js";

export default new SlashCommand()
    .setName("pause")
    .setDescription(es.commands.pause)
    .setCategory("Music")
    .setExecute(
        async (client, inter) => {
            const t = await textsFor(client, inter.guildId);
            const player = await requireListener(client, inter);
            if (!player) return;

            if (!player.current || player.paused)
                return deleteAfterTimer(await replyEmbed({
                    interaction: inter,
                    embed: EmptyEmbed()
                        .setDescription(player.paused ? t.pause.alreadyPaused : t.common.nothingPlaying)
                        .setColor(player.paused ? "Yellow" : "Red"),
                    ephemeral: true,
                }), 15000);

            await player.pause();
            logger.info(`[/pause] ${inter.user.username} pausó la reproducción en ${inter.guild.name}`);

            deleteAfterTimer(await replyEmbed({
                interaction: inter,
                embed: EmptyEmbed()
                    .setAuthor({ name: t.pause.author, iconURL: inter.user.displayAvatarURL() })
                    .setDescription(t.pause.done)
                    .setColor("Green")
            }), 5000);
        })
