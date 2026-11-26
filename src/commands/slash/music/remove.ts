import { SlashCommand } from "../../../core/classes/SlashCommand.js";
import { es, textsFor } from "../../../i18n/index.js";
import { deleteAfterTimer, EmptyEmbed, replyEmbed } from "../../../utils/messages.js";
import { requireListener, respondQueuePositions } from "../../../core/music/player.js";
import logger from "../../../core/client/logger.js";

export default new SlashCommand()
    .setName("remove")
    .setDescription(es.commands.remove)
    .setCategory("Music")
    .setExecute(
        async (client, inter) => {
            const t = await textsFor(client, inter.guildId);
            const player = await requireListener(client, inter);
            if (!player) return;

            const pos = inter.options.getNumber("position", true); // empieza en 1, como en /queue
            const track = player.queue.get(pos - 1);

            if (!track)
                return deleteAfterTimer(await replyEmbed({
                    interaction: inter,
                    embed: EmptyEmbed()
                        .setDescription(player.queue.size ? t.common.noTrackAt(pos) : t.common.emptyQueue)
                        .setColor("Red"),
                    ephemeral: true,
                }), 15000);

            player.queue.remove(pos - 1);
            logger.info(`[/remove] ${inter.user.username} quitó "${track.title}" (posición ${pos}) en ${inter.guild.name}`);

            return inter.reply({
                embeds: [
                    EmptyEmbed()
                        .setAuthor({ name: t.remove.removed, iconURL: inter.user.displayAvatarURL() })
                        .addFields([
                            { name: t.common.title, value: `[${track.title}](${track.uri})`, inline: true },
                            { name: t.common.artist, value: track.author, inline: true },
                        ])
                        .setThumbnail(track.artworkUrl ?? null)
                        .setFooter({ text: t.remove.requestedBy(inter.user.tag) })
                        .setColor("Green")
                ]
            });
        }
    )
    .setAutoComplete((client, inter) => respondQueuePositions(client, inter))
    .addNumberOption(
        o => o
            .setName("position")
            .setDescription(es.commands.removePosition)
            .setAutocomplete(true)
            .setRequired(true))
