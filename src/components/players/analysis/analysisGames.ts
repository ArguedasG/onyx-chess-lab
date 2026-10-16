import type { GameMetadata } from "@/bindings";
import { commands } from "@/bindings";
import type { PlayerAnalysisGame, PlayerAnalysisSource } from "@/utils/playerAnalysis";
import { unwrap } from "@/utils/unwrap";

const PAGE_SIZE = 250;
const PLAYER_GAMES_CACHE_LIMIT = 3;
const SOURCE_GAMES_CACHE_LIMIT = 6;

/** Session caches: switching between a few profiles does not reload them, and RAM stays bounded. */
export const playerGamesCache = new Map<string, PlayerAnalysisGame[]>();
const playerGamesLoads = new Map<string, Promise<PlayerAnalysisGame[]>>();
const sourceGamesCache = new Map<string, PlayerAnalysisGame[]>();

export function cachePlayerGames(profileId: string, games: PlayerAnalysisGame[]) {
    playerGamesCache.delete(profileId);
    playerGamesCache.set(profileId, games);
    while (playerGamesCache.size > PLAYER_GAMES_CACHE_LIMIT) {
        const oldest = playerGamesCache.keys().next().value;
        if (oldest) playerGamesCache.delete(oldest);
    }
}

async function loadSourceGames(source: PlayerAnalysisSource): Promise<PlayerAnalysisGame[]> {
    const sourceKey = `${source.databasePath}:${source.playerId}`;
    const cached = sourceGamesCache.get(sourceKey) ?? [];
    const checkpoint = cached.reduce((maximum, item) => Math.max(maximum, item.game.id), 0);
    const games: GameMetadata[] = [];
    let page = 1;
    let total = Number.POSITIVE_INFINITY;
    while (games.length < total) {
        const response = unwrap(
            await commands.getGameMetadata(source.databasePath, {
                player1: source.playerId,
                sides: "Any",
                after_game_id: cached.length ? checkpoint : undefined,
                options: {
                    page,
                    pageSize: PAGE_SIZE,
                    skipCount: cached.length > 0 || page > 1,
                    sort: cached.length > 0 ? "id" : "date",
                    direction: cached.length > 0 ? "asc" : "desc",
                },
            }),
        );
        games.push(...response.data);
        if (page === 1)
            total =
                response.count ?? (cached.length ? Number.POSITIVE_INFINITY : response.data.length);
        if (response.data.length < PAGE_SIZE) break;
        page += 1;
    }
    const loaded = games.map((game) => ({
        key: `${source.databasePath}:${game.id}`,
        source,
        game,
    }));
    const merged = [...new Map([...cached, ...loaded].map((item) => [item.key, item])).values()];
    sourceGamesCache.delete(sourceKey);
    sourceGamesCache.set(sourceKey, merged);
    while (sourceGamesCache.size > SOURCE_GAMES_CACHE_LIMIT) {
        const oldest = sourceGamesCache.keys().next().value;
        if (oldest) sourceGamesCache.delete(oldest);
        else break;
    }
    return merged;
}

export async function loadProfileGames(
    sources: PlayerAnalysisSource[],
    onProgress?: (progress: number) => void,
): Promise<PlayerAnalysisGame[]> {
    const loaded: PlayerAnalysisGame[] = [];
    for (const [index, source] of sources.entries()) {
        loaded.push(...(await loadSourceGames(source)));
        onProgress?.(((index + 1) / sources.length) * 100);
    }
    return [...new Map(loaded.map((game) => [game.key, game])).values()];
}

export function loadProfileGamesOnce(
    profileId: string,
    sources: PlayerAnalysisSource[],
): Promise<PlayerAnalysisGame[]> {
    const existing = playerGamesLoads.get(profileId);
    if (existing) return existing;
    const pending = loadProfileGames(sources)
        .then((games) => {
            cachePlayerGames(profileId, games);
            return games;
        })
        .finally(() => {
            if (playerGamesLoads.get(profileId) === pending) playerGamesLoads.delete(profileId);
        });
    playerGamesLoads.set(profileId, pending);
    return pending;
}
