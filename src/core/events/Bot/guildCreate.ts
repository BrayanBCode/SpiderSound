import { ChannelType, EmbedBuilder, Guild, PermissionFlagsBits, TextChannel } from "discord.js";
import { en, es, guildLang } from "../../../i18n/index.js";
import { DEvent } from "../../classes/events/DEvent.js";
import { BClient } from "../../client/BClient.js";
import { notifyDev } from "../../client/devNotifier.js";
import { updatePresence } from "../../client/presence.js";
import logger from "../../client/logger.js";

/** El bot entró a un servidor nuevo (los que ya tenía al arrancar no disparan este evento) */
export default class GuildCreate extends DEvent<'guildCreate'> {
    constructor() {
        super('guildCreate');
    }

    execute(client: BClient, guild: Guild) {
        logger.info(`[Servidores] Entró a "${guild.name}" (${guild.id}, ${guild.memberCount} miembros, dueño ${guild.ownerId}). Servidores en este shard: ${client.guilds.cache.size}`);
        notifyDev(new EmbedBuilder()
            .setTitle("➕ Entró a un servidor")
            .setColor("Green")
            .setThumbnail(guild.iconURL())
            .setDescription(`**${guild.name}** (\`${guild.id}\`)\n${guild.memberCount} miembros · dueño <@${guild.ownerId}>\nServidores en este shard: **${client.guilds.cache.size}**`));
        updatePresence(client).catch(() => undefined);
        sendLanguageNotice(client, guild).catch(err => logger.warn(`[Idioma] No se pudo mandar el aviso de idioma en "${guild.name}": ${err}`));
    }
}

/**
 * Al entrar a un servidor: dice en los dos idiomas en cuál va a responder (el de Discord del servidor) y cómo cambiarlo.
 * Discord pone en-US a los servidores que no son Comunidad, así que muchos en español arrancan en inglés.
 * Si ya eligieron uno antes (el bot vuelve a un servidor), no se manda.
 */
async function sendLanguageNotice(client: BClient, guild: Guild) {
    const { lang, chosen } = await guildLang(client, guild.id);
    if (chosen) return;

    // El canal de bienvenida del servidor o, si no se puede escribir ahí, el primer canal de texto donde sí
    const me = guild.members.me;
    const canSend = (c: TextChannel) => !!me && c.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]);
    const channel = [guild.systemChannel, ...guild.channels.cache.filter(c => c.type === ChannelType.GuildText).sort((a, b) => (a as TextChannel).position - (b as TextChannel).position).values()]
        .find((c): c is TextChannel => !!c && canSend(c as TextChannel));
    if (!channel) {
        logger.info(`[Idioma] "${guild.name}": no hay un canal donde pueda escribir, no se manda el aviso de idioma`);
        return;
    }

    // El idioma del servidor primero
    const lines = [es.language.notice(es.language.names[lang]), en.language.notice(en.language.names[lang])];
    if (lang === "en") lines.reverse();
    await channel.send({ embeds: [new EmbedBuilder().setDescription(lines.join("\n\n")).setColor(0x1DB954)] });
    logger.info(`[Idioma] "${guild.name}": aviso de idioma (${lang}, el de Discord: ${guild.preferredLocale}) en #${channel.name}`);
}
