/**
 * Copia favoritos, playlists y volúmenes de uno o más archivos SQLite (data/bot.db) a la base de DATABASE_URL.
 * Sirve para pasar a una base compartida (Supabase) juntando los datos de varias PCs sin duplicar nada.
 *
 * Uso (con DATABASE_URL en el .env):
 *   bun src/scripts/migrarDb.ts data/bot.db otra-pc/bot.db
 * Con Docker, sin instalar Bun (los archivos tienen que estar dentro de data/):
 *   docker compose run --rm discord-bot bun src/scripts/migrarDb.ts data/bot.db data/bot-amigo.db
 *
 * Se puede correr más de una vez: lo que ya está en la base nueva no se duplica.
 * - Favoritos: se conservan las fechas originales; si el mismo usuario tiene la misma canción en dos archivos, queda una.
 * - Playlists: se juntan por usuario y nombre (sin mayúsculas). Las canciones se agregan al final si no estaban.
 * - Volumen por servidor: si ya hay uno en la base nueva, se deja ese.
 */
import { SQL } from "bun";
import { existsSync } from "node:fs";
import { BotDatabase } from "../core/db/database.js";

const files = process.argv.slice(2);
const target = process.env.DATABASE_URL;

if (!target) throw new Error("[Migrar] Falta DATABASE_URL en el .env: es la base a la que se copian los datos.");
if (!files.length) throw new Error("[Migrar] Indicá uno o más archivos SQLite. Ej: bun src/scripts/migrarDb.ts data/bot.db");
for (const file of files) if (!existsSync(file)) throw new Error(`[Migrar] No existe el archivo ${file}`);

const db = new BotDatabase(target);

for (const file of files) {
    const src = new SQL(`sqlite://${file}`);
    const totals = { favorites: 0, newFavorites: 0, playlists: 0, tracks: 0, newTracks: 0, volumes: 0 };

    for (const fav of await src`SELECT user_id, uri, title, author, duration, artwork_url, added_at FROM favorites`) {
        totals.favorites++;
        const track = { uri: fav.uri, title: fav.title, author: fav.author, duration: fav.duration, artworkUrl: fav.artwork_url };
        if (await db.importFavorite(fav.user_id, track, Number(fav.added_at))) totals.newFavorites++;
    }

    for (const pl of await src`SELECT id, user_id, name FROM playlists ORDER BY id`) {
        totals.playlists++;
        const dest = await db.getPlaylist(pl.user_id, pl.name) ?? await db.createPlaylist(pl.user_id, pl.name);
        if (!dest) throw new Error(`[Migrar] No se pudo crear la playlist "${pl.name}" de ${pl.user_id}`);

        for (const t of await src`SELECT uri, title, author, duration, artwork_url FROM playlist_tracks WHERE playlist_id = ${pl.id} ORDER BY position`) {
            totals.tracks++;
            if (await db.addToPlaylist(dest.id, { uri: t.uri, title: t.title, author: t.author, duration: t.duration, artworkUrl: t.artwork_url })) totals.newTracks++;
        }
    }

    for (const g of await src`SELECT guild_id, volume FROM guild_settings WHERE volume IS NOT NULL`) {
        if (await db.getGuildVolume(g.guild_id) !== null) continue;
        await db.setGuildVolume(g.guild_id, g.volume);
        totals.volumes++;
    }

    await src.close();
    console.log(`[Migrar] ${file}: ${totals.newFavorites}/${totals.favorites} favoritos nuevos, `
        + `${totals.playlists} playlists con ${totals.newTracks}/${totals.tracks} canciones nuevas, ${totals.volumes} volúmenes de servidor`);
}

await db.close();
console.log("[Migrar] Listo. Los archivos originales no se tocaron: guardalos como copia de seguridad.");
