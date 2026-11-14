import type { Key } from "@lichess-org/chessground/types";
import { makeSquare, parseUci } from "chessops";
import { makeFen } from "chessops/fen";
import type { ScoreValue } from "@/bindings";
import { positionFromFen } from "@/utils/chessops";
import type { EngineLine } from "@/utils/moveExplanation";
import type { RetroBest } from "@/utils/retro";
import { formatScore } from "@/utils/score";

export type ReviewLineKind = "attempt" | "best" | "game";

/** A line shown after a mistake is revealed, from the position of the exercise. */
export type ReviewLine = {
    kind: ReviewLineKind;
    uci: string[];
    san: string[];
    /** Evaluation at the end of the line (white's point of view); null while it is computed. */
    score: ScoreValue | null;
};

/**
 * The lines that explain a mistake: the move the student found (when it is not the engine's),
 * the engine's best line and the game move with how it is punished.
 */
export function buildReviewLines({
    played,
    attempt,
    best,
    refutation,
}: {
    played: { uci: string; san: string };
    attempt?: EngineLine | null;
    best?: RetroBest | null;
    refutation?: EngineLine | null;
}): ReviewLine[] {
    const lines: ReviewLine[] = [];
    if (attempt && attempt.uci.length > 0 && attempt.uci[0] !== best?.uci) {
        lines.push({ kind: "attempt", ...attempt });
    }
    if (best) {
        const line = best.line ?? { uci: [best.uci], san: [best.san], score: best.score };
        lines.push({ kind: "best", ...line });
    }
    lines.push({
        kind: "game",
        uci: [played.uci, ...(refutation?.uci ?? [])],
        san: [played.san, ...(refutation?.san ?? [])],
        score: refutation?.score ?? null,
    });
    return lines;
}

/** The position after the first `ply` moves of a line, with the last move to highlight. */
export function positionAfter(
    fen: string,
    uci: readonly string[],
    ply: number,
): { fen: string; turn: "white" | "black"; lastMove?: [Key, Key] } {
    const [position] = positionFromFen(fen);
    if (!position) return { fen, turn: "white" };
    let lastMove: [Key, Key] | undefined;
    for (const value of uci.slice(0, ply)) {
        const move = parseUci(value);
        if (!move || !("from" in move) || !position.isLegal(move)) break;
        position.play(move);
        lastMove = [makeSquare(move.from), makeSquare(move.to)];
    }
    return { fen: makeFen(position.toSetup()), turn: position.turn, lastMove };
}

/** Move labels of a line from a position: "12. Qd6", "12... Nd7", then numbers on white moves. */
export function numberedMoves(fen: string, san: readonly string[]): string[] {
    const [, turn = "w", , , , fullmove = "1"] = fen.split(" ");
    let number = Number.parseInt(fullmove, 10) || 1;
    let white = turn === "w";
    return san.map((move, index) => {
        const label = white ? `${number}. ${move}` : index === 0 ? `${number}... ${move}` : move;
        if (!white) number += 1;
        white = !white;
        return label;
    });
}

/** Evaluation of a line; a mate already on the board is "#". */
export function formatLineScore(score: ScoreValue): string {
    return score.type === "mate" && score.value === 0 ? "#" : formatScore(score, 2);
}
