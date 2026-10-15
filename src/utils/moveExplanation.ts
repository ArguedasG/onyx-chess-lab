import type { DrawShape } from "@lichess-org/chessground/draw";
import { type Color, makeSquare, parseUci, type Role } from "chessops";
import type { ScoreValue } from "@/bindings";
import { makeFen } from "chessops/fen";
import { positionFromFen } from "./chessops";
import { formatScore } from "./score";

/**
 * Explanations of a mistake built only from engine facts, without AI (idea I-24): what the move
 * allowed, how the evaluation changed and what the best move was. Each sentence is an i18n key with
 * its parameters, so the wording can later be rewritten (by hand or a model) without changing the
 * facts behind it.
 */

export type EngineLine = { uci: string[]; san: string[]; score: ScoreValue };

export type ExplanationSentence = { key: string; params: Record<string, string | number> };

export type MistakeFacts = {
    /** Position before the mistake. */
    fen: string;
    played: { uci: string; san: string };
    /** Side that made the mistake. */
    color: Color;
    /** Engine's best line from `fen`. */
    best?: EngineLine;
    /** Engine's best line after the mistake: the opponent's punishment. */
    refutation?: EngineLine;
};

/** Moves until mate for `color` (positive), or null. Scores are from White's side. */
export function mateFor(score: ScoreValue, color: Color): number | null {
    if (score.type !== "mate" || score.value === 0) return null;
    const forWhite = score.value > 0;
    return forWhite === (color === "white") ? Math.abs(score.value) : null;
}

/** What the first move of `line` captures, played from `fen`. */
export function capturedBy(fen: string, uci: string): { role: Role; square: string } | null {
    const [position] = positionFromFen(fen);
    const move = parseUci(uci);
    if (!position || !move || !("from" in move)) return null;
    const captured = position.board.get(move.to);
    if (captured) return { role: captured.role, square: makeSquare(move.to) };
    // En passant: a pawn moving diagonally to an empty square.
    const mover = position.board.get(move.from);
    if (mover?.role === "pawn" && (move.from - move.to) % 8 !== 0) {
        return { role: "pawn", square: makeSquare(move.to + (position.turn === "white" ? -8 : 8)) };
    }
    return null;
}

/** FEN after playing `uci` from `fen`, or null when the move is not legal there. */
export function fenAfterMove(fen: string, uci: string): string | null {
    const [position] = positionFromFen(fen);
    const move = parseUci(uci);
    if (!position || !move || !position.isLegal(move)) return null;
    position.play(move);
    return makeFen(position.toSetup());
}

export function explainMistake(facts: MistakeFacts) {
    const positionAfterMistake = fenAfterMove(facts.fen, facts.played.uci);
    const sentences: ExplanationSentence[] = [];
    const opponent: Color = facts.color === "white" ? "black" : "white";
    const { refutation, best } = facts;
    if (refutation && refutation.san.length > 0) {
        const mate = mateFor(refutation.score, opponent);
        if (mate !== null) {
            sentences.push({
                key: "Explain.AllowsMate",
                params: {
                    move: facts.played.san,
                    moves: mate,
                    line: refutation.san.slice(0, mate * 2 - 1).join(" "),
                },
            });
        } else {
            const capture = positionAfterMistake
                ? capturedBy(positionAfterMistake, refutation.uci[0])
                : null;
            sentences.push(
                capture
                    ? {
                          key: "Explain.AllowsCapture",
                          params: {
                              move: facts.played.san,
                              reply: refutation.san[0],
                              piece: capture.role,
                              square: capture.square,
                          },
                      }
                    : {
                          key: "Explain.Allows",
                          params: { move: facts.played.san, reply: refutation.san[0] },
                      },
            );
        }
    }
    if (best && refutation) {
        sentences.push({
            key: "Explain.EvalChange",
            params: { before: formatScore(best.score), after: formatScore(refutation.score) },
        });
    }
    if (best && best.san.length > 0 && best.uci[0] !== facts.played.uci) {
        const mate = mateFor(best.score, facts.color);
        sentences.push(
            mate !== null
                ? { key: "Explain.BestMates", params: { best: best.san[0], moves: mate } }
                : { key: "Explain.Best", params: { best: best.san[0] } },
        );
    }
    return sentences;
}

function arrow(uci: string | undefined, brush: string): DrawShape[] {
    const move = uci ? parseUci(uci) : undefined;
    if (!move || !("from" in move)) return [];
    return [{ orig: makeSquare(move.from), dest: makeSquare(move.to), brush }];
}

/**
 * Arrows on the position before the mistake (idea I-46): the move played in red and the best
 * move in green. The square the punishment captures on is circled.
 */
export function mistakeShapes(facts: MistakeFacts): DrawShape[] {
    const positionAfterMistake = fenAfterMove(facts.fen, facts.played.uci);
    const shapes = [...arrow(facts.played.uci, "red"), ...arrow(facts.best?.uci[0], "green")];
    const reply = facts.refutation?.uci[0];
    const capture = reply && positionAfterMistake ? capturedBy(positionAfterMistake, reply) : null;
    if (capture) shapes.push({ orig: capture.square as DrawShape["orig"], brush: "red" });
    return shapes;
}
