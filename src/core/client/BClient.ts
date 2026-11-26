import { AutocompleteInteraction, CacheType, ChatInputCommandInteraction, Client, GatewayIntentBits, VoiceChannel } from "discord.js";
import { config } from "../config.js";
import { Manager } from "moonlink.js";
import logger from "./logger.js";
import { loadDiscordEvents } from "../handler/Events/discordEventHandler.js";
import { loadMoonlinkEvents } from "../handler/Events/moonlinkEventHandler.js";
import { SlashCommand } from "../classes/SlashCommand.js";
import { PlayerMessage } from "../buttons/playerMessage.js";
import { BotDatabase } from "../db/database.js";

/** Volumen con el que arranca el reproductor si el servidor no eligió otro con /volume predeterminado */
export const DEFAULT_VOLUME = 10;

/** Mensajes de debug de moonlink.js que sirven para entender cortes al reanudar o reconectar */
const MOONLINK_RECOVERY_DEBUG = /recover|restart|reconnect|connection lost|resum|voice data|disconnected|WebSocket closed/i;

export class BClient extends Client {
    music: Manager;
    playerMessage: PlayerMessage;
    /** Favoritos y playlists por usuario (data/bot.db) */
    db = new BotDatabase();

    slashCommands = new Map<string, SlashCommand>();

    constructor() {
        super({
            // Solo lo que el bot usa: servidores y canales (Guilds) y quién está en cada canal de voz (GuildVoiceStates).
            // Los comandos y botones llegan como interacciones, que no necesitan intents. Ninguno es privilegiado,
            // así que no hay que activar nada en el Developer Portal.
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildVoiceStates,
            ],
        })

        this.playerMessage = new PlayerMessage(this);


        try {
            this.music = this.createLavalinkConnection();
            this.on("raw", (packet) => this.music.packetUpdate(packet));
            this.playerMessage.watch(this.music);
            // moonlink manda mucho por "debug" (cada mensaje del websocket): solo pasan los de reconexión y recuperación
            this.music.on("debug", (msg: string) => {
                if (MOONLINK_RECOVERY_DEBUG.test(msg)) logger.debug(`[Moonlink] ${msg}`);
            });

        } catch (error) {
            logger.error('Lavalink connection failed', error as Error);
            throw new Error(`Lavalink connection failed: ${(error as Error).message}`);
        }

    }

    getChannel(id: string) {
        return this.channels.cache.get(id);
    }

    getTextChannel(id: string) {
        const channel = this.channels.cache.get(id);
        if (channel?.isTextBased()) return channel;
        return null;
    }

    getVoiceChannel(channelID: string) {
        return this.channels.cache.get(channelID) as VoiceChannel | undefined
    }

    getGuild(id: string) {
        return this.guilds.cache.get(id);
    }


    async getPlayerOrDefault(inter: ChatInputCommandInteraction<"cached"> | AutocompleteInteraction<CacheType>, guildId: string) {
        const existing = this.music.players.get(guildId);
        if (existing) return existing;

        // La base puede estar en otra PC o en internet: si no responde, se toca con el volumen del bot en vez de fallar
        const saved = await this.db.getGuildVolume(guildId).catch(err => {
            logger.warn(`[DB] No se pudo leer el volumen guardado de ${guildId}, se usa ${DEFAULT_VOLUME}: ${(err as Error).message}`);
            return null;
        });

        // Se vuelve a buscar: mientras se leía la base, otro comando pudo haber creado el player
        return this.music.players.get(guildId) ?? this.music.players.create({
            guildId,
            textChannelId: inter.channelId ?? undefined,
            voiceChannelId: (inter.member as any).voice.channelId,
            volume: saved ?? DEFAULT_VOLUME,
        });
    }

    getPlayer(guildId: string) {
        return this.music.players.get(guildId);
    }

    public async init() {
        await loadDiscordEvents(this);
        await loadMoonlinkEvents(this);

        this.login(process.env.token).catch(err => {
            logger.error('Error logging in:', err);
            process.exit(1);
        });

    }

    private createLavalinkConnection() {
        // Host, puerto y wss salen de config/config.yml (en Docker, docker-compose fija el host "lavalink"); la contraseña, del .env
        const password = process.env.lavalinkPassword;
        if (!password) throw new Error("Falta lavalinkPassword en el .env (tiene que ser igual a server.password de application.yml)");

        const node = {
            identifier: "SpiderSound",
            host: config.lavalink.host,
            password,
            port: config.lavalink.port,
            secure: config.lavalink.secure,
        };
        logger.info(`[Lavalink] Nodo ${node.identifier} -> ${node.secure ? "wss" : "ws"}://${node.host}:${node.port}`);

        return new Manager({
            nodes: [node],
            // Lavalink guarda la sesión 60 s si el bot se cae o se reinicia: al volver con el mismo Session-Id
            // los reproductores siguen (misma canción y posición) en vez de rearmar la cola desde .moonlink/
            options: { resume: true, resumeTimeout: 60000 },
            send: (guildID: string, payload: any) => {
                const guild = this.guilds.cache.get(guildID);
                if (guild) guild.shard.send(payload);
            },
        })
    }

}



