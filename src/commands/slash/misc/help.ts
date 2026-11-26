import { ApplicationCommandOptionType, MessageFlags } from "discord.js";
import { en, es, esLocales, guildLang, languages, type Lang } from "../../../i18n/index.js";
import { SlashCommand } from "../../../core/classes/SlashCommand.js";
import logger from "../../../core/client/logger.js";
import { EmptyEmbed } from "../../../utils/messages.js";
import { packLines } from "../../../utils/tools.js";

/** Secciones en el orden en que se muestran (las mismas que la página de comandos de la web) */
const SECTIONS: { title: keyof typeof es.help.sections; commands: string[] }[] = [
    { title: "playback", commands: ["play", "playnext", "forceplay", "pause", "resume", "stop"] },
    { title: "queue", commands: ["queue", "skip", "move", "remove", "shuffle", "clear"] },
    { title: "control", commands: ["loop", "volume", "forward", "backward"] },
    { title: "saved", commands: ["favorites", "playlist"] },
];
const DESCRIPTION_MAX = 4096;
const MESSAGE_MAX = 6000;

type Localized = { name: string; description: string; name_localizations?: Record<string, string | null> | null; description_localizations?: Record<string, string | null> | null };

/** Nombre y descripción en el idioma pedido: el base es inglés, el español sale de las traducciones de Discord */
const inLang = (o: Localized, lang: Lang) => lang === "en" ? o : {
    name: o.name_localizations?.["es-ES"] ?? o.name,
    description: o.description_localizations?.["es-ES"] ?? o.description,
};

/** Líneas "/comando sub — descripción" de un comando (una por subcomando si tiene) */
function commandLines(cmd: SlashCommand, lang: Lang): string[] {
    const json = cmd.toJSON();
    const { name, description } = inLang(json, lang);
    const subs = (json.options ?? []).filter(o => o.type === ApplicationCommandOptionType.Subcommand);
    if (!subs.length) return [`**/${name}** — ${description}`];
    return subs.map(sub => {
        const s = inLang(sub, lang);
        return `**/${name} ${s.name}** — ${s.description}`;
    });
}

export default new SlashCommand()
    .setName("help")
    .setDescription(en.commands.help).setDescriptionLocalizations(esLocales(es.commands.help))
    .setCategory("Misc")
    .setExecute(async (client, inter) => {
        try {
            const { lang } = await guildLang(client, inter.guildId);
            const t = languages[lang];
            // Se arma con los comandos cargados (descripción incluida): solo el orden y las secciones están acá
            const loaded = client.slashCommands;
            const placed = new Set(SECTIONS.flatMap(s => s.commands));
            const others = [...loaded.values()].filter(cmd => !placed.has(cmd.name)).sort((a, b) => a.name.localeCompare(b.name));

            const sections = [
                ...SECTIONS.map(s => ({ title: t.help.sections[s.title], cmds: s.commands.flatMap(name => loaded.get(name) ?? []) })),
                // Un comando nuevo que no está en ninguna sección aparece igual, acá
                { title: t.help.sections.others, cmds: others },
            ].filter(s => s.cmds.length);

            const lines = sections.flatMap(s => [`### ${s.title}`, ...s.cmds.flatMap(cmd => commandLines(cmd, lang))]);

            // Discord: 4096 caracteres por descripción y 6000 entre todos los embeds del mensaje
            const descriptions: string[] = [];
            // El autor y el pie también cuentan para el límite del mensaje
            let total = t.help.author.length + t.help.footer.length;
            for (const text of packLines(lines, DESCRIPTION_MAX)) {
                if (total + text.length > MESSAGE_MAX) {
                    logger.warn(`[/help] La lista no entra en un mensaje: se mostraron ${descriptions.length} partes`);
                    break;
                }
                descriptions.push(text);
                total += text.length;
            }

            const embeds = descriptions.map(text => EmptyEmbed().setDescription(text).setColor(0x1DB954));
            embeds[0].setAuthor({ name: t.help.author, iconURL: client.user?.displayAvatarURL() });
            embeds[embeds.length - 1].setFooter({ text: t.help.footer });

            return inter.reply({ embeds, flags: MessageFlags.Ephemeral });
        } catch (err) {
            logger.error(`[/help] Error no controlado en el comando:`, err);
        }
    })
