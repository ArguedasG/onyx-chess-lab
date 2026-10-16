/**
 * Repertoire against reality (I-19): the games of a player walked along an Onyx repertoire. Where
 * the games leave it says what to study: a move of the repertoire's side that is not the prepared
 * one is a deviation of the player (a forgotten line); a reply the repertoire does not cover is a
 * gap in the preparation. For a rival the same walk runs against their games: the replies they
 * actually play that the user's repertoire does not answer.
 */
import type { OpeningsState } from "@/utils/trainingAreas";
import { playUci, positionKey, sideToMove } from "@/utils/repertoireGenerator/positions";
import type { GeneratorColor } from "@/utils/repertoireGenerator/types";
import { type BookMove, bookPosition, type PlayerBook, playerPar, START_FEN } from "./book";

export type RepertoireTree = {
    /** Repertoire color: the side whose moves are the prepared ones. */
    color: GeneratorColor;
    /** Prepared moves (UCI) by position key. A key with no moves is the end of a line. */
    moves: Map<string, Set<string>>;
    lines: Array<{ id: string; name: string; moves: string[] }>;
    repertoireNames: string[];
};

const START_KEY = positionKey(START_FEN);

/**
 * Theory lines (not model games) of the repertoires of a color that start from the standard
 * position, as one tree. Repertoires marked "both" count for either color.
 */
export function repertoireTree(
    openings: OpeningsState,
    color: GeneratorColor,
    repertoireIds?: readonly string[],
): RepertoireTree {
    const tree: RepertoireTree = { color, moves: new Map(), lines: [], repertoireNames: [] };
    const repertoires = Object.values(openings.repertoires).filter(
        (repertoire) =>
            (repertoire.color === color || repertoire.color === "both") &&
            (!repertoireIds || repertoireIds.includes(repertoire.id)),
    );
    for (const repertoire of repertoires) {
        let used = false;
        for (const variantId of repertoire.variantIds) {
            const variant = openings.variants[variantId];
            if (!variant || variant.contentType !== "theory") continue;
            for (const lineId of variant.lineIds) {
                const line = openings.lines[lineId];
                if (!line || line.moves.length === 0) continue;
                if (line.fen !== "start" && positionKey(line.fen) !== START_KEY) continue;
                let fen = START_FEN;
                let valid = true;
                for (const uci of line.moves) {
                    const key = positionKey(fen);
                    const next = playUci(fen, uci);
                    if (!next) {
                        valid = false;
                        break;
                    }
                    const set = tree.moves.get(key) ?? new Set<string>();
                    set.add(next.uci);
                    tree.moves.set(key, set);
                    fen = next.fen;
                }
                if (!valid) continue;
                if (!tree.moves.has(positionKey(fen))) tree.moves.set(positionKey(fen), new Set());
                tree.lines.push({ id: line.id, name: line.name, moves: line.moves });
                used = true;
            }
        }
        if (used) tree.repertoireNames.push(repertoire.name);
    }
    return tree;
}

export type RepertoireExit = {
    /** Position where the games left the repertoire, and the line that leads there. */
    fen: string;
    path: string[];
    move: BookMove;
    /** "own": the repertoire side played something else; "gap": a reply the repertoire lacks. */
    kind: "own" | "gap";
    /** Prepared moves in that position (SAN), for the own deviations. */
    prepared: string[];
    games: number;
    /** Score and rating par of the player whose games these are. */
    scorePercent: number | null;
    par: number | null;
    ratedGames: number;
};

export type RepertoireReality = {
    /** Games of the book that start inside the repertoire. */
    games: number;
    /** Games that followed it to the end of a prepared line. */
    completed: number;
    exits: RepertoireExit[];
    /** Prepared lines with the games that reached their last position (0: never). */
    lineUse: Array<{ id: string; name: string; moves: string[]; games: number; reached: number }>;
};

function scoreOf(book: PlayerBook, move: BookMove) {
    const known = move.white + move.draws + move.black;
    const wins = book.color === "white" ? move.white : move.black;
    return known ? ((wins + move.draws / 2) / known) * 100 : null;
}

/**
 * Walks the book along the repertoire. `mode` "self": the book is the user's own games with the
 * repertoire's color, so both kinds of exit matter. "rival": the book is a rival's games with
 * the other color; only their replies outside the repertoire (gaps) are listed, and at the user's
 * turns the walk follows only the prepared moves (what the rival's other opponents did is not
 * preparation).
 */
export function compareWithRepertoire(
    book: PlayerBook,
    repertoire: RepertoireTree,
    mode: "self" | "rival",
    maxDepth = 24,
): RepertoireReality {
    const exits: RepertoireExit[] = [];
    let completed = 0;
    const visited = new Set<string>();
    const queue: Array<{ fen: string; path: string[] }> = [{ fen: START_FEN, path: [] }];
    const root = bookPosition(book, START_FEN);
    while (queue.length > 0) {
        const { fen, path } = queue.shift()!;
        const key = positionKey(fen);
        if (visited.has(key) || path.length > maxDepth) continue;
        visited.add(key);
        const position = bookPosition(book, fen);
        const prepared = repertoire.moves.get(key);
        if (!position || !prepared) continue;
        if (prepared.size === 0) {
            completed += position.games;
            continue;
        }
        const repertoireTurn = sideToMove(fen) === repertoire.color;
        for (const move of position.moves) {
            const next = playUci(fen, move.uci);
            if (!next) continue;
            if (prepared.has(move.uci)) {
                queue.push({ fen: next.fen, path: [...path, move.uci] });
                continue;
            }
            if (mode === "rival" && repertoireTurn) continue;
            exits.push({
                fen,
                path,
                move,
                kind: repertoireTurn ? "own" : "gap",
                prepared: [...prepared].flatMap((uci) => playUci(fen, uci)?.san ?? []),
                games: move.games,
                scorePercent: scoreOf(book, move),
                par: playerPar(book, fen, move),
                ratedGames: move.ratedGames ?? 0,
            });
        }
    }
    exits.sort((a, b) => b.games - a.games || a.path.length - b.path.length);

    const lineUse = repertoire.lines.map((line) => {
        let fen = START_FEN;
        let reached = 0;
        let games = root?.games ?? 0;
        for (const uci of line.moves) {
            const position = bookPosition(book, fen);
            const move = position?.moves.find((candidate) => candidate.uci === uci);
            if (!move) {
                games = 0;
                break;
            }
            games = move.games;
            reached += 1;
            const next = playUci(fen, uci);
            if (!next) break;
            fen = next.fen;
        }
        return { id: line.id, name: line.name, moves: line.moves, games, reached };
    });

    const rootPrepared = repertoire.moves.get(START_KEY);
    // With Black the opponent opens, so every game starts inside the repertoire.
    const inside = !root
        ? 0
        : repertoire.color === "black"
          ? root.games
          : root.moves
                .filter((move) => rootPrepared?.has(move.uci))
                .reduce((sum, move) => sum + move.games, 0);
    return { games: inside, completed, exits, lineUse };
}
