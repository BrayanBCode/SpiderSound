import type { BClient } from "../core/client/BClient.js"
import es, { type Texts } from "./es.js"

export type { Texts }
export { es }

/** Todos los idiomas (para reconocer textos del bot en cualquiera, ej. el mensaje "Escuchando" de un proceso anterior) */
export const languages = { es }

/**
 * Textos en el idioma del servidor. Por ahora siempre español: el inglés y `/language` vienen después
 * (etapa 10 del roadmap). Ya es asíncrona porque el idioma elegido va a leerse de la base.
 */
export async function textsFor(_client: BClient, _guildId: string | null | undefined): Promise<Texts> {
    return es
}
