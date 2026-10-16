/**
 * Conversion and defense practice from the player's own games (8.7, I-21): the first position of
 * each analyzed game where they were clearly better (+1.5) and did not win, or clearly worse
 * (−1.5), to play again against a human-like bot at the opponent's level.
 */
import type { PlayerEngineAnalysis } from "@/utils/playerAnalysis";
import type { ProfileGame } from "@/utils/players/profileGames";

export type PracticeKind = "conversion" | "defense";

export type PracticePosition = {
    kind: PracticeKind;
    key: string;
    fen: string;
    ply: number;
    /** Winning chances of the player in that position, 0–100. */
    winChance: number;
    game: ProfileGame;
    /** What happened in the game: the advantage was not won, or the worse position was saved or lost. */
    outcome: ProfileGame["outcome"];
};

export type PracticeSummary = {
    conversion: PracticePosition[];
    defense: PracticePosition[];
    /** Analyzed games of the filters, and how many are from before 8.7 (no positions stored). */
    analyzedGames: number;
    withoutPositions: number;
};

/**
 * Conversion: games with an advantage that were not won, the most clear-cut first. Defense: games
 * with a worse position, the lost ones first (those are the ones to practice).
 */
export function practicePositions(
    engine: PlayerEngineAnalysis,
    games: readonly ProfileGame[],
): PracticeSummary {
    const byKey = new Map(games.map((game) => [game.key, game]));
    const conversion: PracticePosition[] = [];
    const defense: PracticePosition[] = [];
    let analyzedGames = 0;
    let withoutPositions = 0;
    for (const metrics of engine.games) {
        const game = byKey.get(metrics.key);
        if (!game) continue;
        analyzedGames += 1;
        if (
            (metrics.hadAdvantage && !metrics.advantagePosition) ||
            (metrics.wasInferior && !metrics.inferiorPosition)
        )
            withoutPositions += 1;
        if (metrics.hadAdvantage && !metrics.convertedAdvantage && metrics.advantagePosition) {
            conversion.push({
                kind: "conversion",
                key: metrics.key,
                ...metrics.advantagePosition,
                game,
                outcome: game.outcome,
            });
        }
        if (metrics.wasInferior && metrics.inferiorPosition) {
            defense.push({
                kind: "defense",
                key: metrics.key,
                ...metrics.inferiorPosition,
                game,
                outcome: game.outcome,
            });
        }
    }
    const lostFirst = (position: PracticePosition) => (position.outcome === "loss" ? 0 : 1);
    conversion.sort((a, b) => b.winChance - a.winChance);
    defense.sort((a, b) => lostFirst(a) - lostFirst(b) || b.winChance - a.winChance);
    return { conversion, defense, analyzedGames, withoutPositions };
}

/** The goal of a practice position, for the game and its result. */
export function practiceGoal(position: PracticePosition): "win" | "draw" {
    return position.kind === "conversion" ? "win" : "draw";
}
