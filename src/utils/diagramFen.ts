import { Chess } from "chessops/chess";
import { makeFen, parseFen } from "chessops/fen";

/** FEN helpers for positions read from images (phase 9.4): the editor and Books share them. */

/** The same board seen from the other side: placement reversed, squares mirrored. */
export function flipPlacement(placement: string): string {
    return placement
        .split("/")
        .reverse()
        .map((rank) => [...rank].reverse().join(""))
        .join("/");
}

export function flipSquare(square: string): string {
    const file = String.fromCharCode("a".charCodeAt(0) + "h".charCodeAt(0) - square.charCodeAt(0));
    return `${file}${9 - Number(square[1])}`;
}

/** Castling rights a diagram allows: king and rook still on their starting squares. */
export function inferCastling(placement: string): string {
    const ranks = placement
        .split("/")
        .map((rank) => rank.replace(/\d/g, (n) => ".".repeat(Number(n))));
    const at = (square: string) => ranks[8 - Number(square[1])]?.[square.charCodeAt(0) - 97];
    let rights = "";
    if (at("e1") === "K" && at("h1") === "R") rights += "K";
    if (at("e1") === "K" && at("a1") === "R") rights += "Q";
    if (at("e8") === "k" && at("h8") === "r") rights += "k";
    if (at("e8") === "k" && at("a8") === "r") rights += "q";
    return rights || "-";
}

/** A full FEN for a diagram: side to move and move number when known, castling inferred. */
export function diagramFen(placement: string, turn: "w" | "b", fullmove: number | null): string {
    return `${placement} ${turn} ${inferCastling(placement)} - 0 ${fullmove && fullmove > 0 ? fullmove : 1}`;
}

/** Squares to mark as doubtful: square → piece letter read (null for empty), after a flip. */
export function doubtMarks(
    squares: { square: string; piece: string | null }[],
    doubtful: string[],
    flipped: boolean,
): Record<string, string | null> | null {
    const marks: Record<string, string | null> = {};
    for (const square of squares) {
        if (doubtful.includes(square.square)) {
            marks[flipped ? flipSquare(square.square) : square.square] = square.piece;
        }
    }
    return Object.keys(marks).length > 0 ? marks : null;
}

/**
 * A position read from a diagram cannot have the side that just moved in check: if it does, the
 * side to move was guessed wrong (books often leave it implicit), so it is switched. Positions
 * illegal for any other reason are left as they are.
 */
export function legalTurn(fen: string): { fen: string; switched: boolean } {
    const setup = parseFen(fen).unwrap(
        (s) => s,
        () => null,
    );
    if (!setup) return { fen, switched: false };
    const legal = (turn: "white" | "black") => Chess.fromSetup({ ...setup, turn }).isOk;
    if (legal(setup.turn)) return { fen, switched: false };
    const other = setup.turn === "white" ? "black" : "white";
    if (!legal(other)) return { fen, switched: false };
    return { fen: makeFen({ ...setup, turn: other }), switched: true };
}
