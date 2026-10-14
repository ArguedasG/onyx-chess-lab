import { resolve } from "@tauri-apps/api/path";
import { commands, type NormalizedGame } from "@/bindings";
import { getDatabasesDir } from "./directories";
import { unwrap } from "./unwrap";

/**
 * Links from a comment to a game of a local database, written as an ordinary Markdown link
 * so they survive PGN export: `[Carlsen - Nakamura (2023)](onyx://game?db=masters.db3&id=42&ply=24)`.
 * `db` is the database's file name inside the databases folder, so a link keeps working when
 * that folder moves; `ply` is the half-move the game opens at.
 */
export const GAME_LINK_SCHEME = "onyx";

export type GameLink = { database: string; gameId: number; ply: number };

function fileName(path: string) {
    return path.split(/[\\/]/).pop() ?? path;
}

export function buildGameLinkUrl({ database, gameId, ply }: GameLink) {
    const params = new URLSearchParams({
        db: fileName(database),
        id: String(gameId),
        ply: String(Math.max(0, Math.trunc(ply))),
    });
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
        return { database, gameId, ply: Number.isInteger(ply) && ply > 0 ? ply : 0 };
    } catch {
        return null;
    }
}

export function gameLinkLabel(game: Pick<NormalizedGame, "white" | "black" | "date">) {
    const year = game.date?.slice(0, 4);
    return `${game.white} - ${game.black}${year && /^\d{4}$/.test(year) ? ` (${year})` : ""}`;
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
