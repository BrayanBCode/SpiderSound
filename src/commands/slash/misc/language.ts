import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { SlashCommand } from "../../../core/classes/SlashCommand.js";
import logger from "../../../core/client/logger.js";
import { en, es, esLocales, guildLang, isLang, languages, setGuildLang } from "../../../i18n/index.js";
import { EmptyEmbed } from "../../../utils/messages.js";

export default new SlashCommand()
    .setName("language").setNameLocalizations(esLocales(es.names.language))
    .setDescription(en.commands.language).setDescriptionLocalizations(esLocales(es.commands.language))
    .setCategory("Misc")
    .setExecute(async (client, inter) => {
        const { lang, chosen } = await guildLang(client, inter.guildId);
        const t = languages[lang];
        try {
            const choice = inter.options.getString("language");

            // Sin elegir: solo informa (efímero, no molesta al resto)
            if (!isLang(choice))
                return inter.reply({
                    embeds: [EmptyEmbed().setDescription(t.language.current(t.language.names[lang], chosen)).setColor("Blue")],
                    flags: MessageFlags.Ephemeral,
                });

            // Misma regla que /volume default: cambia algo para todo el servidor
            if (!inter.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
                logger.info(`[/language] ${inter.user.username} quiso cambiar el idioma sin permiso en ${inter.guild.name}`);
                return inter.reply({ embeds: [EmptyEmbed().setDescription(t.language.noPermission).setColor("Red")], flags: MessageFlags.Ephemeral });
            }

            await setGuildLang(client, inter.guildId, choice);
            logger.info(`[/language] ${inter.user.username} cambió el idioma a ${choice} (antes ${lang}${chosen ? "" : ", el de Discord"}) en ${inter.guild.name}`);

            // La respuesta ya va en el idioma nuevo
            const next = languages[choice];
            return inter.reply({ embeds: [EmptyEmbed().setDescription(next.language.set(next.language.names[choice])).setColor("Green")] });
        } catch (err) {
            logger.error(`[/language] No se pudo cambiar el idioma en ${inter.guild.name}:`, err);
            await inter.reply({ embeds: [EmptyEmbed().setDescription(t.language.saveError).setColor("Red")], flags: MessageFlags.Ephemeral }).catch(() => undefined);
        }
    })
    .addStringOption(o => o
        .setName("language").setNameLocalizations(esLocales(es.names.language))
        .setDescription(en.commands.languageOption).setDescriptionLocalizations(esLocales(es.commands.languageOption))
        .setRequired(false)
        // Cada idioma con su propio nombre: así lo reconoce quien no entiende el otro
        .addChoices({ name: "Español", value: "es" }, { name: "English", value: "en" }));
