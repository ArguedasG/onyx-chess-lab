import { makeFen, parseFen } from "chessops/fen";
import { Chess } from "chessops/chess";
import { parsePgn, startingPosition } from "chessops/pgn";
import { makeSan, parseSan } from "chessops/san";
import { parseUci } from "chessops";
import { positionFromFen } from "@/utils/chessops";
import { positionKey } from "@/utils/repertoireGenerator/positions";

/**
 * Blind visualization (I-38): an earlier position and the moves played since. The earlier position
 * is the one before the opponent's first move of a puzzle, some moves back in the game an exercise
 * of Player Analysis comes from, or the exercise's own position when the student moves first.
 */
export type BlindView = { fen: string; hiddenSans: string[] };

/** A puzzle that starts with the opponent's move: that move is the one to visualize. */
export function blindFromOpponentMove(
    fen: string,
    firstMove: string | undefined,
): BlindView | null {
    if (!firstMove) return null;
    const [position] = positionFromFen(fen);
    const move = parseUci(firstMove);
    if (!position || !move || !position.isLegal(move)) return null;
    return { fen, hiddenSans: [makeSan(position, move)] };
}

/**
 * Blind view of a puzzle or PGN exercise. When the opponent moves first, that move is the one to
 * visualize. When the student moves first, the picture is the exercise's own position and every
 * move of the line is played out of sight: visualization courses ("play these moves, then find
 * the tactic") work this way.
 */
export function blindForExercise(
    fen: string,
    startingActor: "student" | "opponent",
    firstMove: string | undefined,
): BlindView | null {
    if (startingActor === "opponent") return blindFromOpponentMove(fen, firstMove);
    const [position] = positionFromFen(fen);
    return position ? { fen, hiddenSans: [] } : null;
}

/**
 * `depth` half-moves before `targetFen` in a game (PGN movetext). The position of the exercise is
 * searched near `preferredPly`, since a position can repeat.
 */
export function blindFromGame(
    moves: string,
    startFen: string | null | undefined,
    targetFen: string,
    preferredPly: number,
    depth: number,
): BlindView | null {
    const game = parsePgn(moves)[0];
    if (!game) return null;
    const start = startFen
        ? parseFen(startFen).chain((setup) => Chess.fromSetup(setup))
        : startingPosition(game.headers);
    if (start.isErr) return null;
    const position = start.value;
    const fens = [makeFen(position.toSetup())];
    const sans: string[] = [];
    for (const node of game.moves.mainline()) {
        const move = parseSan(position, node.san);
        if (!move) break;
        sans.push(makeSan(position, move));
        position.play(move);
        fens.push(makeFen(position.toSetup()));
    }
    const target = positionKey(targetFen);
    const matches = fens.flatMap((fen, ply) => (positionKey(fen) === target ? [ply] : []));
    if (matches.length === 0) return null;
    const ply = matches.sort(
        (a, b) => Math.abs(a - preferredPly) - Math.abs(b - preferredPly) || a - b,
    )[0];
    const from = Math.max(0, ply - Math.max(1, depth));
    if (from === ply) return null;
    return { fen: fens[from], hiddenSans: sans.slice(from, ply) };
}
