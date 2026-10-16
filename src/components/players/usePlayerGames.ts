import useSWR from "swr";
import { commands } from "@/bindings";
import type { PlayerAnalysisSource } from "@/utils/playerAnalysis";
import { mergeProfileGames, type ProfileGame, toProfileGame } from "@/utils/players/profileGames";
import { unwrap } from "@/utils/unwrap";

/** Every game of the card's sources, one call per database (`get_player_games`). */
async function loadGames(sources: readonly PlayerAnalysisSource[]): Promise<ProfileGame[]> {
    const byDatabase = new Map<string, PlayerAnalysisSource[]>();
    for (const source of sources) {
        byDatabase.set(source.databasePath, [
            ...(byDatabase.get(source.databasePath) ?? []),
            source,
        ]);
    }
    const groups = await Promise.all(
        [...byDatabase.entries()].map(async ([databasePath, databaseSources]) => {
            const rows = unwrap(
                await commands.getPlayerGames(
                    databasePath,
                    databaseSources.map((source) => source.playerId),
                ),
            );
            const byId = new Map(databaseSources.map((source) => [source.playerId, source]));
            return rows.map((row) =>
                toProfileGame(row, byId.get(row.playerId) ?? databaseSources[0]),
            );
        }),
    );
    return mergeProfileGames(groups);
}

export function playerGamesKey(sources: readonly PlayerAnalysisSource[]) {
    return [
        "player-card-games",
        ...sources.map((source) => `${source.databasePath}:${source.playerId}`).sort(),
    ];
}

/**
 * Cached by source list, so going back to a card is instant; `mutate` reloads it after an
 * account sync.
 */
export function usePlayerGames(sources: readonly PlayerAnalysisSource[]) {
    return useSWR(sources.length ? playerGamesKey(sources) : null, () => loadGames(sources), {
        revalidateOnFocus: false,
        revalidateIfStale: false,
        keepPreviousData: false,
    });
}
