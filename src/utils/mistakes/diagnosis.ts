/**
 * Training priorities without an LLM (8.7, I-18): the player's problems with their evidence, each
 * linked to a concrete action. The order is fixed and written down — first what the engine
 * measured as costly, then the results without engine — and every item keeps its sample.
 */
import type {
    PlayerAnalysisPhase,
    PlayerEngineAnalysis,
    PlayerMoveErrors,
} from "@/utils/playerAnalysis";
import type { ProfileGame } from "@/utils/players/profileGames";
import { groupResults, type ResultBucket } from "@/utils/players/results";
import { howToPlay, phaseFindings } from "@/utils/preparation/howToPlay";
import { MIN_RATING_PAR_GAMES } from "@/utils/ratingPar";
import type { GeneratorColor } from "@/utils/repertoireGenerator/types";
import { type LeakCategory, leakCatalogue } from "./leaks";

/** Below this share of converted advantages the conversion is a priority. */
export const CONVERSION_TARGET = 70;
/** Below this share of saved worse positions the defense is a priority. */
export const DEFENSE_TARGET = 30;
/** Low-clock errors count when they are this many times the rest, from 40 moves. */
const LOW_CLOCK_FACTOR = 1.5;
const MIN_LOW_CLOCK_MOVES = 40;

export type Priority =
    | { kind: "leak"; category: LeakCategory; errors: number; cost: number; games: number }
    | {
          kind: "phase";
          phase: PlayerAnalysisPhase;
          rate: number;
          average: number;
          moves: number;
      }
    | { kind: "lowClock"; low: PlayerMoveErrors; rest: PlayerMoveErrors }
    | { kind: "conversion"; rate: number; games: number }
    | { kind: "defense"; rate: number; games: number }
    | { kind: "opening"; color: GeneratorColor; name: string; bucket: ResultBucket }
    | { kind: "timeControl"; timeControl: string; bucket: ResultBucket };

export type Diagnosis = {
    priorities: Priority[];
    games: number;
    /** Analyzed games among them; the engine items need some. */
    analyzedGames: number;
};

function rate(value: PlayerMoveErrors) {
    return value.moves ? (value.errors / value.moves) * 100 : 0;
}

export function diagnose(
    games: readonly ProfileGame[],
    engine: PlayerEngineAnalysis | null,
): Diagnosis {
    const priorities: Priority[] = [];
    const keys = new Set(games.map((game) => game.key));
    let analyzedGames = 0;
    if (engine) {
        const outcomes = new Map(games.map((game) => [game.key, game.outcome]));
        const catalogue = leakCatalogue(engine, keys, outcomes);
        analyzedGames = catalogue.analyzedGames;
        const leak = catalogue.rows.find(
            (row) => row.category !== "unclassified" && row.errors >= 3,
        );
        if (leak)
            priorities.push({
                kind: "leak",
                category: leak.category,
                errors: leak.errors,
                cost: leak.cost,
                games: catalogue.analyzedGames,
            });
        const phases = phaseFindings(engine, keys);
        if (phases?.worstPhase)
            priorities.push({
                kind: "phase",
                phase: phases.worstPhase.phase,
                rate: phases.worstPhase.rate,
                average: phases.worstPhase.average,
                moves: phases.worstPhase.moves,
            });
        const low = { moves: 0, errors: 0 };
        const rest = { moves: 0, errors: 0 };
        for (const game of engine.games) {
            if (!keys.has(game.key) || !game.clockBands) continue;
            low.moves += game.clockBands.low.moves;
            low.errors += game.clockBands.low.errors;
            for (const band of [game.clockBands.middle, game.clockBands.high]) {
                rest.moves += band.moves;
                rest.errors += band.errors;
            }
        }
        if (
            low.moves >= MIN_LOW_CLOCK_MOVES &&
            rest.moves > 0 &&
            rate(low) >= rate(rest) * LOW_CLOCK_FACTOR &&
            low.errors > 0
        )
            priorities.push({ kind: "lowClock", low, rest });
        if (phases?.conversion && phases.conversion.rate < CONVERSION_TARGET)
            priorities.push({ kind: "conversion", ...phases.conversion });
        if (phases?.defense && phases.defense.rate < DEFENSE_TARGET)
            priorities.push({ kind: "defense", ...phases.defense });
    }
    const verdict = howToPlay(games, null);
    for (const color of ["white", "black"] as const) {
        const worst = verdict.weakOpenings[color][0];
        if (worst)
            priorities.push({ kind: "opening", color, name: worst.name, bucket: worst.bucket });
    }
    const worstTimeControl = groupResults(games, (game) => game.timeControlCategory)
        .filter(
            (bucket) => bucket.ratedGames >= MIN_RATING_PAR_GAMES && (bucket.parDelta ?? 0) <= -5,
        )
        .sort((a, b) => (a.parDelta ?? 0) - (b.parDelta ?? 0))[0];
    if (worstTimeControl)
        priorities.push({
            kind: "timeControl",
            timeControl: worstTimeControl.key,
            bucket: worstTimeControl,
        });
    return { priorities, games: games.length, analyzedGames };
}
