import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { en, es, esLocales, textsFor } from "../../../i18n/index.js";
import { SlashCommand } from "../../../core/classes/SlashCommand.js";
import { EmptyEmbed } from "../../../utils/messages.js";
import { requireListener } from "../../../core/music/player.js";
import { DEFAULT_VOLUME } from "../../../core/client/BClient.js";
import logger from "../../../core/client/logger.js";

export default new SlashCommand()
    .setName("volume")
    .setDescription(en.commands.volume).setDescriptionLocalizations(esLocales(es.commands.volume))
    .setCategory("Music")
    .setExecute(
        async (client, inter) => {
            const t = await textsFor(client, inter.guildId);
            const level = inter.options.getInteger("level");
            const asDefault = inter.options.getBoolean("default") ?? false;
            const saved = await client.db.getGuildVolume(inter.guildId);

            // Sin nivel: solo informa (efímero, no molesta al resto)
            if (level === null) {
                const player = client.getPlayer(inter.guildId);
                const lines = [
                    player ? t.volume.current(player.volume) : null,
                    t.volume.serverDefault(saved ?? DEFAULT_VOLUME, saved === null),
                ].filter(Boolean);
                return inter.reply({ embeds: [EmptyEmbed().setDescription(lines.join("\n")).setColor("Blue")], flags: MessageFlags.Ephemeral });
            }

            if (asDefault) {
                if (!inter.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
                    logger.info(`[/volume] ${inter.user.username} quiso cambiar el volumen por defecto sin permiso en ${inter.guild.name}`);
                    return inter.reply({
                        embeds: [EmptyEmbed().setDescription(t.volume.noPermission).setColor("Red")],
                        flags: MessageFlags.Ephemeral,
                    });
                }

                await client.db.setGuildVolume(inter.guildId, level);
                logger.info(`[/volume] ${inter.user.username} puso el volumen por defecto en ${level}% (antes ${saved ?? `${DEFAULT_VOLUME} del bot`}) en ${inter.guild.name}`);

                // También ahora, si suena algo y quien lo pide está escuchando (misma regla que el resto de los controles)
                const player = client.getPlayer(inter.guildId);
                const applyNow = !!player && inter.member.voice.channelId === player.voiceChannelId;
                if (applyNow) player.setVolume(level);

                return inter.reply({
                    embeds: [EmptyEmbed()
                        .setDescription(t.volume.defaultSet(level, applyNow))
                        .setColor("Green")],
                });
            }

            const player = await requireListener(client, inter);
            if (!player) return;

            const before = player.volume;
            player.setVolume(level);
            logger.info(`[/volume] ${inter.user.username} cambió el volumen de ${before}% a ${level}% en ${inter.guild.name}`);

            return inter.reply({
                embeds: [EmptyEmbed()
                    .setDescription(t.volume.set(level, saved ?? DEFAULT_VOLUME))
                    .setColor("Green")],
            });
        }
    )
    .addIntegerOption(o => o
        .setName("level").setNameLocalizations(esLocales(es.names.level))
        .setDescription(en.commands.volumeLevel).setDescriptionLocalizations(esLocales(es.commands.volumeLevel))
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(false))
    .addBooleanOption(o => o
        .setName("default").setNameLocalizations(esLocales(es.names.default))
        .setDescription(en.commands.volumeDefault).setDescriptionLocalizations(esLocales(es.commands.volumeDefault))
        .setRequired(false))
