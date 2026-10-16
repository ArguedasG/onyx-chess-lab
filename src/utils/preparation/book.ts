/**
 * The opening book of a player (8.6): the tree of their games with one color, merged across the
 * databases of the card. Used by the preparation tab, the generator against a rival (I-41), the
 * repertoire comparison (I-19), the key positions (I-33) and the twin (I-43).
 */
import type { BookLine, PlayerTree, PositionTreeNode } from "@/bindings";
import { commands } from "@/bindings";
import type { ProfileGame } from "@/utils/players/profileGames";
import {
    canonicalUci,
    playUci,
    positionKey,
    sideToMove,
} from "@/utils/repertoireGenerator/positions";
import type { LoadedSource } from "@/utils/repertoireGenerator/sources";
import type {
    GeneratorColor,
    ModelGame,
    SourceMove,
    SourcePosition,
} from "@/utils/repertoireGenerator/types";
import { unwrap } from "@/utils/unwrap";

/** Plies of the book read from the games: ten moves. */
export const BOOK_PLIES = 20;

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export type BookMove = SourceMove & {
    /** Dates ("2024-05-01") of the first and last game with the move. */
    firstDay?: string;
    lastDay?: string;
};

export type BookPosition = { fen: string; games: number; moves: BookMove[] };

export type PlayerBook = {
    /** The color the player had in these games. */
    color: GeneratorColor;
    games: number;
    positions: Map<string, BookPosition>;
    /** Opening sequences of the games, identical ones merged (the twin's book). */
    lines: BookLine[];
};

export type PlayerBooks = { white: PlayerBook; black: PlayerBook };

function day(date: string | null | undefined): string | undefined {
    if (!date) return undefined;
    return date.replaceAll(".", "-").replace(/-\?\?.*$/, "");
}

function emptyBook(color: GeneratorColor): PlayerBook {
    return { color, games: 0, positions: new Map(), lines: [] };
}

/** Adds the nodes of one database tree to a book. */
function mergeNodes(book: PlayerBook, nodes: PositionTreeNode[], databasePath: string) {
    for (const node of nodes) {
        const key = positionKey(node.fen);
        const position = book.positions.get(key) ?? { fen: node.fen, games: 0, moves: [] };
        position.games += node.games;
        for (const move of node.moves) {
            const uci = canonicalUci(node.fen, move.uci);
            if (!uci) continue;
            const firstDay = day(move.firstDate);
            const lastDay = day(move.lastDate);
            const modelGame: ModelGame | undefined =
                move.modelGameId != null
                    ? { kind: "local", databasePath, gameId: move.modelGameId }
                    : undefined;
            const existing = position.moves.find((candidate) => candidate.uci === uci);
            if (!existing) {
                position.moves.push({
                    uci,
                    san: move.san,
                    games: move.games,
                    white: move.white,
                    draws: move.draws,
                    black: move.black,
                    ratedGames: move.ratedGames,
                    ratedPoints: move.ratedPoints,
                    expectedPoints: move.expectedPoints,
                    modelGame,
                    firstDay,
                    lastDay,
                });
                continue;
            }
            const newer = (lastDay ?? "") > (existing.lastDay ?? "");
            existing.games += move.games;
            existing.white += move.white;
            existing.draws += move.draws;
            existing.black += move.black;
            existing.ratedGames = (existing.ratedGames ?? 0) + move.ratedGames;
            existing.ratedPoints = (existing.ratedPoints ?? 0) + move.ratedPoints;
            existing.expectedPoints = (existing.expectedPoints ?? 0) + move.expectedPoints;
            if (firstDay && (!existing.firstDay || firstDay < existing.firstDay))
                existing.firstDay = firstDay;
            if (newer) {
                existing.lastDay = lastDay;
                existing.modelGame = modelGame ?? existing.modelGame;
            }
        }
        position.moves.sort((a, b) => b.games - a.games || a.san.localeCompare(b.san));
        book.positions.set(key, position);
    }
}

function mergeLines(into: BookLine[], lines: BookLine[]): BookLine[] {
    const counts = new Map(into.map((line) => [line.moves.join(" "), line]));
    for (const line of lines) {
        const key = line.moves.join(" ");
        const existing = counts.get(key);
        if (existing) existing.games += line.games;
        else counts.set(key, { moves: [...line.moves], games: line.games });
    }
    return [...counts.values()].sort((a, b) => b.games - a.games);
}

/** Builds both books from per-database trees (pure, for tests). */
export function booksFromTrees(
    trees: Array<{ databasePath: string; tree: PlayerTree }>,
): PlayerBooks {
    const books: PlayerBooks = { white: emptyBook("white"), black: emptyBook("black") };
    for (const { databasePath, tree } of trees) {
        books.white.games += tree.whiteGames;
        books.black.games += tree.blackGames;
        mergeNodes(books.white, tree.white, databasePath);
        mergeNodes(books.black, tree.black, databasePath);
        books.white.lines = mergeLines(books.white.lines, tree.whiteLines);
        books.black.lines = mergeLines(books.black.lines, tree.blackLines);
    }
    return books;
}

/** One `get_player_tree` call per database of the games. */
export async function loadPlayerBooks(
    games: readonly ProfileGame[],
    plies = BOOK_PLIES,
): Promise<PlayerBooks> {
    const byDatabase = new Map<string, { players: Set<number>; games: number[] }>();
    for (const game of games) {
        if (game.customStart) continue;
        const entry = byDatabase.get(game.source.databasePath) ?? {
            players: new Set<number>(),
            games: [],
        };
        entry.players.add(game.playerId);
        entry.games.push(game.id);
        byDatabase.set(game.source.databasePath, entry);
    }
    const trees = await Promise.all(
        [...byDatabase.entries()].map(async ([databasePath, entry]) => ({
            databasePath,
            tree: unwrap(
                await commands.getPlayerTree(databasePath, [...entry.players], entry.games, plies),
            ),
        })),
    );
    return booksFromTrees(trees);
}

export function bookPosition(book: PlayerBook, fen: string): BookPosition | null {
    return book.positions.get(positionKey(fen)) ?? null;
}

/** Points of the player in the games of a move (draws as half), with the rating par. */
export function playerResult(book: PlayerBook, move: SourceMove) {
    const known = move.white + move.draws + move.black;
    const wins = book.color === "white" ? move.white : move.black;
    const losses = book.color === "white" ? move.black : move.white;
    return {
        wins,
        draws: move.draws,
        losses,
        known,
        scorePercent: known ? ((wins + move.draws / 2) / known) * 100 : null,
    };
}

/** Rating par (I-30) of the player in the games of a move, in percentage points. */
export function playerPar(book: PlayerBook, fen: string, move: SourceMove): number | null {
    if (!move.ratedGames || move.ratedPoints == null || move.expectedPoints == null) return null;
    const moverIsPlayer = sideToMove(fen) === book.color;
    const points = moverIsPlayer ? move.ratedPoints : move.ratedGames - move.ratedPoints;
    const expected = moverIsPlayer ? move.expectedPoints : move.ratedGames - move.expectedPoints;
    return ((points - expected) / move.ratedGames) * 100;
}

/** The book as a statistics source of the generator: the player's games in that color. */
export function bookSource(book: PlayerBook, label: string): LoadedSource {
    return {
        label,
        summary: `${book.games}`,
        async position(fen: string): Promise<SourcePosition | null> {
            const position = bookPosition(book, fen);
            return position ? { games: position.games, moves: position.moves } : null;
        },
    };
}

/**
 * A line as the generator's surprise finder wants it: the moves of `path` and then the most
 * played continuation of the book while it has at least `minGames` games.
 */
export function mainLine(
    book: PlayerBook,
    path: readonly string[] = [],
    maxPlies = BOOK_PLIES,
    minGames = 2,
): Array<{ fen: string; played?: { uci: string; san: string } }> {
    const steps: Array<{ fen: string; played?: { uci: string; san: string } }> = [];
    let fen = START_FEN;
    const seen = new Set<string>();
    for (let ply = 0; ply < maxPlies; ply += 1) {
        let uci = path[ply];
        if (!uci) {
            const best = bookPosition(book, fen)?.moves[0];
            if (!best || best.games < minGames || seen.has(positionKey(fen))) break;
            uci = best.uci;
        }
        seen.add(positionKey(fen));
        const next = playUci(fen, uci);
        if (!next) break;
        steps.push({ fen, played: { uci: next.uci, san: next.san } });
        fen = next.fen;
    }
    steps.push({ fen });
    return steps;
}

/** SAN moves of a UCI line from the start, for labels ("1.e4 c5 2.Nf3"). */
export function lineSan(moves: readonly string[]): string {
    let fen = START_FEN;
    const parts: string[] = [];
    for (const [index, uci] of moves.entries()) {
        const next = playUci(fen, uci);
        if (!next) break;
        const moveNumber = Math.floor(index / 2) + 1;
        parts.push(index % 2 === 0 ? `${moveNumber}.${next.san}` : next.san);
        fen = next.fen;
    }
    return parts.join(" ");
}

/** Plays a UCI line from the start: the FEN of every position, the last one included. */
export function lineFens(moves: readonly string[]): string[] {
    const fens = [START_FEN];
    let fen = START_FEN;
    for (const uci of moves) {
        const next = playUci(fen, uci);
        if (!next) break;
        fen = next.fen;
        fens.push(fen);
    }
    return fens;
}

/** A short stable key of a set of games, to cache the books of a filter. */
export function gamesKey(games: readonly ProfileGame[]): string {
    let hash = 0;
    for (const game of games) {
        for (let index = 0; index < game.key.length; index += 1)
            hash = (hash * 31 + game.key.charCodeAt(index)) | 0;
    }
    return `${games.length}:${hash}`;
}
