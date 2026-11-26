import type { LocalizationMap } from "discord.js"
import type { BClient } from "../core/client/BClient.js"
import logger from "../core/client/logger.js"
import en from "./en.js"
import es, { type Texts } from "./es.js"

export type { Texts }
export { en, es }

/** Todos los idiomas (para reconocer textos del bot en cualquiera, ej. el mensaje "Escuchando" de un proceso anterior) */
export const languages = { es, en }
export type Lang = keyof typeof languages

export const isLang = (value: unknown): value is Lang => typeof value === "string" && value in languages

/** Idioma de un servidor que nunca eligió uno: el de Discord (`preferredLocale`). Discord pone en-US a los que no son Comunidad */
export const langFromLocale = (locale: string | undefined): Lang => locale?.startsWith("es") ? "es" : "en"

/**
 * Idioma elegido con /language, leído de la base. Se guarda un rato en memoria para no consultar en cada interacción.
 * shortcut: si el bot corre en dos PCs, un cambio hecho en la otra se ve recién cuando vence la caché (CACHE_MS).
 */
const CACHE_MS = 5 * 60 * 1000
const cache = new Map<string, { lang: Lang | null; until: number }>()

async function savedLang(client: BClient, guildId: string): Promise<Lang | null> {
    const hit = cache.get(guildId)
    if (hit && hit.until > Date.now()) return hit.lang
    try {
        const value = await client.db.getGuildLanguage(guildId)
        const lang = isLang(value) ? value : null
        cache.set(guildId, { lang, until: Date.now() + CACHE_MS })
        return lang
    } catch (err) {
        // Sin base el bot sigue: se usa el idioma de Discord y se vuelve a probar en la próxima interacción
        logger.warn(`[Idioma] No se pudo leer el idioma de ${guildId}, se usa el de Discord: ${(err as Error).message}`)
        return null
    }
}

/** Guarda el idioma del servidor y actualiza la caché de este proceso */
export async function setGuildLang(client: BClient, guildId: string, lang: Lang) {
    await client.db.setGuildLanguage(guildId, lang)
    cache.set(guildId, { lang, until: Date.now() + CACHE_MS })
}

/** Idioma del servidor: el elegido con /language o, si no hay, el de Discord. `chosen` dice si lo eligieron */
export async function guildLang(client: BClient, guildId: string | null | undefined): Promise<{ lang: Lang; chosen: boolean }> {
    if (!guildId) return { lang: "es", chosen: false }
    const saved = await savedLang(client, guildId)
    if (saved) return { lang: saved, chosen: true }
    return { lang: langFromLocale(client.guilds.cache.get(guildId)?.preferredLocale), chosen: false }
}

/** Textos en el idioma del servidor */
export async function textsFor(client: BClient, guildId: string | null | undefined): Promise<Texts> {
    return languages[(await guildLang(client, guildId)).lang]
}

/** Las traducciones al español para Discord (nombres y descripciones de comandos): los dos locales de español que tiene */
export const esLocales = (text: string): LocalizationMap => ({ "es-ES": text, "es-419": text })
