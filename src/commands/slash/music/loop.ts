import { SlashCommand } from "../../../core/classes/SlashCommand.js";
import { en, es, esLocales, textsFor } from "../../../i18n/index.js";
import { EmptyEmbed } from "../../../utils/messages.js";
import { requireListener } from "../../../core/music/player.js";
import { loopMessage, nextLoopMode } from "../../../core/music/timing.js";
import logger from "../../../core/client/logger.js";

export default new SlashCommand()
    .setName("loop")
    .setDescription(en.commands.loop).setDescriptionLocalizations(esLocales(es.commands.loop))
    .setCategory("Music")
    .setExecute(
        async (client, inter) => {
            const t = await textsFor(client, inter.guildId);
            const player = await requireListener(client, inter);
            if (!player) return;

            const mode = (inter.options.getString("mode") as "off" | "track" | "queue" | null) ?? nextLoopMode(player.loop);
            player.setLoop(mode);
            logger.info(`[/loop] ${inter.user.username} puso el loop en ${mode} en ${inter.guild.name}`);

            return inter.reply({ embeds: [EmptyEmbed().setDescription(loopMessage(mode, t)).setColor("Green")] });
        }
    )
    .addStringOption(o => o
        .setName("mode").setNameLocalizations(esLocales(es.names.mode))
        .setDescription(en.commands.loopMode).setDescriptionLocalizations(esLocales(es.commands.loopMode))
        .setRequired(false)
        .addChoices(
            { name: en.loop.choices.off, name_localizations: esLocales(es.loop.choices.off), value: "off" },
            { name: en.loop.choices.track, name_localizations: esLocales(es.loop.choices.track), value: "track" },
            { name: en.loop.choices.queue, name_localizations: esLocales(es.loop.choices.queue), value: "queue" },
        ))
