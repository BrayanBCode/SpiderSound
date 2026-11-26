import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseConfig } from "../../src/core/config.js";

const yaml = `
discord:
  clientId: "123"
  ownerId: "456"
  devGuildId: ""
lavalink:
  host: lavalink.local
  port: 2444
  secure: true
`;

describe("parseConfig", () => {
    test("lee el archivo", () => {
        const c = parseConfig(yaml, {});
        expect(c.discord).toEqual({ clientId: "123", ownerId: "456", devGuildId: "" });
        expect(c.lavalink).toEqual({ host: "lavalink.local", port: 2444, secure: true });
    });

    test("sin archivo usa el .env viejo (compatibilidad) o los valores por defecto", () => {
        expect(parseConfig(undefined, { botClientID: "9", lavalinkPort: "2333", lavalinkSecure: "false" })).toEqual({
            discord: { clientId: "9", ownerId: "", devGuildId: "" },
            lavalink: { host: "localhost", port: 2333, secure: false },
        });
        expect(parseConfig(undefined, {}).lavalink).toEqual({ host: "localhost", port: 2333, secure: false });
    });

    test("una variable de entorno le gana al archivo; una vacía no", () => {
        const c = parseConfig(yaml, { lavalinkHost: "lavalink", ownerID: "" });
        expect(c.lavalink.host).toBe("lavalink");
        expect(c.discord.ownerId).toBe("456");
    });

    test("un ID sin comillas que YAML redondearía da error; uno chico se acepta", () => {
        expect(() => parseConfig("discord:\n  clientId: 1234567890123456789\n", {})).toThrow("comillas");
        expect(parseConfig("discord:\n  clientId: 42\n", {}).discord.clientId).toBe("42");
    });

    test("errores claros con valores mal puestos", () => {
        expect(() => parseConfig("lavalink:\n  port: abc\n", {})).toThrow("lavalink.port");
        expect(() => parseConfig("lavalink:\n  secure: si\n", {})).toThrow("lavalink.secure");
        expect(() => parseConfig("discord: [1, 2]\nlavalink: {}\n", {})).toThrow("sangría");
        expect(() => parseConfig("- a\n- b\n", {})).toThrow("secciones");
        expect(() => parseConfig("discord:\n  clientId: [\n", {})).toThrow("YAML");
    });

    test("el archivo de ejemplo es válido", () => {
        const c = parseConfig(readFileSync("config/config.example.yml", "utf8"), {});
        expect(c.lavalink).toEqual({ host: "localhost", port: 2333, secure: false });
    });
});
