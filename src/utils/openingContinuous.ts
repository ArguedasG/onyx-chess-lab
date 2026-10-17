import type { OpeningLine, OpeningsState } from "@/utils/trainingAreas";

/**
 * «Continuous review» of a repertoire (I-36): a session without pauses, grades or a fixed end, in
 * which the opponent steers towards the weakest branch according to the mastery of each move.
 *
 * It sits apart from spaced repetition: FSRS keeps deciding what is due today and this mode never
 * touches its cards. Move results still count, since they are what mastery is made of.
 */

export type ContinuousSession = {
    /** Lines the session draws from. */
    pool: string[];
    /** Lines finished in this session. */
    played: number;
    /** Lines finished without mistakes. */
    clean: number;
    /** Last lines played, to avoid repeating them at once. */
    recent: string[];
    /** Failed lines and the count of played lines after which they come back. */
    comeback: Array<{ lineId: string; at: number }>;
};

export const CONTINUOUS_RECENT = 2;
/** A failed line comes back after this many other lines. */
export const CONTINUOUS_COMEBACK_AFTER = 2;
/** Below this mastery a move is weak: it gets a hint and pulls its line forward. */
export const CONTINUOUS_HINT_BELOW = 0.6;
/** Even a mastered line can appear, but rarely. */
const MIN_WEIGHT = 0.03;

export function newContinuousSession(pool: string[]): ContinuousSession {
    return { pool, played: 0, clean: 0, recent: [], comeback: [] };
}

type Progress = { attempts: number; successes: number };

function prefixKey(line: Pick<OpeningLine, "fen" | "moves">, ply: number) {
    return `${line.fen.split(" ").slice(0, 4).join(" ")}|${line.moves.slice(0, ply + 1).join(" ")}`;
}

/**
 * Results of each move across the lines that share it: a move common to ten lines is one move,
 * and failing it in one of them makes it weak in all.
 */
export function aggregateMoveProgress(lines: readonly OpeningLine[]): Map<string, Progress> {
    const progress = new Map<string, Progress>();
    for (const line of lines) {
        for (const [ply, value] of Object.entries(line.moveProgress)) {
            const key = prefixKey(line, Number(ply));
            const current = progress.get(key) ?? { attempts: 0, successes: 0 };
            progress.set(key, {
                attempts: current.attempts + value.attempts,
                successes: current.successes + value.successes,
            });
        }
    }
    return progress;
}

/** Laplace estimate of answering the move right; a move never asked is in the middle. */
export function moveMastery(progress: Progress | undefined): number {
    if (!progress || progress.attempts === 0) return 0.5;
    return (progress.successes + 1) / (progress.attempts + 2);
}

export type ContinuousColor = "white" | "black" | null;

/**
 * Plies of the line played by the student, from its start position and color. Without a color
 * (a repertoire for both sides) the plies already asked in practice are the student's.
 */
export function studentPlies(
    line: Pick<OpeningLine, "fen" | "moves"> & Partial<Pick<OpeningLine, "moveProgress">>,
    color: ContinuousColor,
) {
    if (color === null) {
        return Object.keys(line.moveProgress ?? {})
            .map(Number)
            .filter((ply) => Number.isInteger(ply) && ply < line.moves.length);
    }
    const whiteFirst = line.fen.split(" ")[1] !== "b";
    return line.moves.flatMap((_, ply) => {
        const whiteMoves = (ply % 2 === 0) === whiteFirst;
        return whiteMoves === (color === "white") ? [ply] : [];
    });
}

export function lineMastery(
    line: OpeningLine,
    progress: Map<string, Progress>,
    color: ContinuousColor,
): number {
    const plies = studentPlies(line, color);
    if (plies.length === 0) return color === null ? 0.5 : 1;
    return Math.min(...plies.map((ply) => moveMastery(progress.get(prefixKey(line, ply)))));
}

export function moveMasteryAt(
    line: OpeningLine,
    ply: number,
    progress: Map<string, Progress>,
): number {
    return moveMastery(progress.get(prefixKey(line, ply)));
}

/**
 * Next line: a failed line whose turn to come back has arrived, otherwise a weighted draw where
 * weak lines weigh much more than mastered ones and the last lines played are left out.
 */
export function nextContinuousLine(
    state: OpeningsState,
    session: ContinuousSession,
    color: ContinuousColor,
    random: () => number = Math.random,
): { lineId: string; session: ContinuousSession } | null {
    const lines = session.pool.flatMap((id) => (state.lines[id] ? [state.lines[id]] : []));
    if (lines.length === 0) return null;
    const due = session.comeback.find((entry) => entry.at <= session.played);
    if (due && state.lines[due.lineId]) {
        return {
            lineId: due.lineId,
            session: { ...session, comeback: session.comeback.filter((entry) => entry !== due) },
        };
    }
    const progress = aggregateMoveProgress(lines);
    const avoid = new Set(session.recent.slice(-Math.min(CONTINUOUS_RECENT, lines.length - 1)));
    const candidates = lines.filter((line) => !avoid.has(line.id));
    const weights = candidates.map(
        (line) => (1 - lineMastery(line, progress, color)) ** 2 + MIN_WEIGHT,
    );
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let draw = random() * total;
    for (const [index, line] of candidates.entries()) {
        draw -= weights[index];
        if (draw <= 0) return { lineId: line.id, session };
    }
    return { lineId: candidates[candidates.length - 1].id, session };
}

export function afterContinuousLine(
    session: ContinuousSession,
    lineId: string,
    mistakes: number,
): ContinuousSession {
    const played = session.played + 1;
    const comeback = session.comeback.filter((entry) => entry.lineId !== lineId);
    if (mistakes > 0) comeback.push({ lineId, at: played + CONTINUOUS_COMEBACK_AFTER });
    return {
        ...session,
        played,
        clean: session.clean + (mistakes === 0 ? 1 : 0),
        recent: [...session.recent, lineId].slice(-CONTINUOUS_RECENT),
        comeback,
    };
}

/** Piece that has to move, for a hint that does not give the move away. */
export function hintPiece(san: string): "king" | "queen" | "rook" | "bishop" | "knight" | "pawn" {
    if (san.startsWith("O-O")) return "king";
    switch (san[0]) {
        case "K":
            return "king";
        case "Q":
            return "queen";
        case "R":
            return "rook";
        case "B":
            return "bishop";
        case "N":
            return "knight";
        default:
            return "pawn";
    }
}
