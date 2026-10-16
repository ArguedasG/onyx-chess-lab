import { makeFen } from "chessops/fen";
import { makeSan } from "chessops/san";
import { makeUci, parseUci, type Move } from "chessops";
import { normalizeMove } from "chessops/chess";
import { positionFromFen } from "@/utils/chessops";

/** Position key without move counters, the same for every move order. */
export function positionKey(fen: string): string {
    return fen.split(" ").slice(0, 4).join(" ");
}

/**
 * UCI of a move as engines write it ("e1g1" for castling), whatever form it came in ("e1h1" is
 * how Onyx and chessops store castling). Returns null for an illegal move.
 */
export function canonicalUci(fen: string, uci: string): string | null {
    const [position] = positionFromFen(fen);
    const move = parseUci(uci);
    if (!position || !move || !("from" in move)) return null;
    const normalized = normalizeMove(position, move) as Move & { from: number; to: number };
    if (!position.isLegal(normalized)) return null;
    const piece = position.board.get(normalized.from);
    const target = position.board.get(normalized.to);
    if (piece?.role === "king" && target?.role === "rook" && target.color === piece.color) {
        const rank = normalized.from >> 3;
        const kingSide = normalized.to > normalized.from;
        const file = kingSide ? 6 : 2;
        return makeUci({ from: normalized.from, to: rank * 8 + file });
    }
    return makeUci(normalized);
}

/** Plays a move: the FEN after it, its SAN and the canonical UCI. */
export function playUci(
    fen: string,
    uci: string,
): { fen: string; san: string; uci: string } | null {
    const [position] = positionFromFen(fen);
    const move = parseUci(uci);
    if (!position || !move) return null;
    const normalized = normalizeMove(position, move);
    if (!position.isLegal(normalized)) return null;
    const san = makeSan(position, normalized);
    const canonical = canonicalUci(fen, uci);
    position.play(normalized);
    return { fen: makeFen(position.toSetup()), san, uci: canonical ?? uci };
}

export function sideToMove(fen: string): "white" | "black" {
    return fen.split(" ")[1] === "b" ? "black" : "white";
}

export function isGameOver(fen: string): boolean {
    const [position] = positionFromFen(fen);
    return !position || position.isEnd();
}
