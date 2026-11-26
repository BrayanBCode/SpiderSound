import { readFileSync, statSync } from "node:fs";

// Configuración que no es secreta (IDs, Lavalink, avisos): sale de config/config.yml.
// Los secretos (token, contraseñas, DATABASE_URL) siguen en el .env.
// Una variable de entorno con el nombre viejo le gana al archivo: así un .env de antes sigue andando
// y docker-compose puede fijar lavalinkHost=lavalink.

export const CONFIG_PATH = "config/config.yml";

export interface Config {
    discord: {
        /** Application ID del Developer Portal: registra los comandos y conecta Lavalink */
        clientId: string;
        /** Dueño del bot: ve el canal de avisos */
        ownerId: string;
        /** Servidor donde va #notificaciones-bot. Vacío = sin avisos */
        devGuildId: string;
    };
    lavalink: {
        host: string;
        port: number;
        secure: boolean;
    };
}

/** Variable de entorno (nombre viejo del .env) → dónde va en el archivo */
const ENV_KEYS = {
    botClientID: ["discord", "clientId"],
    ownerID: ["discord", "ownerId"],
    DEV_GUILD_ID: ["discord", "devGuildId"],
    lavalinkHost: ["lavalink", "host"],
    lavalinkPort: ["lavalink", "port"],
    lavalinkSecure: ["lavalink", "secure"],
} as const;

const str = (value: unknown, key: string): string => {
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value.trim();
    // Un ID de Discord sin comillas es un número demasiado grande: YAML le cambia los últimos dígitos sin avisar
    if (typeof value === "number") {
        if (!Number.isSafeInteger(value)) throw new Error(`[Config] ${key} tiene que ir entre comillas (ej. ${key.split(".").pop()}: "123456789012345678"): sin comillas el número se redondea`);
        return String(value);
    }
    throw new Error(`[Config] ${key} tiene que ser un texto (está como ${typeof value})`);
};

const port = (value: unknown): number => {
    const n = Number(value ?? 2333);
    if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`[Config] lavalink.port tiene que ser un número de puerto (está como ${JSON.stringify(value)})`);
    return n;
};

const bool = (value: unknown, key: string): boolean => {
    if (value === undefined || value === null || value === "") return false;
    if (typeof value === "boolean") return value;
    if (value === "true" || value === "false") return value === "true";
    throw new Error(`[Config] ${key} tiene que ser true o false (está como ${JSON.stringify(value)})`);
};

/**
 * Arma la configuración a partir del texto del archivo (o `undefined` si no hay) y las variables de entorno.
 * Lanza con un mensaje claro si el YAML está mal escrito o un valor no tiene el tipo esperado.
 */
export function parseConfig(fileText: string | undefined, env: Record<string, string | undefined> = process.env): Config {
    let file: any = {};
    if (fileText !== undefined) {
        try {
            file = Bun.YAML.parse(fileText) ?? {};
        } catch (err) {
            throw new Error(`[Config] ${CONFIG_PATH} no es un YAML válido: ${(err as Error).message}`);
        }
        if (typeof file !== "object" || Array.isArray(file)) throw new Error(`[Config] ${CONFIG_PATH} tiene que tener secciones (discord:, lavalink:)`);
    }

    for (const section of ["discord", "lavalink"]) {
        const value = file[section];
        if (value !== undefined && value !== null && (typeof value !== "object" || Array.isArray(value)))
            throw new Error(`[Config] ${section}: en ${CONFIG_PATH} tiene que tener sus opciones abajo, con sangría (ver config/config.example.yml)`);
    }

    // Lo del .env pisa lo del archivo
    for (const [envKey, [section, key]] of Object.entries(ENV_KEYS)) {
        const value = env[envKey];
        if (value === undefined || value === "") continue;
        file[section] = { ...(file[section] ?? {}), [key]: value };
    }

    const discord = file.discord ?? {};
    const lavalink = file.lavalink ?? {};
    return {
        discord: {
            clientId: str(discord.clientId, "discord.clientId"),
            ownerId: str(discord.ownerId, "discord.ownerId"),
            devGuildId: str(discord.devGuildId, "discord.devGuildId"),
        },
        lavalink: {
            host: str(lavalink.host, "lavalink.host") || "localhost",
            port: port(lavalink.port),
            secure: bool(lavalink.secure, "lavalink.secure"),
        },
    };
}

/** Texto del archivo, o `undefined` si no existe. Si es una carpeta (Docker la crea al montar algo que falta), también `undefined` */
function readConfigFile(path = CONFIG_PATH): string | undefined {
    try {
        if (!statSync(path).isFile()) return undefined;
        return readFileSync(path, "utf8");
    } catch {
        return undefined;
    }
}

const fileText = readConfigFile();

/** De dónde salió la configuración, para el log de arranque (este módulo no usa el logger para no depender de él) */
export const configSource = fileText === undefined
    ? `sin ${CONFIG_PATH}: se usa lo que haya en el .env (copiá config/config.example.yml a ${CONFIG_PATH})`
    : `${CONFIG_PATH}${Object.keys(ENV_KEYS).some(k => process.env[k]) ? " (con valores del .env que lo pisan)" : ""}`;

export const config = parseConfig(fileText);
