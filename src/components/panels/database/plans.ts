import type { DrawShape } from "@lichess-org/chessground/draw";
import type { Key } from "@lichess-org/chessground/types";
import type { PlanMove, PositionPlans } from "@/bindings";

/** Below this many rated games a score difference is noise, so none is shown. */
export const PLAN_MIN_RATED_GAMES = 30;
export const PLAN_MAX_ARROWS = 5;

export const isCapture = (move: PlanMove) => move.captures * 2 > move.games;

type MoveShape = Pick<PlanMove, "piece" | "from" | "to" | "castle" | "promotion">;

/**
 * "d2-d3", "Ng1-f3", "Bb4×c3", "e7-e8=Q", "O-O": a move told apart from its order. In a
 * pawn-structure search pieces have no origin and read "N→f3".
 */
export function planMoveName(move: MoveShape, capture = false): string {
    if (move.castle) return move.castle;
    const piece = move.piece === "P" ? "" : move.piece;
    const promotion = move.promotion ? `=${move.promotion}` : "";
    if (!move.from) return `${piece}→${move.to}${promotion}`;
    return `${piece}${move.from}${capture ? "×" : "-"}${move.to}${promotion}`;
}

/** A move of the Plans view by name, marking captures. */
export const planViewName = (move: PlanMove) => planMoveName(move, isCapture(move));

/**
 * Percentage points the move scores above (or below) what the ratings predict, beyond the
 * position's own margin. Null without enough rated games on either side.
 */
export function planMoveDelta(move: PlanMove, plans: PositionPlans): number | null {
    if (move.ratedGames < PLAN_MIN_RATED_GAMES || plans.ratedGames < PLAN_MIN_RATED_GAMES) {
        return null;
    }
    return (move.score - move.expected - (plans.score - plans.expected)) * 100;
}

/** The moves shown for a threshold, as indexes into `plans.moves` (already most played first). */
export function visiblePlanMoves(
    plans: PositionPlans,
    minShare: number,
    hideCaptures: boolean,
): number[] {
    return plans.moves.flatMap((move, i) =>
        plans.games > 0 &&
        move.games / plans.games >= minShare &&
        !(hideCaptures && isCapture(move))
            ? [i]
            : [],
    );
}

/**
 * The drawn plan: the most played moves that neither clash (the same piece leaving the same
 * square for two destinations, or both castles) nor belong to different games (each pair must
 * meet in at least half the games of the rarer one). Ordered by when they are usually played.
 */
export function typicalPlan(plans: PositionPlans, candidates: number[]): number[] {
    const chosen: number[] = [];
    for (const i of candidates) {
        if (chosen.length >= PLAN_MAX_ARROWS) break;
        const move = plans.moves[i];
        const fits = chosen.every((j) => {
            const other = plans.moves[j];
            // Moves known only by destination may be different pieces of the same kind.
            const clash =
                move.from !== "" &&
                other.piece === move.piece &&
                other.from === move.from &&
                other.to !== move.to;
            const together = move.together[j] >= 0.5 * Math.min(move.games, other.games);
            return !clash && together;
        });
        if (fits) chosen.push(i);
    }
    return chosen.sort((a, b) => plans.moves[a].typicalMove - plans.moves[b].typicalMove);
}

/** Numbered arrows for the plan, plus the hovered move when it is not part of it. */
export function planShapes(
    plans: PositionPlans,
    plan: number[],
    white: boolean,
    hovered: number | null,
): DrawShape[] {
    const brush = white ? "blue" : "purple";
    // A move known only by destination is a circle on that square.
    const shape = (move: PlanMove, brush: string): DrawShape =>
        move.from
            ? { orig: move.from as Key, dest: move.to as Key, brush }
            : { orig: move.to as Key, brush };
    const shapes: DrawShape[] = plan.map((i, step) => ({
        ...shape(plans.moves[i], hovered === i ? "yellow" : brush),
        label: { text: String(step + 1) },
    }));
    if (hovered != null && !plan.includes(hovered) && plans.moves[hovered]) {
        shapes.push(shape(plans.moves[hovered], "yellow"));
    }
    return shapes;
}
