import { SlashCommand } from "../../../core/classes/SlashCommand.js";
import { es, textsFor } from "../../../i18n/index.js";
import { EmptyEmbed } from "../../../utils/messages.js";
import { requireListener } from "../../../core/music/player.js";
import { loopMessage, nextLoopMode } from "../../../core/music/timing.js";
import logger from "../../../core/client/logger.js";

export default new SlashCommand()
    .setName("loop")
    .setDescription(es.commands.loop)
    .setCategory("Music")
    .setExecute(
        async (client, inter) => {
            const t = await textsFor(client, inter.guildId);
            const player = await requireListener(client, inter);
            if (!player) return;

            const mode = (inter.options.getString("modo") as "off" | "track" | "queue" | null) ?? nextLoopMode(player.loop);
            player.setLoop(mode);
            logger.info(`[/loop] ${inter.user.username} puso el loop en ${mode} en ${inter.guild.name}`);

            return inter.reply({ embeds: [EmptyEmbed().setDescription(loopMessage(mode, t)).setColor("Green")] });
        }
    )
    .addStringOption(o => o
        .setName("modo")
        .setDescription(es.commands.loopMode)
        .setRequired(false)
        .addChoices(
            { name: es.loop.choices.off, value: "off" },
            { name: es.loop.choices.track, value: "track" },
            { name: es.loop.choices.queue, value: "queue" },
        ))
