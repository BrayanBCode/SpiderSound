import { SlashCommand } from "../../../core/classes/SlashCommand.js"
import { es, textsFor } from "../../../i18n/index.js";
import { EmptyEmbed, deleteAfterTimer, replyEmbed } from "../../../utils/messages.js";
import { getRequesterInfo, requireListener, respondQueuePositions, skipTrack, trackActionEmbed } from "../../../core/music/player.js";
import logger from "../../../core/client/logger.js";


export default new SlashCommand()
    .setName("skip")
    .setDescription(es.commands.skip)
    .setCategory("Music")
    .setExecute(
        async (client, inter) => {
            const t = await textsFor(client, inter.guildId);
            const player = await requireListener(client, inter);
            if (!player) return;


            // Con loop de cola, saltar la única canción la vuelve a poner desde el principio
            if (!player.queue.size && player.loop !== "queue") {
                return deleteAfterTimer(
                    await replyEmbed({
                        interaction: inter,
                        embed: EmptyEmbed()
                            .setDescription(t.common.emptyQueue)
                            .setColor("Red"),
                        ephemeral: true,
                    }), 15000);
            }

            const pos = inter.options.getNumber("position") ?? 1; // empieza en 1, como en /queue

            const track = pos >= 1 ? await skipTrack(player, pos - 1) : undefined;

            if (!track)
                return deleteAfterTimer(
                    await replyEmbed({
                        interaction: inter,
                        embed: EmptyEmbed()
                            .setDescription(t.common.noTrackAt(pos))
                            .setColor("Red"),
                        ephemeral: true,
                    }), 15000);

            logger.info(`[/skip] ${inter.user.username} saltó a "${track.title}" (posición ${pos}) en ${inter.guild.name}`);

            const header = pos > 1 ? t.skip.jumped(pos) : t.skip.next;
            return inter.reply({ embeds: [trackActionEmbed(header, track, getRequesterInfo(inter.member, t.common.unknown), t)] });
        }
    )
    .setAutoComplete((client, inter) => respondQueuePositions(client, inter))
    .addNumberOption(
        o => o
            .setName("position")
            .setDescription(es.commands.skipPosition)
            .setAutocomplete(true)
            .setRequired(false))