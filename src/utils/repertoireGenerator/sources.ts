/** Move statistics of a position from Lichess, Lichess Masters or a local database tree. */
import type { PositionTree } from "@/bindings";
import { commands } from "@/bindings";
import { queryPosition } from "@/utils/db";
import { getLichessGames, getMasterGames, type RemoteOpeningData } from "@/utils/lichess/api";
import type { LichessGameSpeed, LichessRating } from "@/utils/lichess/explorer";
import { unwrap } from "@/utils/unwrap";
import { canonicalUci, positionKey } from "./positions";
import type { ModelGame, SourceMove, SourcePosition, StatsSourceConfig } from "./types";

export interface StatsSource {
    /** Statistics of the position, or null when the source knows nothing about it. */
    position(fen: string, signal?: AbortSignal): Promise<SourcePosition | null>;
    readonly label: string;
}

function remoteToPosition(fen: string, data: RemoteOpeningData): SourcePosition {
    const moves: SourceMove[] = data.moves.flatMap((move) => {
        const uci = canonicalUci(fen, move.uci);
        if (!uci) return [];
        return [
            {
                uci,
                san: move.san,
                games: move.white + move.draws + move.black,
                white: move.white,
                draws: move.draws,
                black: move.black,
            },
        ];
    });
    return { games: data.white + data.draws + data.black, moves };
}

/** Best game of a position, used as the model game of the move that leads there. */
export function remoteModelGame(data: RemoteOpeningData | null): ModelGame | undefined {
    const game = data?.topGames?.[0] ?? data?.recentGames?.[0];
    if (!game) return undefined;
    return {
        kind: "lichess",
        id: game.id,
        label: `${game.white.name} (${game.white.rating}) – ${game.black.name} (${game.black.rating})`,
        year: game.year,
    };
}

/** One explorer request per position, queued and cached by `lichessRequest`. */
class RemoteSource implements StatsSource {
    private cache = new Map<string, Promise<RemoteOpeningData | null>>();
    constructor(
        private config: Extract<StatsSourceConfig, { kind: "lichess" | "masters" }>,
        private token: string | undefined,
    ) {}

    get label() {
        return this.config.kind === "masters"
            ? "Lichess Masters"
            : `Lichess (${this.config.ratings.join(", ") || "all"} · ${this.config.speeds.join(", ") || "all"})`;
    }

    raw(fen: string, signal?: AbortSignal): Promise<RemoteOpeningData | null> {
        const key = positionKey(fen);
        let pending = this.cache.get(key);
        if (!pending) {
            pending = (
                this.config.kind === "masters"
                    ? getMasterGames(fen, { topGames: 1, moves: 50 }, this.token, signal)
                    : getLichessGames(
                          fen,
                          {
                              color: "white",
                              ratings: this.config.ratings as LichessRating[],
                              speeds: this.config.speeds as LichessGameSpeed[],
                              topGames: 1,
                              recentGames: 0,
                              // Rare moves matter here: the default list stops at 12.
                              moves: 50,
                          },
                          this.token,
                          signal,
                      )
            ).catch((error) => {
                this.cache.delete(key);
                throw error;
            });
            this.cache.set(key, pending);
        }
        return pending;
    }

    async position(fen: string, signal?: AbortSignal) {
        const data = await this.raw(fen, signal);
        return data ? remoteToPosition(fen, data) : null;
    }

    async modelGame(fen: string, signal?: AbortSignal) {
        return remoteModelGame(await this.raw(fen, signal).catch(() => null));
    }
}

/** The whole tree below the root in one pass over the local database (`get_position_tree`). */
class LocalTreeSource implements StatsSource {
    private byKey = new Map<string, SourcePosition>();
    constructor(
        private config: Extract<StatsSourceConfig, { kind: "local" }>,
        tree: PositionTree,
    ) {
        for (const node of tree.nodes) {
            this.byKey.set(positionKey(node.fen), {
                games: node.games,
                moves: node.moves.flatMap((move) => {
                    const uci = canonicalUci(node.fen, move.uci);
                    if (!uci) return [];
                    return [
                        {
                            uci,
                            san: move.san,
                            games: move.games,
                            white: move.white,
                            draws: move.draws,
                            black: move.black,
                            ratedGames: move.ratedGames,
                            ratedPoints: move.ratedPoints,
                            expectedPoints: move.expectedPoints,
                            modelGame:
                                move.modelGameId != null
                                    ? {
                                          kind: "local" as const,
                                          databasePath: config.databasePath,
                                          gameId: move.modelGameId,
                                          elo: move.modelGameElo ?? undefined,
                                      }
                                    : undefined,
                        },
                    ];
                }),
            });
        }
    }

    get label() {
        return this.config.databaseTitle;
    }

    async position(fen: string) {
        return this.byKey.get(positionKey(fen)) ?? null;
    }
}

export type LoadedSource = StatsSource & {
    modelGame?: (fen: string, signal?: AbortSignal) => Promise<ModelGame | undefined>;
    /** For the provenance: games read by the local tree. */
    summary?: string;
};

/** Builds the source; the local one reads its tree first (one position query plus one pass). */
export async function loadSource(
    config: StatsSourceConfig,
    rootFen: string,
    depth: number,
    minGames: number,
    options: { id: string; token?: string; signal?: AbortSignal },
): Promise<LoadedSource> {
    if (config.kind !== "local") {
        // `modelGame` is already a method of the remote source: wrapping it here under the same
        // name made it call itself.
        return new RemoteSource(config, options.token);
    }
    const summary = await queryPosition(
        {
            path: config.databasePath,
            fen: rootFen,
            type: "exact",
            player: null,
            color: "any",
            result: "any",
        },
        options.id,
        options.signal,
    );
    const tree = unwrap(
        await commands.getPositionTree(options.id, summary.token, {
            maxPlies: depth,
            minGames: Math.max(1, Math.min(minGames, 3)),
            minElo: config.minElo,
            sinceYear: config.sinceYear,
            untilYear: config.untilYear,
        }),
    );
    const source = new LocalTreeSource(config, tree);
    return Object.assign(source, {
        summary:
            tree.readGames < tree.matchingGames
                ? `${tree.readGames.toLocaleString()} / ${tree.matchingGames.toLocaleString()}`
                : tree.matchingGames.toLocaleString(),
    });
}
