import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { BotDatabase, SavedTrack, databaseUrl, needsTls } from "../../../src/core/db/database.js";

const track: SavedTrack = {
    uri: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    title: "Never Gonna Give You Up",
    author: "Rick Astley",
    duration: 213000,
    artworkUrl: null,
};
const other: SavedTrack = { ...track, uri: "https://www.youtube.com/watch?v=otra", title: "Otra" };

// Siempre contra SQLite en memoria. Con TEST_DATABASE_URL (un Postgres descartable) también contra Postgres:
//   docker run --rm -d -p 127.0.0.1:55432:5432 -e POSTGRES_PASSWORD=test postgres:16-alpine
//   TEST_DATABASE_URL=postgres://postgres:test@127.0.0.1:55432/postgres bun test
// ¡Ojo! Borra todas las tablas del bot en esa base: nunca apuntarlo a la base de verdad.
const targets = [":memory:", ...(process.env.TEST_DATABASE_URL ? [process.env.TEST_DATABASE_URL] : [])];

for (const url of targets) {
    const engine = url === ":memory:" ? "SQLite" : "Postgres";

    /** Base vacía para cada test */
    async function freshDb() {
        const db = new BotDatabase(url);
        await db.getGuildVolume("crear-tablas");
        if (url !== ":memory:") {
            const sql = new SQL(url);
            await sql.unsafe("TRUNCATE favorites, playlist_tracks, playlists, guild_settings RESTART IDENTITY CASCADE");
            await sql.close();
        }
        return db;
    }

    describe(`BotDatabase favoritos (${engine})`, () => {
        let db: BotDatabase;
        beforeEach(async () => { db = await freshDb(); });
        afterEach(() => db.close());

        test("el ❤️ agrega y, pulsado otra vez, quita", async () => {
            expect(await db.toggleFavorite("user-1", track)).toBe("added");
            expect((await db.getFavorites("user-1")).map(f => f.title)).toEqual(["Never Gonna Give You Up"]);

            expect(await db.toggleFavorite("user-1", track)).toBe("removed");
            expect(await db.getFavorites("user-1")).toEqual([]);
        });

        test("cada usuario tiene sus propios favoritos", async () => {
            await db.toggleFavorite("user-1", track);
            expect(await db.getFavorites("user-2")).toEqual([]);

            expect(await db.toggleFavorite("user-2", track)).toBe("added");
            await db.toggleFavorite("user-1", track); // user-1 la quita
            expect(await db.getFavorites("user-2")).toHaveLength(1);
        });

        test("addFavorite agrega una sola vez y nunca quita", async () => {
            expect(await db.addFavorite("user-1", track)).toBe(true);
            expect(await db.addFavorite("user-1", track)).toBe(false);
            expect(await db.getFavorites("user-1")).toHaveLength(1);
        });

        test("removeFavorite quita solo la del usuario y avisa si no estaba", async () => {
            await db.toggleFavorite("user-1", track);
            await db.toggleFavorite("user-2", track);

            expect(await db.removeFavorite("user-1", track.uri)).toBe(true);
            expect(await db.removeFavorite("user-1", track.uri)).toBe(false);
            expect(await db.getFavorites("user-1")).toEqual([]);
            expect(await db.getFavorites("user-2")).toHaveLength(1);
        });

        test("guarda los datos para mostrarla y volver a buscarla", async () => {
            await db.toggleFavorite("user-1", { ...track, artworkUrl: "https://i.ytimg.com/x.jpg" });
            const [fav] = await db.getFavorites("user-1");
            expect(fav).toMatchObject({ uri: track.uri, author: "Rick Astley", duration: 213000, artworkUrl: "https://i.ytimg.com/x.jpg" });
            // Postgres devuelve BIGINT como texto: tiene que llegar como número
            expect(typeof fav.addedAt).toBe("number");
            expect(fav.addedAt).toBeGreaterThan(0);
        });

        test("importFavorite conserva la fecha original y no duplica", async () => {
            expect(await db.importFavorite("user-1", track, 1000)).toBe(true);
            expect(await db.importFavorite("user-1", track, 2000)).toBe(false);
            expect((await db.getFavorites("user-1"))[0].addedAt).toBe(1000);
        });
    });

    describe(`BotDatabase playlists (${engine})`, () => {
        let db: BotDatabase;
        beforeEach(async () => { db = await freshDb(); });
        afterEach(() => db.close());

        test("crear, buscar sin distinguir mayúsculas y no repetir nombres", async () => {
            const rock = await db.createPlaylist("user-1", "Rock");
            expect(rock).toMatchObject({ name: "Rock", trackCount: 0 });
            expect(await db.createPlaylist("user-1", "rock")).toBeNull();
            expect((await db.getPlaylist("user-1", "ROCK"))?.id).toBe(rock!.id);
            // otro usuario puede usar el mismo nombre y no ve las ajenas
            expect(await db.createPlaylist("user-2", "Rock")).not.toBeNull();
            expect(await db.getPlaylists("user-1")).toHaveLength(1);
        });

        test("agregar mantiene el orden, no duplica y cuenta canciones", async () => {
            const { id } = (await db.createPlaylist("user-1", "Mix"))!;
            expect(await db.addToPlaylist(id, track)).toBe(true);
            expect(await db.addToPlaylist(id, other)).toBe(true);
            expect(await db.addToPlaylist(id, track)).toBe(false);
            expect((await db.getPlaylistTracks(id)).map(t => t.title)).toEqual(["Never Gonna Give You Up", "Otra"]);
            // Postgres devuelve COUNT(*) como texto: tiene que llegar como número
            expect((await db.getPlaylist("user-1", "mix"))?.trackCount).toBe(2);
        });

        test("las playlists salen ordenadas por nombre sin importar mayúsculas", async () => {
            await db.createPlaylist("user-1", "rock");
            await db.createPlaylist("user-1", "Ambient");
            await db.createPlaylist("user-1", "jazz");
            expect((await db.getPlaylists("user-1")).map(p => p.name)).toEqual(["Ambient", "jazz", "rock"]);
        });

        test("quitar por posición y seguir agregando al final", async () => {
            const { id } = (await db.createPlaylist("user-1", "Mix"))!;
            await db.addToPlaylist(id, track);
            await db.addToPlaylist(id, other);
            const [first] = await db.getPlaylistTracks(id);
            expect(await db.removeFromPlaylist(id, first.position)).toBe(true);
            await db.addToPlaylist(id, track);
            expect((await db.getPlaylistTracks(id)).map(t => t.title)).toEqual(["Otra", "Never Gonna Give You Up"]);
        });

        test("renombrar y borrar solo las propias; borrar se lleva las canciones", async () => {
            const mix = (await db.createPlaylist("user-1", "Mix"))!;
            await db.createPlaylist("user-1", "Rock");
            await db.addToPlaylist(mix.id, track);

            expect(await db.renamePlaylist("user-1", mix.id, "rock")).toBe(false); // nombre ocupado
            expect(await db.renamePlaylist("user-1", mix.id, "MIX")).toBe(true);   // cambiar mayúsculas de la misma
            expect(await db.renamePlaylist("user-2", mix.id, "Robada")).toBe(false);
            expect(await db.deletePlaylist("user-2", mix.id)).toBe(false);

            expect(await db.deletePlaylist("user-1", mix.id)).toBe(true);
            expect(await db.getPlaylistTracks(mix.id)).toEqual([]);
        });
    });

    describe(`BotDatabase volumen por servidor (${engine})`, () => {
        let db: BotDatabase;
        beforeEach(async () => { db = await freshDb(); });
        afterEach(() => db.close());

        test("sin elegir es null; se guarda, se pisa y no se mezcla entre servidores", async () => {
            expect(await db.getGuildVolume("guild-1")).toBeNull();
            await db.setGuildVolume("guild-1", 30);
            await db.setGuildVolume("guild-1", 45);
            await db.setGuildVolume("guild-2", 10);
            expect(await db.getGuildVolume("guild-1")).toBe(45);
            expect(await db.getGuildVolume("guild-2")).toBe(10);
        });
    });
}

describe("databaseUrl", () => {
    test("usa DATABASE_URL si está; si no, el archivo SQLite de siempre", () => {
        expect(databaseUrl({ DATABASE_URL: "postgres://u:p@host:5432/db" })).toBe("postgres://u:p@host:5432/db");
        expect(databaseUrl({})).toBe("sqlite://data/bot.db");
        expect(databaseUrl({ DB_PATH: "otra/base.db" })).toBe("sqlite://otra/base.db");
        expect(databaseUrl({ DB_PATH: ":memory:" })).toBe(":memory:");
    });
});

describe("needsTls", () => {
    test("cifra las bases remotas, no las locales, y respeta el sslmode de la URL", () => {
        expect(needsTls("postgres://u:p@aws-0-sa-east-1.pooler.supabase.com:5432/postgres")).toBe(true);
        expect(needsTls("postgres://postgres:test@127.0.0.1:55432/postgres")).toBe(false);
        expect(needsTls("postgres://u:p@localhost/db")).toBe(false);
        expect(needsTls("postgres://u:p@host/db?sslmode=disable")).toBe(false);
        expect(needsTls("sqlite://data/bot.db")).toBe(false);
    });
});
