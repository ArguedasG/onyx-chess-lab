import { commands, type NormalizedGame } from "@/bindings";
import { query_games, query_players } from "./db";
import { type GameLinkIdentity, matchesGameIdentity, pliesReachingPosition } from "./gameLinks";
import { unwrap } from "./unwrap";

/** A game that could be the one a broken link pointed to. */
export type LinkCandidate = {
    id: number;
    white: string;
    black: string;
    date: string | null;
    event: string;
    /** Ply where the game reaches the comment's position, or null when it never does. */
    ply: number | null;
    /** Same players (and year, when known) as the original link. */
    sameGame: boolean;
};

/** Namesakes tried per side: the search sorts by games, so the right player is almost always first. */
const PLAYERS_PER_SIDE = 3;
const GAMES_PER_PAIR = 50;
/** Position search results shown; the list is sorted with the link's own players first. */
export const POSITION_CANDIDATES = 100;

function candidateFromGame(
    game: NormalizedGame,
    identity: GameLinkIdentity,
    fen: string,
    preferredPly: number,
): LinkCandidate {
    const plies = pliesReachingPosition(game.moves, game.fen, fen, preferredPly);
    return {
        id: game.id,
        white: game.white,
        black: game.black,
        date: game.date ?? null,
        event: game.event,
        ply: plies[0] ?? null,
        sameGame: matchesGameIdentity(identity, game),
    };
}

/** Games that reach the position first, then the link's own players, then the most recent. */
export function sortCandidates(candidates: LinkCandidate[]) {
    return [...candidates].sort(
        (a, b) =>
            Number(b.ply !== null) - Number(a.ply !== null) ||
            Number(b.sameGame) - Number(a.sameGame) ||
            (b.date ?? "").localeCompare(a.date ?? ""),
    );
}

/**
 * Fast search by the link's players and year, through the player index. Each game is checked
 * against the position of the comment, so a game with the same players that never reaches it is
 * shown as such.
 */
export async function findCandidatesByIdentity(
    file: string,
    identity: GameLinkIdentity,
    fen: string,
    preferredPly: number,
): Promise<LinkCandidate[]> {
    const players = (name: string) =>
        query_players(file, {
            name,
            options: {
                page: 1,
                pageSize: PLAYERS_PER_SIDE,
                skipCount: true,
                sort: "games",
                direction: "desc",
            },
        }).then((response) => response.data);
    const [whites, blacks] = await Promise.all([players(identity.white), players(identity.black)]);
    const games = new Map<number, NormalizedGame>();
    for (const white of whites) {
        for (const black of blacks) {
            const response = await query_games(file, {
                player1: white.id,
                player2: black.id,
                sides: "WhiteBlack",
                // "~" sorts after digits and "?", so partial dates of that year are included.
                start_date: identity.year,
                end_date: identity.year ? `${identity.year}.~` : undefined,
                options: {
                    page: 1,
                    pageSize: GAMES_PER_PAIR,
                    skipCount: true,
                    sort: "date",
                    direction: "desc",
                },
            });
            for (const game of response.data) games.set(game.id, game);
        }
    }
    return sortCandidates(
        [...games.values()].map((game) => candidateFromGame(game, identity, fen, preferredPly)),
    );
}

/** Slow fallback: every game of the base that reaches the position (with progress events). */
export async function findCandidatesByPosition(
    file: string,
    identity: GameLinkIdentity | null,
    fen: string,
    tabId: string,
): Promise<{ candidates: LinkCandidate[]; total: number }> {
    const summary = unwrap(
        await commands.queryPosition(file, { position: { fen, type_: "exact" } }, tabId, false),
    );
    const games = unwrap(
        await commands.getPositionGames(
            summary.token,
            0,
            POSITION_CANDIDATES,
            "index",
            "asc",
            `games-sort:${tabId}`,
        ),
    );
    const candidates = games.map((game) => ({
        id: game.id,
        white: game.white,
        black: game.black,
        date: game.date,
        event: game.event,
        ply: game.ply,
        sameGame: identity ? matchesGameIdentity(identity, game) : false,
    }));
    return { candidates: sortCandidates(candidates), total: summary.total };
}
