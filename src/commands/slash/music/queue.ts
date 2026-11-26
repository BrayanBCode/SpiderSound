import { QueuePaginator } from "../../../core/classes/music/QueuePaginator.js";
import { es, textsFor } from "../../../i18n/index.js";
import { SlashCommand } from "../../../core/classes/SlashCommand.js";
import { MessageFlags } from "discord.js";
import { EmptyEmbed } from "../../../utils/messages.js";

export default new SlashCommand()
    .setName("queue")
    .setDescription(es.commands.queue)
    .setCategory("Music")
    .setExecute(
        async (client, inter) => {
            if (!inter.guildId) return;

            const player = client.getPlayer(inter.guildId);

            if (!player || (!player.current && player.queue.tracks.length === 0)) return inter.reply({
                embeds: [
                    EmptyEmbed()
                        .setDescription((await textsFor(client, inter.guildId)).queue.empty)
                ],
                flags: MessageFlags.Ephemeral
            });

            await new QueuePaginator({ interaction: inter, player }).reply()
        }
    )