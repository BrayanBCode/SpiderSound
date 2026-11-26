import { deleteAfterTimer, EmptyEmbed, replyEmbed } from "../../../utils/messages.js";
import { es, textsFor } from "../../../i18n/index.js";
import { requireListener } from "../../../core/music/player.js";
import { SlashCommand } from "../../../core/classes/SlashCommand.js";

export default new SlashCommand()
    .setName("clear")
    .setDescription(es.commands.clear)
    .setCategory("Music")

    .setExecute(
        async (client, inter) => {
            const t = await textsFor(client, inter.guildId);
            const player = await requireListener(client, inter);
            if (!player) return;

            if (!player.queue.size)
                return deleteAfterTimer(
                    await replyEmbed({
                        interaction: inter,
                        embed: EmptyEmbed()
                            .setDescription(t.common.emptyQueue)
                            .setColor("Red"),
                        ephemeral: true,
                    }), 15000);

            player.queue.clear();

            return inter.reply({
                embeds: [
                    EmptyEmbed()
                        .setAuthor({ name: t.clear.author, iconURL: inter.user.displayAvatarURL() })
                        .setDescription(t.clear.done)
                        .setColor("Green")
                ]
            });
        }
    )                               