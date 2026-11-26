// Texto de la cola (/queue y botón 📜), sin Discord de por medio: se prueba en test/core/music/queueView.test.ts
import { formatMS_HHMMSS, titleCleaner } from "../../utils/tools.js";
import { loopLabel, totalDuration, type LoopMode, type TimedTrack } from "./timing.js";
import type { Texts } from "../../i18n/index.js";

export interface QueueTrack extends TimedTrack {
    title: string;
    author: string;
    uri?: string | null;
}

export interface QueueState {
    current?: QueueTrack | null;
    tracks: readonly QueueTrack[];
    loop: LoopMode;
}

export const QUEUE_PAGE_SIZE = 10;
// Una línea por canción en el ancho de un embed (~55 caracteres): título y artista se cortan para no partirse en dos
const TITLE_MAX = 32;
const AUTHOR_MAX = 18;
/** La línea de "Sonando" ya lleva el prefijo y el tiempo: el título entra más corto */
const CURRENT_TITLE_MAX = 24;

const code = (text: string) => `\`${text}\``;
const cut = (text: string, max: number) => text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** Título limpio, cortado y con enlace (si es un enlace normal: los corchetes rompen el formato de Discord) */
function linkedTitle(track: QueueTrack, t: Texts, max = TITLE_MAX) {
    const title = cut(titleCleaner(track.title, track.author) || track.title || t.common.untitled, max).replace(/[[\]]/g, "");
    return track.uri && /^https?:\/\/\S+$/.test(track.uri) ? `[${title}](${track.uri})` : `**${title}**`;
}

const durationLabel = (track: QueueTrack, t: Texts) => track.isStream ? t.common.live : formatMS_HHMMSS(track.duration);

export const queuePageCount = (state: QueueState, pageSize = QUEUE_PAGE_SIZE) =>
    Math.max(1, Math.ceil(state.tracks.length / pageSize));

/** Una página de la cola: lo que suena, las canciones de la página y el pie con el total */
export function queuePage(state: QueueState, page: number, t: Texts, pageSize = QUEUE_PAGE_SIZE) {
    const pages = queuePageCount(state, pageSize);
    const index = Math.min(Math.max(page, 0), pages - 1);
    const start = index * pageSize;

    const lines: string[] = [];
    const current = state.current;
    if (current) {
        const time = current.isStream ? t.common.live : `${formatMS_HHMMSS(current.position ?? 0)} / ${formatMS_HHMMSS(current.duration)}`;
        lines.push(`${t.queue.nowPlaying} ${linkedTitle(current, t, CURRENT_TITLE_MAX)} · ${cut(current.author || t.common.unknown, AUTHOR_MAX)} ${code(time)}`, "");
    }

    const slice = state.tracks.slice(start, start + pageSize);
    if (slice.length) {
        lines.push(...slice.map((track, i) =>
            `${code(`${start + i + 1}.`)} ${linkedTitle(track, t)} · ${cut(track.author || t.common.unknown, AUTHOR_MAX)} ${code(durationLabel(track, t))}`));
    } else {
        lines.push(t.queue.noMore);
    }

    const footer = t.queue.footer(index + 1, pages, state.tracks.length, formatMS_HHMMSS(totalDuration(state.tracks)), loopLabel(state.loop, t));

    return { index, pages, description: lines.join("\n").slice(0, 4096), footer };
}
