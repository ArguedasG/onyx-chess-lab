import type {
    PlayerAnalysisCriticalPosition,
    PlayerEngineAnalysis,
    PlayerEngineGameMetrics,
} from "@/utils/playerAnalysis";
import { chronological, type PlayerOutcome, type ProfileGame } from "./profileGames";

/** Moments of the player card (I-22). Each one links to its game. */
export type PlayerHighlights = {
    /** Win with the largest rating gap against the player. */
    biggestUpset: { game: ProfileGame; eloGap: number } | null;
    /** Win against the highest-rated opponent. */
    strongestWin: { game: ProfileGame } | null;
    longestWinStreak: { length: number; first: ProfileGame; last: ProfileGame } | null;
    /** Results in a row up to the most recent game. */
    currentStreak: {
        outcome: Exclude<PlayerOutcome, "unknown">;
        length: number;
        since: ProfileGame;
    } | null;
    /** Checkmate given in the fewest moves. */
    fastestMate: { game: ProfileGame; moves: number } | null;
    longestGame: { game: ProfileGame; moves: number } | null;
};

const fullMoves = (game: ProfileGame) => Math.ceil(game.plies / 2);

export function playerHighlights(games: readonly ProfileGame[]): PlayerHighlights {
    let biggestUpset: PlayerHighlights["biggestUpset"] = null;
    let strongestWin: PlayerHighlights["strongestWin"] = null;
    let fastestMate: PlayerHighlights["fastestMate"] = null;
    let longestGame: PlayerHighlights["longestGame"] = null;
    for (const game of games) {
        if (game.plies > 0 && (!longestGame || game.plies > longestGame.game.plies))
            longestGame = { game, moves: fullMoves(game) };
        if (game.outcome !== "win") continue;
        if (
            game.opponentElo &&
            (!strongestWin || game.opponentElo > strongestWin.game.opponentElo!)
        )
            strongestWin = { game };
        if (game.opponentElo && game.playerElo) {
            const eloGap = game.opponentElo - game.playerElo;
            if (eloGap > 0 && (!biggestUpset || eloGap > biggestUpset.eloGap))
                biggestUpset = { game, eloGap };
        }
        if (
            game.ending === "checkmate" &&
            !game.customStart &&
            (!fastestMate || game.plies < fastestMate.game.plies)
        )
            fastestMate = { game, moves: fullMoves(game) };
    }

    // Streaks follow the order of play; games with an unknown result do not break them.
    let longestWinStreak: PlayerHighlights["longestWinStreak"] = null;
    type Run = { outcome: PlayerOutcome; length: number; first: ProfileGame; last: ProfileGame };
    let run = null as Run | null;
    for (const game of chronological(games)) {
        if (game.outcome === "unknown") continue;
        const previous: Run | null = run;
        run =
            previous !== null && previous.outcome === game.outcome
                ? {
                      outcome: previous.outcome,
                      length: previous.length + 1,
                      first: previous.first,
                      last: game,
                  }
                : { outcome: game.outcome, length: 1, first: game, last: game };
        if (run.outcome === "win" && run.length > (longestWinStreak?.length ?? 1))
            longestWinStreak = { length: run.length, first: run.first, last: run.last };
    }
    const currentStreak =
        run && run.outcome !== "unknown"
            ? { outcome: run.outcome, length: run.length, since: run.first }
            : null;

    return {
        biggestUpset,
        strongestWin,
        longestWinStreak,
        currentStreak,
        fastestMate,
        longestGame,
    };
}

/** Moments that need an engine analysis of the games. */
export type EngineHighlights = {
    /**
     * The move that lost the most winning chances (the "costliest" move): points of winning
     * probability before and after it. Older analyses only have the centipawn loss.
     */
    costliestError: { critical: PlayerAnalysisCriticalPosition; game: ProfileGame } | null;
    /** Win or draw from the lowest winning chances. */
    biggestComeback: {
        metrics: PlayerEngineGameMetrics;
        game: ProfileGame;
        lowestWinChance: number;
    } | null;
};

/** Only the analyzed games that are part of `games` (the card filters) are considered. */
export function engineHighlights(
    engine: PlayerEngineAnalysis | null | undefined,
    games: readonly ProfileGame[],
): EngineHighlights {
    if (!engine) return { costliestError: null, biggestComeback: null };
    const byKey = new Map(games.map((game) => [game.key, game]));
    let costliestError: EngineHighlights["costliestError"] = null;
    const severity = (critical: PlayerAnalysisCriticalPosition) =>
        critical.winChanceLoss ?? critical.cpLoss / 10;
    for (const critical of engine.criticalPositions) {
        const game = byKey.get(critical.key);
        if (!game) continue;
        if (!costliestError || severity(critical) > severity(costliestError.critical))
            costliestError = { critical, game };
    }
    let biggestComeback: EngineHighlights["biggestComeback"] = null;
    for (const metrics of engine.games) {
        const game = byKey.get(metrics.key);
        if (!game || metrics.lowestWinChance === undefined) continue;
        if (game.outcome !== "win" && game.outcome !== "draw") continue;
        // A comeback starts from a clearly worse position, not from a slightly worse one.
        if (metrics.lowestWinChance >= 25) continue;
        const better =
            !biggestComeback ||
            (game.outcome === "win" && biggestComeback.game.outcome !== "win") ||
            (game.outcome === biggestComeback.game.outcome &&
                metrics.lowestWinChance < biggestComeback.lowestWinChance);
        if (better) biggestComeback = { metrics, game, lowestWinChance: metrics.lowestWinChance };
    }
    return { costliestError, biggestComeback };
}
