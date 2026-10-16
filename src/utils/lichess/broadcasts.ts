/**
 * Lichess broadcasts for rivals without an online account (8.6, part of I-04): search the
 * official broadcast tournaments by name and add their games to one local database. The full
 * monthly pipeline with its own catalogue entry stays in Phase 10.
 *
 * Broadcast PGNs are CC BY-SA (Lichess); every game keeps its event and site, and Onyx records
 * which tournaments were imported and when (`broadcast-imports-v1`).
 */
import { resolve } from "@tauri-apps/api/path";
import { remove } from "@tauri-apps/plugin-fs";
import { commands } from "@/bindings";
import { getDatabasesDir } from "@/utils/directories";
import { unwrap } from "@/utils/unwrap";
import { lichessRequest } from "./request";

export const BROADCAST_DATABASE_FILE = "Lichess broadcasts.db3";
export const BROADCAST_DATABASE_TITLE = "Lichess broadcasts";

export type BroadcastTour = {
    id: string;
    name: string;
    location?: string;
    timeControl?: string;
    fideTimeControl?: string;
    /** First and last day, as timestamps in milliseconds. */
    dates?: number[];
    url: string;
};

type SearchResponse = {
    currentPageResults?: Array<{
        tour: {
            id: string;
            name: string;
            url: string;
            dates?: number[];
            info?: { location?: string; tc?: string; fideTC?: string };
        };
    }>;
    nbPages?: number;
};

export async function searchBroadcasts(query: string, page = 1): Promise<BroadcastTour[]> {
    const url = `https://lichess.org/api/broadcast/search?q=${encodeURIComponent(query)}&page=${page}`;
    const response = await lichessRequest(url, {}, { cacheKey: url });
    if (!response.ok) throw new Error(`Lichess broadcasts: ${response.status}`);
    const data = (await response.json()) as SearchResponse;
    return (data.currentPageResults ?? []).map(({ tour }) => ({
        id: tour.id,
        name: tour.name,
        url: tour.url,
        dates: tour.dates,
        location: tour.info?.location,
        timeControl: tour.info?.tc,
        fideTimeControl: tour.info?.fideTC,
    }));
}

export type BroadcastImport = { id: string; name: string; importedAt: string };

const IMPORTS_KEY = "broadcast-imports-v1";

export function broadcastImports(): Record<string, BroadcastImport> {
    try {
        return JSON.parse(localStorage.getItem(IMPORTS_KEY) ?? "{}");
    } catch {
        return {};
    }
}

function recordImport(tour: BroadcastTour) {
    const imports = broadcastImports();
    imports[tour.id] = { id: tour.id, name: tour.name, importedAt: new Date().toISOString() };
    localStorage.setItem(IMPORTS_KEY, JSON.stringify(imports));
}

/**
 * Downloads the PGN of every round of the tournaments and adds them to the broadcasts database.
 * Re-importing a tournament does not duplicate its finished games (exact duplicates are removed).
 * Returns the database path.
 */
export async function importBroadcasts(
    tours: BroadcastTour[],
    onProgress?: (done: number, total: number) => void,
): Promise<string> {
    const dir = await getDatabasesDir();
    const dbPath = await resolve(dir, BROADCAST_DATABASE_FILE);
    const files: string[] = [];
    try {
        for (const [index, tour] of tours.entries()) {
            onProgress?.(index, tours.length);
            const path = await resolve(dir, `broadcast_${tour.id}.pgn`);
            unwrap(
                await commands.downloadFile(
                    `broadcast_${tour.id}`,
                    `https://lichess.org/api/broadcast/${tour.id}.pgn`,
                    path,
                    null,
                    null,
                    null,
                ),
            );
            files.push(path);
        }
        onProgress?.(tours.length, tours.length);
        unwrap(
            await commands.convertPgn(
                files,
                dbPath,
                null,
                BROADCAST_DATABASE_TITLE,
                "Lichess broadcasts (CC BY-SA), imported by Onyx for player preparation.",
            ),
        );
        await commands.deleteDuplicatedGames(dbPath);
        await commands.deleteEmptyGames(dbPath);
        for (const tour of tours) recordImport(tour);
        return dbPath;
    } finally {
        for (const file of files) await remove(file).catch(() => {});
    }
}
