[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/BrayanBCode/SpiderSound)

# 🕷️ Araña Sound

**English** · [Español](README.md)

![logo](https://github.com/BrayanBCode/SpiderBot/assets/134159765/527b4a22-a501-4ba1-b2bf-d7eefd0e9fa4)

**Araña Sound** is a Discord music bot built with **Bun**, **discord.js 14**, **moonlink.js 5** and **Lavalink 4**, all in Docker. It plays from YouTube and Spotify, with an interactive queue and button controls, and it's meant to be **self-hosted**: you run your own copy.

🌐 **Website:** [spidersound.netlify.app/en](https://spidersound.netlify.app/en): command list and a [step-by-step self-hosting guide](https://spidersound.netlify.app/en/self-host) with screenshots.

> [!NOTE]
> The project is active again. The work plan is in [`docs/ROADMAP.md`](docs/ROADMAP.md) (in Spanish).

---

## 📦 Features

- 🎵 YouTube (search, links and playlists) and Spotify (songs, albums, public playlists and artists).
- 📃 Interactive paginated queue, `/playnext`, `/forceplay`, `/remove`, `/move`, `/loop`, `/shuffle` and `/volume` (with a per-server default volume).
- 🔁 Song or queue repeat, shuffle, fast-forward and rewind.
- 🎚️ A "Now playing" message with buttons and custom emojis (spider theme): it shows when the song ends, the loop mode, what's next and the queue, and it updates when you pause or change something.
- ❤️ Per-user favorites: the ❤️ button saves or removes the current song (only whoever taps it sees the reply).
- 📂 Each user's own playlists (up to 25, with 100 songs each), also from YouTube playlists.
- 🌐 Replies in English or Spanish, chosen per server.
- 💤 Leaves on its own after inactivity or when it's alone in the channel.

## 🎮 Commands

| Command | What it does |
|---|---|
| `/play` | Plays or queues a song (text or link, with autocomplete) |
| `/playnext` | Adds the song to play next |
| `/forceplay` | Plays right now, skipping the current one |
| `/pause` · `/resume` | Pauses or resumes the song |
| `/skip` | Skips to the next song or to a queue position (from 1, like in `/queue`) |
| `/remove` | Removes a song from the queue by its position |
| `/move` | Moves a song in the queue to another position |
| `/queue` | Shows the queue |
| `/loop` | Repeat: OFF, song or queue (without choosing, it goes to the next mode) |
| `/shuffle` | Shuffles the queue |
| `/volume` | Volume from 1 to 100; with `default`, the server's (requires Manage Server) |
| `/clear` | Empties the queue |
| `/forward` · `/backward` | Skips forward or back some seconds |
| `/stop` | Stops and disconnects the bot |
| `/favorites play` | Loads your favorites (❤️) into the queue; optional: `amount` and `shuffle` |
| `/favorites add` | Saves a song to your favorites (by search, or the one playing if you type nothing) |
| `/favorites view` | Shows your favorites (only to you) and lets you remove them |
| `/playlist create` | Creates an empty playlist |
| `/playlist add` | Adds a song, a whole YouTube playlist or the one playing |
| `/playlist play` | Loads a playlist into the queue; optional: `shuffle` |
| `/playlist view` | Lists your playlists, or the songs in one with a menu to remove them |
| `/playlist rename` · `/playlist delete` | Renames or deletes a playlist (asks for confirmation) |
| `/help` | Lists every command (built from the loaded commands) |
| `/ping` | Shows the bot's latency in ms |
| `/language` | Shows or changes the bot's language on the server: English or Spanish (changing it requires Manage Server) |

Commands that control playback only work if you're in the same voice channel as the bot.

**Language.** The bot replies in English or Spanish depending on the server. If nobody picked one with `/language`, it uses the server's Discord language. Discord sets English on servers that aren't Community servers, so when the bot joins a new server it posts, in both languages, how to change it. Command names show up in each user's Discord language: with Discord in Spanish, `/favorites view` appears as `/favoritos ver` and `/language` as `/idioma`.

---

## 🚀 Setup (Docker)

Requirements: **Docker** with Docker Compose. The bot runs on **Bun** inside its container: nothing else to install.

> For a guided walkthrough with screenshots, see the [self-hosting guide](https://spidersound.netlify.app/en/self-host). This section is the short version.

### Before you start: your app in the Developer Portal

In the [Developer Portal](https://discord.com/developers/applications), create an application (or use one you already have) and check:

- **Bot → Privileged Gateway Intents**: you don't need any. The bot only uses regular intents (servers and voice channels).
- **Bot → Authorization Flow**: **Requires OAuth2 Code Grant** must be **off** (otherwise the invite fails). **Public Bot** on if you want others to invite it to their servers; off if it's just for you.
- **Bot → Token**: the `token` in `.env` (with *Reset Token*). Don't share it or upload it anywhere.
- **General Information → Application ID**: it's `discord.clientId` in `config/config.yml`. Your own Discord user ID goes in `discord.ownerId`.
- **Invite the bot**: in **OAuth2 → URL Generator**, tick the `bot` and `applications.commands` scopes and these permissions: View Channels, Send Messages, Embed Links, Read Message History, Use External Emojis, Connect and Speak. Open the generated URL and pick your server.

### Installation

Get the project with git, not as a ZIP: without git, `update.sh` can't update it later.

```bash
git clone https://github.com/BrayanBCode/SpiderSound.git
cd SpiderSound
```

1. **Configuration**

   ```bash
   cp .env.example .env
   cp config/config.example.yml config/config.yml
   cp application.example.yml application.yml
   ```

   - In `.env`, **only the secrets**: your bot's `token` ([Developer Portal](https://discord.com/developers/applications)) and passwords of your own for `lavalinkPassword` and `YT_CIPHER_TOKEN`.
   - In `config/config.yml`, what isn't secret: `discord.clientId` (Application ID) and, if you want, `discord.ownerId` and `discord.devGuildId`. IDs go **in quotes**: without quotes the number gets rounded and the bot won't start (it tells you).
   - In `application.yml`: the same passwords in `server.password` and `plugins.youtube.remoteCipher.password`, and (optional) the Client ID/Secret of a Spotify app.
   - YouTube plugin: `lavalink.youtubePluginChannel` in `config/config.yml` picks which version Lavalink downloads at startup: `release` (latest stable) or `dev` (latest snapshot). Empty uses the version pinned in `application.yml`. The version in use shows up in `docker compose logs lavalink` (`[YouTubePlugin]` lines). If your `application.yml` predates this setting, copy the YouTube plugin line (with `${YOUTUBE_PLUGIN_VERSION:...}`) and its `snapshot` from `application.example.yml`.

   The example files' comments are in Spanish; the [guide](https://spidersound.netlify.app/en/self-host) explains each value in English.

2. **Start it**

   ```bash
   docker compose up --build -d
   ```

   It starts four containers: `yt-cipher` (YouTube deciphering), `spotify-tokener` (Spotify token for albums, playlists and artists), `lavalink` (audio) and `discord-bot`. The bot waits for Lavalink to respond (healthcheck) before starting. After changing the code, the same command rebuilds the bot image.

   Slash commands register themselves every time the bot starts.

   Favorites and playlists are stored in `data/bot.db` (SQLite), in the project's `data/` folder. If you move the bot to another PC, copy that folder.

   If the bot runs on more than one PC (taking turns), favorites can live in a shared database: see [Shared database](#shared-database-optional).

   Optional: with `discord.devGuildId` in `config/config.yml` (your server's ID), the bot creates `#notificaciones-bot` there and reports startups, servers joined or left, unhandled errors and Lavalink outages. The channel is private: only the bot owner (`discord.ownerId`) and administrators see it. It needs the Manage Channels permission. These notices and the logs are in Spanish for now.

### Shared database (optional)

By default each install keeps favorites, playlists and the per-server volume in its own `data/bot.db`. If the bot runs on more than one PC, each would have different data. To share the same data, use a Postgres database on the internet, for example [Supabase](https://supabase.com/dashboard) (it has a free plan):

1. Create a project. Pick the region closest to the bot's PCs and save the database password.
2. In the project: **Connect** → **Session pooler** → copy the URI. Use the *Session pooler* (not *Direct connection*, which only works over IPv6, nor *Transaction pooler*, which doesn't support the prepared statements the bot uses).
3. Replace `[YOUR-PASSWORD]` with the password and paste it into the `.env` on **each** PC:
   ```env
   DATABASE_URL="postgresql://postgres.xxxx:your-password@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"
   ```
   The connection is encrypted (TLS) automatically. It's a password: don't commit it or paste it in chats.
4. If you already had data, move it once (several `bot.db` files can be merged and nothing gets duplicated):
   ```bash
   docker compose run --rm discord-bot bun src/scripts/migrarDb.ts data/bot.db data/bot-other-pc.db
   ```
   The files you pass must be inside `data/`. They aren't deleted: keep them as a backup.
5. `docker compose up --build -d`. The log shows `[DB] Base lista: Postgres (...)`.

On the free plan, Supabase pauses the database after a week without use (it emails you first). While it's paused the music works, but favorites and playlists fail: reactivate it from the dashboard.

### Updating

In the project folder:

```bash
./update.sh      # Linux / macOS
update.bat       # Windows (or double-click)
```

The script pulls the latest version (`git pull`) and the new Lavalink, yt-cipher and spotify-tokener images, rebuilds the bot and restarts only what changed. It removes old bot images and at the end waits for the bot to connect to Discord (up to 90 s): if it doesn't, or it keeps restarting, it says so and shows where to look. It doesn't touch `.env`, `config/config.yml`, `application.yml` or `data/`.

- It needs a folder cloned with git. If you downloaded a ZIP, the script stops and shows the commands to convert it once, without touching your configuration.
- If `.env` or `application.yml` is missing, or is a folder (Docker creates empty folders when the bot starts before the files exist), it stops before touching anything and explains how to fix it.
- If there's no `config/config.yml` (installs older than v3.6.0), it warns and goes on: the bot uses the old `.env` values (`botClientID`, `ownerID`, `DEV_GUILD_ID`, `lavalinkHost`, `lavalinkPort`, `lavalinkSecure`, `YOUTUBE_PLUGIN_CHANNEL`). To switch to the new file, copy `config/config.example.yml`, fill it in and remove those lines from `.env` (if they stay, they win over the file).
- If `./update.sh` says `permission denied`, run `chmod +x update.sh` once (or use `sh update.sh`).
- If `.env.example`, `application.example.yml` or `config/config.example.yml` changed, it warns you: compare them with your copies in case there are new options.
- If you modified files from the repo, it stops before updating so it doesn't overwrite them (save them with `git stash`).
- If music was playing and only the bot was updated, it resumes on its own after the restart; if Lavalink was updated, playback stops.

### Development without Docker (optional)

With [Bun](https://bun.sh) 1.4+ installed: `bun install`, start only Lavalink with `docker compose up -d lavalink` (in `config/config.yml`, `lavalink.host: localhost`, which is the default) and run the bot with `bun start`. Bun reads `.env` by itself and runs TypeScript directly, no build step. Type check: `bun run typecheck`; tests: `bun test`. Some dependencies carry their own patches (`bun patch`): before updating them, see [`docs/PARCHES.md`](docs/PARCHES.md) (in Spanish).

### YouTube token (OAuth)

YouTube asks you to sign in to play. With `refreshToken: ""` and `skipInitialization: false` in `application.yml`, Lavalink shows a code for `https://www.google.com/device` in `docker compose logs lavalink` when it starts. Authorize with a **secondary account** (not your main one), copy the refresh token from the log into `application.yml` and set `skipInitialization: true`.

### Button emojis

The icons are in [`assets/emojis/`](assets/emojis). The IDs in [`src/core/buttons/emojis.ts`](src/core/buttons/emojis.ts) belong to the original app: if you use your own bot, upload those PNGs in *Developer Portal → your app → Emojis* and replace the IDs.

> [!WARNING]
> Never commit `.env` or `application.yml`: they hold tokens and passwords. They're already in `.gitignore`.

---

## 📄 License

This project uses the [Apache 2.0 license](LICENSE): you can use, modify and redistribute it, **including commercially**.

If you redistribute the code (as is or modified), you must:

- Include a copy of the [license](LICENSE) and of the [NOTICE](NOTICE) file, which credits **BrayanBCode**.
- Mark the files you changed.
- Not use the author's name to promote your version without permission.

## ✨ Author

**BrayanBCode** — 🕸️ GitHub: [@BrayanBCode](https://github.com/BrayanBCode)
