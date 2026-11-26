import { SlashCommand } from "../../../core/classes/SlashCommand.js";
import { es, textsFor } from "../../../i18n/index.js";
import { EmptyEmbed } from "../../../utils/messages.js";
import { requireListener, seekRelative } from "../../../core/music/player.js";
import logger from "../../../core/client/logger.js";

export default new SlashCommand()
    .setName("forward")
    .setDescription(es.commands.forward)
    .setCategory("Music")

    .setExecute(
        async (client, inter) => {
            const t = await textsFor(client, inter.guildId);
            const seconds = inter.options.getInteger("seconds") ?? 10;
            const player = await requireListener(client, inter);
            if (!player) return;

            if (!player.playing || !player.current)
                return inter.reply({
                    embeds: [
                        EmptyEmbed()
                            .setDescription(t.common.nothingPlaying)
                            .setColor("Red")
                    ],

                });



            await seekRelative(player, seconds * 1_000);
            logger.info(`[/forward] ${inter.user.username} movió la canción +${seconds}s en ${inter.guild.name}`);
            return inter.reply({
                embeds: [
                    EmptyEmbed()
                        .setDescription(t.seek.forward(seconds))
                        .setColor("Green")
                ]
            });
        }
    )

    .addIntegerOption(option =>
        option
            .setName("seconds")
            .setDescription(es.commands.forwardSeconds)
            .setMinValue(1)
            .setMaxValue(600)
            .setRequired(false)
    )