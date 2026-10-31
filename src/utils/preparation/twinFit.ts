/**
 * Measuring a twin profile against the player's games (9.3 extension). Three runs share the Rust
 * command `measure_player_style`:
 *
 * - **style**: the two style weights at the profile's rating, as in 9.3 (one pass of Maia);
 * - **autotune**: the weights, the temperature and Maia's rating up to ±200 (five passes);
 * - **fixed**: the profile's current way of playing, hand-made or not, against Maia alone on every
 *   game (one or two passes).
 *
 * The fitted runs leave the most recent games out and are used only if they predict them better
 * than Maia alone at the player's rating; the interface says when Maia wins.
 */
import { commands, events, type PlayerStyleMeasurement } from "@/bindings";
import { clampMaiaElo, MAIA_ELO_MAX } from "@/utils/humanBots";
import type { LocalEngine } from "@/utils/engines";
import { chronological, type ProfileGame } from "@/utils/players/profileGames";
import { unwrap } from "@/utils/unwrap";
import { autotuneElos, type TwinEvaluation, type TwinPlay } from "./savedTwins";
import { splitForFidelity } from "./twin";

export type TwinFitKind = TwinEvaluation["kind"];

/** Positions measured per pass: about a minute or two with the managed Maia 3. */
export const FIT_POSITIONS = 400;
/** Games read, most recent first. */
export const FIT_GAMES = 200;
/** Games a profile needs to be measured. */
export const FIT_MIN_GAMES = 20;

/** Passes of Maia a run makes, to tell the user how long it takes. */
export function fitPasses(kind: TwinFitKind, play: TwinPlay, rating: number | null): number {
    return new Set([baselineElo(play, rating), ...ratingsTried(kind, play)]).size;
}

/** Ratings measured besides the baseline: the profile's own and, for the autotune, around it. */
function ratingsTried(kind: TwinFitKind, play: TwinPlay): number[] {
    if (kind === "autotune") return [clampMaiaElo(play.elo), ...autotuneElos(play.elo).extra];
    if (kind === "fixed") return [clampMaiaElo(play.elo)];
    return [];
}

/** Maia's rating the comparison is made against: the profile's own, within Maia's range. */
function baselineElo(play: TwinPlay, rating?: number | null) {
    return clampMaiaElo(rating ?? play.elo);
}

export function evaluationOf(
    kind: TwinFitKind,
    measurement: PlayerStyleMeasurement,
    baseElo: number,
    current: TwinPlay,
): TwinEvaluation {
    // Above Maia's range the strength filter plays the rest: the fitted rating replaces the
    // profile's only inside the range.
    const elo = kind === "autotune" && current.elo <= MAIA_ELO_MAX ? measurement.elo : current.elo;
    return {
        at: new Date().toISOString(),
        kind,
        play:
            kind === "fixed"
                ? current
                : {
                      elo,
                      aggression: measurement.weightsAggression,
                      simplification: measurement.weightsSimplification,
                      temperature:
                          kind === "autotune" ? measurement.temperature : current.temperature,
                  },
        positions: measurement.testPositions,
        maiaElo: baseElo,
        maia: measurement.maia,
        twin: measurement.styled,
        improves: measurement.improves,
        aggression: {
            delta: measurement.aggression.delta,
            stdError: measurement.aggression.stdError,
        },
        simplification: {
            delta: measurement.simplification.delta,
            stdError: measurement.simplification.stdError,
        },
        eloFits: measurement.eloFits,
    };
}

/**
 * Runs a measurement of a profile's games. `rating` is the player's rating at the profile's
 * rhythm, the baseline Maia is compared at. Returns `null` when cancelled.
 */
export async function runTwinFit(options: {
    id: string;
    kind: TwinFitKind;
    games: readonly ProfileGame[];
    play: TwinPlay;
    rating: number | null;
    maia: LocalEngine;
    onProgress: (progress: number) => void;
}): Promise<TwinEvaluation | null> {
    const { id, kind, games, play, rating, maia, onProgress } = options;
    const own = chronological(games.filter((game) => !game.customStart))
        .reverse()
        .slice(0, FIT_GAMES);
    // A fixed configuration fits nothing, so every game checks it.
    const testKeys =
        kind === "fixed" ? null : new Set(splitForFidelity(own).test.map((game) => game.key));
    // The style is measured at the profile's rating, as in 9.3; the other runs compare with Maia
    // at the player's rating.
    const base = kind === "style" ? clampMaiaElo(play.elo) : baselineElo(play, rating);
    const unlisten = await events.progressEvent.listen(({ payload }) => {
        if (payload.id === id && !payload.finished) onProgress(payload.progress);
    });
    try {
        const measurement = unwrap(
            await commands.measurePlayerStyle({
                id,
                games: own.map((game) => ({
                    file: game.source.databasePath,
                    id: game.id,
                    playerWhite: game.isWhite,
                    opponentElo: game.opponentElo,
                    test: testKeys ? testKeys.has(game.key) : true,
                })),
                maiaPath: maia.path,
                maiaArgs: maia.args ?? [],
                elo: base,
                maxPositions: FIT_POSITIONS,
                extraElos: kind === "autotune" ? ratingsTried(kind, play) : [],
                fitTemperature: kind === "autotune",
                fixed:
                    kind === "fixed"
                        ? {
                              elo: clampMaiaElo(play.elo),
                              aggression: play.aggression,
                              simplification: play.simplification,
                              temperature: play.temperature,
                          }
                        : null,
            }),
        );
        if (measurement.cancelled) return null;
        return evaluationOf(kind, measurement, base, play);
    } finally {
        unlisten();
    }
}
