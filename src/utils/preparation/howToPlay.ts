/**
 * "How to play against them" (I-32): the lines, structures and kinds of game where a player
 * scores below what the ratings predict (I-30), and the phases where they make more or fewer
 * errors when there is an engine analysis. Only facts with their sample; the wording is a
 * template in the interface and the conclusion is a suggestion, not a certainty.
 */
import type { PawnStructure } from "@/bindings";
import { openingLevelKey, openingNameLevels } from "@/utils/openingFamilies";
import type { PlayerAnalysisPhase, PlayerEngineAnalysis } from "@/utils/playerAnalysis";
import type { ProfileGame } from "@/utils/players/profileGames";
import { groupResults, openingOf, type ResultBucket, resultBucket } from "@/utils/players/results";
import { MIN_RATING_PAR_GAMES } from "@/utils/ratingPar";
import type { GeneratorColor } from "@/utils/repertoireGenerator/types";
import { gameTypeRows, type StructureRole, structureRows } from "./structures";

/** A difference this large, in percentage points, is worth mentioning. */
export const PAR_MARGIN = 5;
/** Below this many games in total the verdict is not attempted. */
export const MIN_VERDICT_GAMES = 15;
/** Phase error rates are compared from this many moves. */
const MIN_PHASE_MOVES = 60;
const MAX_ITEMS = 3;

export type OpeningFinding = { color: GeneratorColor; name: string; bucket: ResultBucket };
export type StructureFinding = {
    structure: PawnStructure;
    role: StructureRole;
    bucket: ResultBucket;
};
export type GameTypeFinding = { type: "earlyQueens" | "endgames"; bucket: ResultBucket };
export type PhaseFinding = {
    phase: PlayerAnalysisPhase;
    /** Mistakes and blunders per 100 moves in the phase and on average. */
    rate: number;
    average: number;
    moves: number;
};

export type HowToPlay = {
    games: number;
    overall: ResultBucket;
    byColor: Record<GeneratorColor, ResultBucket>;
    /** Lines below par (aim for them) and above par (better avoided), per color of the player. */
    weakOpenings: Record<GeneratorColor, OpeningFinding[]>;
    strongOpenings: Record<GeneratorColor, OpeningFinding[]>;
    weakStructures: StructureFinding[];
    weakGameTypes: GameTypeFinding[];
    /** From the engine analysis of the same games, when there is one. */
    engine: {
        games: number;
        worstPhase: PhaseFinding | null;
        bestPhase: PhaseFinding | null;
        conversion: { rate: number; games: number } | null;
        defense: { rate: number; games: number } | null;
    } | null;
    verdict: "targets" | "playYourRepertoire" | "tooFewGames";
};

function reliable(bucket: ResultBucket) {
    return bucket.ratedGames >= MIN_RATING_PAR_GAMES && bucket.parDelta != null;
}

/** Weighs the difference by the sample, so 40 games at −8 come before 10 games at −9. */
function weight(bucket: ResultBucket) {
    return (bucket.parDelta ?? 0) * Math.sqrt(bucket.ratedGames);
}

function openingLevels(games: readonly ProfileGame[]): ResultBucket[] {
    const levels = [1, 2, 3].flatMap((depth) =>
        groupResults(games, (game) => {
            const parts = openingNameLevels(openingOf(game));
            return parts.length >= depth ? openingLevelKey(parts.slice(0, depth)) : null;
        }),
    );
    return levels.filter(reliable);
}

/** Keeps the most telling levels and drops a family when one of its variations says the same. */
function pick(buckets: ResultBucket[], direction: "weak" | "strong"): ResultBucket[] {
    const flagged = buckets.filter((bucket) =>
        direction === "weak" ? bucket.parDelta! <= -PAR_MARGIN : bucket.parDelta! >= PAR_MARGIN,
    );
    flagged.sort((a, b) => (direction === "weak" ? weight(a) - weight(b) : weight(b) - weight(a)));
    const chosen: ResultBucket[] = [];
    for (const bucket of flagged) {
        if (
            chosen.some(
                (other) => other.key.startsWith(bucket.key) || bucket.key.startsWith(other.key),
            )
        )
            continue;
        chosen.push(bucket);
        if (chosen.length >= MAX_ITEMS) break;
    }
    return chosen;
}

function phaseFindings(engine: PlayerEngineAnalysis, keys: Set<string>) {
    const games = engine.games.filter((game) => keys.has(game.key));
    if (games.length === 0) return null;
    const phases = (["opening", "middlegame", "endgame"] as const).map((phase) => {
        let moves = 0;
        let errors = 0;
        for (const game of games) {
            const value = game.phases.find((candidate) => candidate.phase === phase);
            if (!value) continue;
            moves += value.moves;
            errors += value.mistakes + value.blunders;
        }
        return { phase, moves, errors };
    });
    const totalMoves = phases.reduce((sum, value) => sum + value.moves, 0);
    const totalErrors = phases.reduce((sum, value) => sum + value.errors, 0);
    const average = totalMoves ? (totalErrors / totalMoves) * 100 : 0;
    const rated = phases
        .filter((value) => value.moves >= MIN_PHASE_MOVES)
        .map((value) => ({
            phase: value.phase,
            rate: (value.errors / value.moves) * 100,
            average,
            moves: value.moves,
        }));
    const worst = [...rated].sort((a, b) => b.rate - a.rate)[0];
    const best = [...rated].sort((a, b) => a.rate - b.rate)[0];
    const advantage = games.filter((game) => game.hadAdvantage);
    const inferior = games.filter((game) => game.wasInferior);
    return {
        games: games.length,
        worstPhase: worst && average > 0 && worst.rate >= average * 1.5 ? worst : null,
        bestPhase:
            best && average > 0 && best.rate <= average * 0.67 && best.phase !== worst?.phase
                ? best
                : null,
        conversion:
            advantage.length >= 5
                ? {
                      rate:
                          (advantage.filter((game) => game.convertedAdvantage).length /
                              advantage.length) *
                          100,
                      games: advantage.length,
                  }
                : null,
        defense:
            inferior.length >= 5
                ? {
                      rate:
                          (inferior.filter((game) => game.savedInferior).length / inferior.length) *
                          100,
                      games: inferior.length,
                  }
                : null,
    };
}

export function howToPlay(
    games: readonly ProfileGame[],
    engine: PlayerEngineAnalysis | null,
): HowToPlay {
    const byColorGames = {
        white: games.filter((game) => game.isWhite),
        black: games.filter((game) => !game.isWhite),
    };
    const weakOpenings = { white: [] as OpeningFinding[], black: [] as OpeningFinding[] };
    const strongOpenings = { white: [] as OpeningFinding[], black: [] as OpeningFinding[] };
    for (const color of ["white", "black"] as const) {
        const levels = openingLevels(byColorGames[color]);
        weakOpenings[color] = pick(levels, "weak").map((bucket) => ({
            color,
            name: bucket.key,
            bucket,
        }));
        strongOpenings[color] = pick(levels, "strong")
            .slice(0, 2)
            .map((bucket) => ({ color, name: bucket.key, bucket }));
    }
    const weakStructures: StructureFinding[] = structureRows(games)
        .flatMap((row) => [
            { structure: row.structure, role: "own" as const, bucket: row.own },
            { structure: row.structure, role: "against" as const, bucket: row.against },
        ])
        .filter((item) => reliable(item.bucket) && item.bucket.parDelta! <= -PAR_MARGIN)
        .sort((a, b) => weight(a.bucket) - weight(b.bucket))
        .slice(0, MAX_ITEMS);
    const types = gameTypeRows(games);
    const weakGameTypes: GameTypeFinding[] = (
        [
            { type: "earlyQueens", bucket: types.earlyQueens },
            { type: "endgames", bucket: types.endgames },
        ] as GameTypeFinding[]
    ).filter((item) => reliable(item.bucket) && item.bucket.parDelta! <= -PAR_MARGIN);
    const keys = new Set(games.map((game) => game.key));
    const engineFindings = engine ? phaseFindings(engine, keys) : null;
    const hasTargets =
        weakOpenings.white.length +
            weakOpenings.black.length +
            weakStructures.length +
            weakGameTypes.length >
            0 || Boolean(engineFindings?.worstPhase);
    return {
        games: games.length,
        overall: resultBucket("all", games),
        byColor: {
            white: resultBucket("white", byColorGames.white),
            black: resultBucket("black", byColorGames.black),
        },
        weakOpenings,
        strongOpenings,
        weakStructures,
        weakGameTypes,
        engine: engineFindings,
        verdict:
            games.length < MIN_VERDICT_GAMES
                ? "tooFewGames"
                : hasTargets
                  ? "targets"
                  : "playYourRepertoire",
    };
}
