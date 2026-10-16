/**
 * Results by named pawn structure (I-31) and by type of game (queens exchanged, endgame reached):
 * how a player scores in each against what the ratings predict (I-30).
 */
import type { PawnStructure } from "@/bindings";
import { type ResultBucket, resultBucket } from "@/utils/players/results";
import type { ProfileGame } from "@/utils/players/profileGames";

export const PAWN_STRUCTURES: readonly PawnStructure[] = [
    "iqp",
    "carlsbad",
    "hangingPawns",
    "caroSlav",
    "french",
    "maroczy",
    "hedgehog",
    "kingsIndian",
];

/** The player owns the structure (has the IQP, the bind…) or faces it. */
export type StructureRole = "own" | "against";

export type StructureRow = {
    structure: PawnStructure;
    own: ResultBucket;
    against: ResultBucket;
    /** Games with the structure in either role. */
    games: number;
};

export function structureRole(game: ProfileGame, ownerWhite: boolean): StructureRole {
    return ownerWhite === game.isWhite ? "own" : "against";
}

/** One row per structure with at least one game, most frequent first. */
export function structureRows(games: readonly ProfileGame[]): StructureRow[] {
    const rows: StructureRow[] = [];
    for (const structure of PAWN_STRUCTURES) {
        const own: ProfileGame[] = [];
        const against: ProfileGame[] = [];
        for (const game of games) {
            for (const hit of game.structures ?? []) {
                if (hit.structure !== structure) continue;
                (structureRole(game, hit.ownerWhite) === "own" ? own : against).push(game);
            }
        }
        const total = new Set([...own, ...against].map((game) => game.key)).size;
        if (total === 0) continue;
        rows.push({
            structure,
            own: resultBucket(`${structure}:own`, own),
            against: resultBucket(`${structure}:against`, against),
            games: total,
        });
    }
    return rows.sort((a, b) => b.games - a.games);
}

/** Queens off before move 25 and endgames reached, with the rest of the games for comparison. */
export function gameTypeRows(games: readonly ProfileGame[]) {
    const earlyQueens = games.filter(
        (game) => game.queensOffPly != null && game.queensOffPly <= 50,
    );
    const endgames = games.filter((game) => game.endgamePly != null);
    return {
        all: resultBucket("all", games),
        earlyQueens: resultBucket("earlyQueens", earlyQueens),
        endgames: resultBucket("endgames", endgames),
    };
}

/** Games with a structure, for the games list. */
export function gamesWithStructure(
    games: readonly ProfileGame[],
    structure: PawnStructure,
    role?: StructureRole,
): ProfileGame[] {
    return games.filter((game) =>
        (game.structures ?? []).some(
            (hit) =>
                hit.structure === structure &&
                (role === undefined || structureRole(game, hit.ownerWhite) === role),
        ),
    );
}
