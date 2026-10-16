import { commands, type NormalizedGame } from "@/bindings";
import { getPGN, parsePGN } from "@/utils/chess";
import { unwrap } from "@/utils/unwrap";

/** Full PGN of a database game, headers included. */
export async function databaseGamePgn(game: NormalizedGame) {
    const tree = await parsePGN(game.moves, game.fen);
    return getPGN(tree.root, {
        headers: game,
        glyphs: true,
        comments: true,
        variations: true,
        extraMarkups: true,
    });
}

/**
 * PGN of several games of one or more databases, read a few at a time. `onProgress` receives the
 * share done (0–1).
 */
export async function databaseGamesPgn(
    games: ReadonlyArray<{ databasePath: string; gameId: number }>,
    onProgress?: (done: number) => void,
): Promise<Array<{ title: string; pgn: string }>> {
    const result: Array<{ title: string; pgn: string } | null> = Array(games.length).fill(null);
    let next = 0;
    let done = 0;
    const worker = async () => {
        while (next < games.length) {
            const index = next;
            next += 1;
            const { databasePath, gameId } = games[index];
            const response = unwrap(
                await commands.getGames(databasePath, {
                    game_id: gameId,
                    options: {
                        page: 1,
                        pageSize: 1,
                        skipCount: true,
                        sort: "id",
                        direction: "asc",
                    },
                }),
            );
            const game = response.data[0];
            if (game)
                result[index] = {
                    title: `${game.white} - ${game.black}`,
                    pgn: await databaseGamePgn(game),
                };
            done += 1;
            onProgress?.(done / games.length);
        }
    };
    await Promise.all(Array.from({ length: Math.min(4, games.length) }, worker));
    return result.filter((item): item is { title: string; pgn: string } => item !== null);
}
