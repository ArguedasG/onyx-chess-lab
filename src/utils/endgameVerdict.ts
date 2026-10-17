import type { ScoreValue } from "@/bindings";
import type { EndgameStudentColor, TrainingObjective } from "@/utils/trainingAreas";

/**
 * Whether an endgame objective is still reachable against perfect defense (I-07).
 *
 * A move is not judged by how good it is but by whether the objective survives it: a win that
 * goes from mate in 10 to mate in 25 is still a win. With 7 pieces or fewer the tablebase answers
 * exactly; above that Stockfish decides with declared thresholds and prudent wording.
 */

/** Theoretical result for the student. */
export type EndgameOutcome = "win" | "draw" | "loss";

export type EndgameVerdictSource = "tablebase" | "engine";

export type EndgameVerdict = {
    outcome: EndgameOutcome | null;
    /** `null` when nothing can be said (unknown objective or result). */
    reachable: boolean | null;
    source: EndgameVerdictSource;
    /** Engine score from the student's point of view, when the engine decided. */
    studentScore?: ScoreValue;
};

const OUTCOME_RANK: Record<EndgameOutcome, number> = { win: 2, draw: 1, loss: 0 };

/** Stockfish thresholds, in centipawns from the student's point of view. */
export const ENGINE_WIN_LOST_BELOW_CP = 70;
export const ENGINE_DRAW_LOST_BELOW_CP = -150;
/** A start position judged closer than this to the threshold moves the threshold down. */
export const ENGINE_START_MARGIN_CP = 150;
/** Far below the threshold, one reading is enough; otherwise two in a row confirm it. */
export const ENGINE_CLEAR_DROP_CP = 150;

export function objectiveRank(objective: TrainingObjective): number | null {
    if (objective === "win") return 2;
    if (objective === "draw") return 1;
    if (objective === "loss") return 0;
    return null;
}

export function isOutcomeEnough(outcome: EndgameOutcome, objective: TrainingObjective) {
    const required = objectiveRank(objective);
    return required === null ? null : OUTCOME_RANK[outcome] >= required;
}

/**
 * Tablebase category of a position (for its side to move) as a result for the student.
 * `maybe-` categories depend on the 50-move rule and rounding, so they are not conclusive.
 */
export function outcomeFromTablebase(
    category: string,
    sideToMove: EndgameStudentColor,
    studentColor: EndgameStudentColor,
): EndgameOutcome | null {
    const mover = sideToMove === studentColor;
    if (category === "win") return mover ? "win" : "loss";
    if (category === "loss") return mover ? "loss" : "win";
    // A cursed win or blessed loss can no longer be converted in time: the 50-move rule counts.
    if (category === "draw" || category === "cursed-win" || category === "blessed-loss") {
        return "draw";
    }
    return null;
}

export function tablebaseVerdict(
    category: string,
    sideToMove: EndgameStudentColor,
    studentColor: EndgameStudentColor,
    objective: TrainingObjective,
): EndgameVerdict {
    const outcome = outcomeFromTablebase(category, sideToMove, studentColor);
    return {
        outcome,
        reachable: outcome ? isOutcomeEnough(outcome, objective) : null,
        source: "tablebase",
    };
}

export function scoreForStudent(
    whiteScore: ScoreValue,
    studentColor: EndgameStudentColor,
): ScoreValue {
    if (studentColor === "white") return whiteScore;
    return { type: whiteScore.type, value: -whiteScore.value } as ScoreValue;
}

/**
 * Lowest score (for the student) that still counts as keeping the objective. When the start
 * position itself is judged close to the plain threshold, the engine does not see the result
 * clearly there, so only a clear drop from that start counts.
 */
export function engineLostBelow(
    objective: TrainingObjective,
    startScore: ScoreValue | null,
): number | null {
    const base =
        objective === "win"
            ? ENGINE_WIN_LOST_BELOW_CP
            : objective === "draw"
              ? ENGINE_DRAW_LOST_BELOW_CP
              : null;
    if (base === null) return null;
    if (!startScore || startScore.type !== "cp") return base;
    return Math.min(base, startScore.value - ENGINE_START_MARGIN_CP);
}

/** Probable result for the student from an engine score. */
export function outcomeFromScore(studentScore: ScoreValue): EndgameOutcome {
    if (studentScore.type === "mate") return studentScore.value > 0 ? "win" : "loss";
    if (studentScore.value >= 200) return "win";
    if (studentScore.value <= -200) return "loss";
    return "draw";
}

export function engineVerdict(
    whiteScore: ScoreValue,
    studentColor: EndgameStudentColor,
    objective: TrainingObjective,
    startScore: ScoreValue | null,
): EndgameVerdict {
    const studentScore = scoreForStudent(whiteScore, studentColor);
    const lostBelow = engineLostBelow(objective, startScore);
    let reachable: boolean | null;
    if (objective === "loss") reachable = true;
    else if (lostBelow === null) reachable = null;
    else if (studentScore.type === "mate") reachable = studentScore.value > 0;
    else reachable = studentScore.value >= lostBelow;
    return { outcome: outcomeFromScore(studentScore), reachable, source: "engine", studentScore };
}

/** Whether a single "not reachable" reading is enough, or it needs another one to confirm it. */
export function isConclusive(
    verdict: EndgameVerdict,
    objective: TrainingObjective,
    startScore: ScoreValue | null,
): boolean {
    if (verdict.source === "tablebase") return true;
    const score = verdict.studentScore;
    if (!score) return false;
    if (score.type === "mate") return true;
    const lostBelow = engineLostBelow(objective, startScore);
    return lostBelow !== null && score.value < lostBelow - ENGINE_CLEAR_DROP_CP;
}

/** One checked position: the one left after a student move, with the opponent to move. */
export type CheckedPly = {
    /** Moves played up to and including the student's move. */
    ply: number;
    verdict: EndgameVerdict;
};

export type ObjectiveWatchState = {
    /** Moves to keep to retry from the last position where the objective was verified. */
    retryPly: number;
    /** Ply of the move after which the objective was judged lost, or null. */
    lostAtPly: number | null;
    /** Last check, newest first by ply. */
    last: CheckedPly | null;
    /** A doubtful engine reading waiting for the next check to confirm it. */
    pendingDoubt: CheckedPly | null;
};

export function initialWatchState(startPly: number): ObjectiveWatchState {
    return { retryPly: startPly, lostAtPly: null, last: null, pendingDoubt: null };
}

/**
 * Folds a new check into the watch. Checks of older plies (a slow answer that arrives after a
 * newer one) are ignored. After the opponent's best reply, the position the student faces is
 * still good, so the retry point is the move after a verified check (`ply + 1`).
 */
export function applyCheck(
    state: ObjectiveWatchState,
    check: CheckedPly,
    objective: TrainingObjective,
    startScore: ScoreValue | null,
): ObjectiveWatchState {
    if (state.last && check.ply <= state.last.ply) return state;
    const { verdict } = check;
    if (verdict.reachable === null) return { ...state, last: check };
    if (verdict.reachable) {
        return {
            retryPly: check.ply + 1,
            lostAtPly: null,
            last: check,
            pendingDoubt: null,
        };
    }
    if (state.lostAtPly !== null) return { ...state, last: check };
    if (isConclusive(verdict, objective, startScore) || state.pendingDoubt) {
        return {
            ...state,
            lostAtPly: state.pendingDoubt?.ply ?? check.ply,
            last: check,
            pendingDoubt: null,
        };
    }
    return { ...state, last: check, pendingDoubt: check };
}

/** Rewinding drops the checks of the moves taken back. */
export function rewindWatch(state: ObjectiveWatchState, ply: number): ObjectiveWatchState {
    const keep = (check: CheckedPly | null) => (check && check.ply <= ply ? check : null);
    return {
        retryPly: Math.min(state.retryPly, ply),
        lostAtPly: state.lostAtPly !== null && state.lostAtPly <= ply ? state.lostAtPly : null,
        last: keep(state.last),
        pendingDoubt: keep(state.pendingDoubt),
    };
}
