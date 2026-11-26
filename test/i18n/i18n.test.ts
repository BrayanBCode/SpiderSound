import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { en, es, isLang, langFromLocale } from "../../src/i18n/index.js";

describe("idioma del servidor", () => {
    test("sin elegir: español si el Discord del servidor está en español, si no inglés", () => {
        expect(langFromLocale("es-ES")).toBe("es");
        expect(langFromLocale("es-419")).toBe("es");
        expect(langFromLocale("en-US")).toBe("en");
        expect(langFromLocale("pt-BR")).toBe("en");
        expect(langFromLocale(undefined)).toBe("en");
    });

    test("solo se aceptan los idiomas que existen", () => {
        expect(isLang("es")).toBe(true);
        expect(isLang("en")).toBe(true);
        expect(isLang("fr")).toBe(false);
        expect(isLang(null)).toBe(false);
    });

    test("los diccionarios con claves libres tienen las mismas en los dos idiomas", () => {
        expect(Object.keys(en.loop.labels).sort()).toEqual(Object.keys(es.loop.labels).sort());
        expect(Object.keys(en.language.names).sort()).toEqual(Object.keys(es.language.names).sort());
    });
});

// Discord rechaza el registro de todos los comandos si uno solo no cumple estos límites
const NAME = /^[-_\p{Ll}\p{Lo}\p{N}]{1,32}$/u;

type Json = { name: string; description?: string; name_localizations?: Record<string, string | null> | null; description_localizations?: Record<string, string | null> | null; options?: Json[]; choices?: Json[] };

function problems(o: Json, path: string, isChoice = false): string[] {
    const out: string[] = [];
    const names = [o.name, ...Object.values(o.name_localizations ?? {})].filter(Boolean) as string[];
    const descriptions = [o.description, ...Object.values(o.description_localizations ?? {})].filter(d => d !== undefined) as string[];
    for (const n of names) {
        // Las opciones de una lista (choices) pueden tener mayúsculas y espacios, hasta 100 caracteres
        if (isChoice ? n.length > 100 : !NAME.test(n)) out.push(`${path}: nombre inválido "${n}"`);
    }
    for (const d of descriptions) if (d.length < 1 || d.length > 100) out.push(`${path}: descripción de ${d.length} caracteres "${d}"`);
    for (const opt of o.options ?? []) out.push(...problems(opt, `${path} ${opt.name}`));
    for (const ch of o.choices ?? []) out.push(...problems(ch, `${path} [${ch.name}]`, true));
    return out;
}

describe("comandos", async () => {
    const commands: Json[] = [];
    for await (const file of new Glob("src/commands/**/*.ts").scan(".")) {
        const mod = await import(`../../${file}`);
        commands.push(mod.default.toJSON());
    }

    test("se cargaron todos", () => {
        expect(commands.length).toBeGreaterThanOrEqual(21);
    });

    test("nombres y descripciones dentro de los límites de Discord, en los dos idiomas", () => {
        expect(commands.flatMap(c => problems(c, `/${c.name}`))).toEqual([]);
    });

    test("los nombres base son en inglés y cada traducción al español es distinta del base", () => {
        const names = commands.map(c => c.name);
        expect(names).toContain("favorites");
        expect(names).toContain("language");
        expect(names).not.toContain("favoritos");
        const fav = commands.find(c => c.name === "favorites")!;
        expect(fav.name_localizations?.["es-ES"]).toBe("favoritos");
        expect(fav.options?.map(o => o.name).sort()).toEqual(["add", "play", "view"]);
    });
});
