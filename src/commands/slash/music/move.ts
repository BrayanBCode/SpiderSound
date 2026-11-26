import { SlashCommand } from "../../../core/classes/SlashCommand.js";
import { en, es, esLocales, textsFor } from "../../../i18n/index.js";
import { deleteAfterTimer, EmptyEmbed, replyEmbed } from "../../../utils/messages.js";
import { getRequesterInfo, requireListener, respondQueuePositions, trackActionEmbed } from "../../../core/music/player.js";
import logger from "../../../core/client/logger.js";

export default new SlashCommand()
    .setName("move")
    .setDescription(en.commands.move).setDescriptionLocalizations(esLocales(es.commands.move))
    .setCategory("Music")
    .setExecute(
        async (client, inter) => {
            const t = await textsFor(client, inter.guildId);
            const player = await requireListener(client, inter);
            if (!player) return;

            // Posiciones desde 1, como en /queue
            const from = inter.options.getNumber("from", true);
            const to = inter.options.getNumber("to", true);
            const track = player.queue.get(from - 1);
            const size = player.queue.size;

            if (!track || to < 1 || to > size || from === to)
                return deleteAfterTimer(await replyEmbed({
                    interaction: inter,
                    embed: EmptyEmbed()
                        .setDescription(!size ? t.move.emptyQueue
                            : from === to ? t.move.samePosition
                            : t.move.range(size))
                        .setColor("Red"),
                    ephemeral: true,
                }), 15000);

            player.queue.move(from - 1, to - 1);
            logger.info(`[/move] ${inter.user.username} movió "${track.title}" de ${from} a ${to} en ${inter.guild.name}`);

            return inter.reply({ embeds: [trackActionEmbed(t.move.moved, track, getRequesterInfo(inter.member, t.common.unknown), t, t.move.detail(from, to))] });
        }
    )
    .setAutoComplete((client, inter) => respondQueuePositions(client, inter))
    .addNumberOption(o => o.setName("from").setNameLocalizations(esLocales(es.names.from)).setDescription(en.commands.moveFrom).setDescriptionLocalizations(esLocales(es.commands.moveFrom)).setAutocomplete(true).setRequired(true))
    .addNumberOption(o => o.setName("to").setNameLocalizations(esLocales(es.names.to)).setDescription(en.commands.moveTo).setDescriptionLocalizations(esLocales(es.commands.moveTo)).setAutocomplete(true).setRequired(true))
