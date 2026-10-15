import { resolve } from "@tauri-apps/api/path";
import { Chess } from "chessops/chess";
import { makeFen, parseFen } from "chessops/fen";
import { parsePgn, startingPosition } from "chessops/pgn";
import { parseSan } from "chessops/san";
import { commands, type NormalizedGame } from "@/bindings";
import { getDatabasesDir } from "./directories";
import { unwrap } from "./unwrap";

/**
 * Links from a comment to a game of a local database, written as an ordinary Markdown link
 * so they survive PGN export: `[Carlsen - Nakamura (2023)](onyx://game?db=masters.db3&id=42&ply=24)`.
 * `db` is the database's file name inside the databases folder, so a link keeps working when
 * that folder moves; `ply` is the half-move the game opens at. `w`, `b` and `y` (players and year)
 * identify the game when the base changes and the id no longer points to it; links written before
 * they existed fall back to the label.
 */
export const GAME_LINK_SCHEME = "onyx";

export type GameLink = {
    database: string;
    gameId: number;
    ply: number;
    white?: string;
    black?: string;
    year?: string;
};

/** Players and year of the linked game, used to check and restore a link. */
export type GameLinkIdentity = { white: string; black: string; year?: string };

function fileName(path: string) {
    return path.split(/[\\/]/).pop() ?? path;
}

export function buildGameLinkUrl({ database, gameId, ply, white, black, year }: GameLink) {
    const params = new URLSearchParams({
        db: fileName(database),
        id: String(gameId),
        ply: String(Math.max(0, Math.trunc(ply))),
    });
    if (white) params.set("w", white);
    if (black) params.set("b", black);
    if (year) params.set("y", year);
    // Parentheses would close the Markdown link early.
    const query = params.toString().replace(/\(/g, "%28").replace(/\)/g, "%29");
    return `${GAME_LINK_SCHEME}://game?${query}`;
}

export function parseGameLink(href: string | undefined): GameLink | null {
    if (!href?.startsWith(`${GAME_LINK_SCHEME}://game`)) return null;
    try {
        const params = new URL(href).searchParams;
        const database = params.get("db");
        const gameId = Number(params.get("id"));
        const ply = Number(params.get("ply") ?? 0);
        if (!database || !Number.isInteger(gameId) || gameId <= 0) return null;
        const link: GameLink = {
            database,
            gameId,
            ply: Number.isInteger(ply) && ply > 0 ? ply : 0,
        };
        const white = params.get("w");
        const black = params.get("b");
        const year = params.get("y");
        if (white) link.white = white;
        if (black) link.black = black;
        if (year && /^\d{4}$/.test(year)) link.year = year;
        return link;
    } catch {
        return null;
    }
}

function gameYear(date: string | null | undefined) {
    const year = date?.slice(0, 4);
    return year && /^\d{4}$/.test(year) ? year : undefined;
}

export function gameLinkLabel(game: Pick<NormalizedGame, "white" | "black" | "date">) {
    const year = gameYear(game.date);
    return `${game.white} - ${game.black}${year ? ` (${year})` : ""}`;
}

/** A link to `game` that also records its players and year. */
export function gameLinkFor(
    game: Pick<NormalizedGame, "id" | "white" | "black" | "date">,
    database: string,
    ply: number,
): GameLink {
    const link: GameLink = { database, gameId: game.id, ply, white: game.white, black: game.black };
    const year = gameYear(game.date);
    if (year) link.year = year;
    return link;
}

const LABEL_PATTERN = /^(.+?) - (.+?)(?: \((\d{4})\))?$/;

/** Players and year from the link itself, or from a label written by `gameLinkLabel`. */
export function gameLinkIdentity(link: GameLink, label: string): GameLinkIdentity | null {
    if (link.white && link.black) return { white: link.white, black: link.black, year: link.year };
    const match = LABEL_PATTERN.exec(label.trim());
    if (!match) return null;
    return { white: match[1].trim(), black: match[2].trim(), year: match[3] };
}

/** Lowercase, without accents and punctuation, like the player search of the databases. */
export function normalizedPlayerName(name: string) {
    return name
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
}

/** Whether `game` is the game the identity describes (same players and, if known, year). */
export function matchesGameIdentity(
    identity: GameLinkIdentity,
    game: Pick<NormalizedGame, "white" | "black" | "date">,
) {
    if (normalizedPlayerName(identity.white) !== normalizedPlayerName(game.white)) return false;
    if (normalizedPlayerName(identity.black) !== normalizedPlayerName(game.black)) return false;
    return !identity.year || !gameYear(game.date) || identity.year === gameYear(game.date);
}

/** Board, side to move and castling: enough to tell positions apart, ignoring move counters. */
function positionKey(fen: string) {
    return fen.trim().split(/\s+/).slice(0, 3).join(" ");
}

/**
 * Plies of the main line of `moves` where `fen` appears, nearest to `preferredPly` first. Empty when
 * the game never reaches the position.
 */
export function pliesReachingPosition(
    moves: string,
    startFen: string | null | undefined,
    fen: string,
    preferredPly = 0,
): number[] {
    const target = positionKey(fen);
    const game = parsePgn(moves)[0];
    if (!game) return [];
    const start = startFen
        ? parseFen(startFen).chain((setup) => Chess.fromSetup(setup))
        : startingPosition(game.headers);
    if (start.isErr) return [];
    const position = start.value;
    const plies: number[] = [];
    if (positionKey(makeFen(position.toSetup())) === target) plies.push(0);
    let ply = 0;
    for (const node of game.moves.mainline()) {
        const move = parseSan(position, node.san);
        if (!move) break;
        position.play(move);
        ply += 1;
        if (positionKey(makeFen(position.toSetup())) === target) plies.push(ply);
    }
    return plies.sort((a, b) => Math.abs(a - preferredPly) - Math.abs(b - preferredPly) || a - b);
}

function sameLink(a: GameLink, b: GameLink) {
    return a.database === b.database && a.gameId === b.gameId && a.ply === b.ply;
}

/** The Markdown source of the first link in `comment` that points where `link` does. */
export function findGameLinkInComment(comment: string, link: GameLink) {
    for (const match of comment.matchAll(/\[([^\]]*)\]\((onyx:\/\/game\?[^)\s]*)\)/g)) {
        const parsed = parseGameLink(match[2]);
        if (parsed && sameLink(parsed, link)) {
            return {
                start: match.index ?? 0,
                end: (match.index ?? 0) + match[0].length,
                label: match[1],
            };
        }
    }
    return null;
}

/**
 * Points the Markdown link of `comment` that matches `oldLink` to `link`. A label written by
 * `gameLinkLabel` is rewritten for the new game; a label the user wrote is kept. Returns `comment`
 * unchanged when the link is not in it.
 */
export function replaceGameLink(
    comment: string,
    oldLink: GameLink,
    link: GameLink,
    game: Pick<NormalizedGame, "white" | "black" | "date">,
) {
    const found = findGameLinkInComment(comment, oldLink);
    if (!found) return comment;
    const nextLabel = LABEL_PATTERN.test(found.label.trim()) ? gameLinkLabel(game) : found.label;
    return (
        comment.slice(0, found.start) + gameLinkMarkdown(nextLabel, link) + comment.slice(found.end)
    );
}

/** Markdown for a comment. Brackets and braces are dropped from the label: braces end PGN comments. */
export function gameLinkMarkdown(label: string, link: GameLink) {
    const safeLabel = label.replace(/[[\]{}]/g, "").trim() || "Game";
    return `[${safeLabel}](${buildGameLinkUrl(link)})`;
}

/** Appends a link to a comment, on its own paragraph when the comment already has text. */
export function appendGameLink(comment: string, markdown: string) {
    const current = comment.trimEnd();
    return current ? `${current}\n\n${markdown}` : markdown;
}

export async function loadLinkedGame(link: GameLink) {
    const database = await resolve(await getDatabasesDir(), fileName(link.database));
    const response = unwrap(
        await commands.getGames(database, {
            game_id: link.gameId,
            options: { page: 1, pageSize: 1, skipCount: true, sort: "id", direction: "asc" },
        }),
    );
    const game = response.data[0];
    if (!game) throw new Error("Game not found");
    return { database, game };
}
