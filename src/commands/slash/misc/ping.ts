import { MessageFlags } from "discord.js";
import { es, textsFor } from "../../../i18n/index.js";
import { SlashCommand } from "../../../core/classes/SlashCommand.js";
import logger from "../../../core/client/logger.js";
import { EmptyEmbed } from "../../../utils/messages.js";

/** Verde, amarillo o rojo según los ms */
const color = (ms: number) => ms < 200 ? "Green" : ms < 500 ? "Yellow" : "Red";

export default new SlashCommand()
    .setName("ping")
    .setDescription(es.commands.ping)
    .setCategory("Misc")
    .setExecute(async (client, inter) => {
        try {
            const t = await textsFor(client, inter.guildId);
            const { resource } = await inter.reply({ content: t.ping.measuring, flags: MessageFlags.Ephemeral, withResponse: true });
            // Desde que el usuario mandó el comando hasta que llegó la respuesta del bot
            const roundtrip = (resource?.message?.createdTimestamp ?? Date.now()) - inter.createdTimestamp;
            // -1 mientras el shard todavía no midió su primer latido
            const gateway = client.ws.ping;

            logger.debug(`[/ping] ${inter.user.username}: respuesta ${roundtrip} ms, gateway ${gateway} ms`);
            return inter.editReply({
                content: "",
                embeds: [EmptyEmbed()
                    .setDescription(t.ping.result(roundtrip, gateway))
                    .setColor(color(Math.max(roundtrip, gateway)))],
            });
        } catch (err) {
            logger.error(`[/ping] Error no controlado en el comando:`, err);
        }
    })
