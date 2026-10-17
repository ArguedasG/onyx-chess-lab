import { kingAttacks } from "chessops/attacks";
import { Board } from "chessops/board";
import { Chess } from "chessops/chess";
import { makeFen } from "chessops/fen";
import { defaultSetup } from "chessops/setup";
import { SquareSet } from "chessops/squareSet";
import { squareFile, squareRank } from "chessops/util";
import type { Role, Square } from "chessops/types";
import type { BasicMateId } from "@/utils/trainingAreas";

/**
 * Timed basic mates against a king that resists with the best defense (part of I-52).
 * Positions are generated, not taken from books: random but legal and fair, with the lone king
 * away from the edge so there is always a real technique to show.
 */

export type BasicMateDefinition = {
    id: BasicMateId;
    pieces: Role[];
    /** Default clock for the student, in seconds. */
    defaultSeconds: number;
};

export const BASIC_MATES: BasicMateDefinition[] = [
    { id: "kq", pieces: ["queen"], defaultSeconds: 60 },
    { id: "kr", pieces: ["rook"], defaultSeconds: 120 },
    { id: "kbb", pieces: ["bishop", "bishop"], defaultSeconds: 180 },
    { id: "kbn", pieces: ["bishop", "knight"], defaultSeconds: 300 },
];

export const BASIC_MATE_TIME_OPTIONS = [30, 60, 120, 180, 300, 600];

const isLightSquare = (square: Square) => (squareFile(square) + squareRank(square)) % 2 === 1;
const awayFromEdge = (square: Square) => {
    const file = squareFile(square);
    const rank = squareRank(square);
    return file > 0 && file < 7 && rank > 0 && rank < 7;
};

function randomSquare(random: () => number): Square {
    return Math.floor(random() * 64) as Square;
}

/** One random, legal position with White to move and mate; `null` if this draw failed. */
function tryGenerate(definition: BasicMateDefinition, random: () => number): string | null {
    const used = new Set<Square>();
    const take = (accept: (square: Square) => boolean) => {
        for (let attempt = 0; attempt < 64; attempt++) {
            const square = randomSquare(random);
            if (!used.has(square) && accept(square)) {
                used.add(square);
                return square;
            }
        }
        return null;
    };

    const loneKing = take(awayFromEdge);
    if (loneKing === null) return null;
    const near = kingAttacks(loneKing);
    const whiteKing = take((square) => !near.has(square) && square !== loneKing);
    if (whiteKing === null) return null;

    const board = Board.empty();
    board.set(loneKing, { role: "king", color: "black" });
    board.set(whiteKing, { role: "king", color: "white" });
    let firstBishopLight: boolean | null = null;
    for (const role of definition.pieces) {
        // A piece next to the lone king could simply be taken; two bishops cover both colors.
        const square = take((candidate) => {
            if (near.has(candidate)) return false;
            if (role === "bishop" && firstBishopLight !== null) {
                return isLightSquare(candidate) !== firstBishopLight;
            }
            return true;
        });
        if (square === null) return null;
        if (role === "bishop" && firstBishopLight === null) {
            firstBishopLight = isLightSquare(square);
        }
        board.set(square, { role, color: "white" });
    }

    const position = Chess.fromSetup({
        ...defaultSetup(),
        board,
        turn: "white",
        castlingRights: SquareSet.empty(),
    });
    if (position.isErr) return null;
    const chess = position.value;
    // White to move: Black must not be in check, and the game must not already be over.
    if (chess.isEnd()) return null;
    return makeFen(chess.toSetup());
}

export function generateBasicMate(id: BasicMateId, random: () => number = Math.random): string {
    const definition = BASIC_MATES.find((mate) => mate.id === id) ?? BASIC_MATES[0];
    for (let attempt = 0; attempt < 500; attempt++) {
        const fen = tryGenerate(definition, random);
        if (fen) return fen;
    }
    // Practically unreachable; a fixed, valid position keeps the exercise usable.
    return "8/8/3k4/8/8/8/8/4K2" + (definition.id === "kq" ? "Q" : "R") + " w - - 0 1";
}
