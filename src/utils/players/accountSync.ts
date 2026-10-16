import { basename, resolve } from "@tauri-apps/api/path";
import { info } from "@tauri-apps/plugin-log";
import type { DatabaseInfo } from "@/bindings";
import { commands, events } from "@/bindings";
import type { DatabaseConversionState } from "@/state/atoms";
import { downloadChessCom } from "@/utils/chess.com/api";
import { query_games } from "@/utils/db";
import { downloadLichess } from "@/utils/lichess/api";
import { unwrap } from "@/utils/unwrap";

export type AccountSyncTarget = {
    type: "lichess" | "chesscom";
    /** Username of the account. */
    title: string;
    database: DatabaseInfo | null;
    /** Games the site reports for the account (Lichess only, to size the download). */
    total: number;
    token?: string;
};

async function lastGameDate(database: DatabaseInfo): Promise<number | null> {
    const games = await query_games(database.file, {
        options: { page: 1, pageSize: 1, sort: "date", direction: "desc", skipCount: false },
    });
    if (games.count! > 0 && games.data[0].date && games.data[0].time) {
        const [year, month, day] = games.data[0].date.split(".").map(Number);
        const [hour, minute, second] = games.data[0].time.split(":").map(Number);
        return Date.UTC(year, month - 1, day, hour, minute, second);
    }
    return null;
}

/**
 * Downloads the account games newer than the last one in its database and adds them to it
 * (the incremental sync of 7.3.3). Shared by the account cards and the player cards.
 */
export async function syncAccountGames(
    target: AccountSyncTarget,
    databaseDir: string,
    setConversionState: (
        update: (previous: DatabaseConversionState) => DatabaseConversionState,
    ) => void,
    onProgress?: (progress: number) => void,
): Promise<void> {
    const { type, title, database, total, token } = target;
    const since = database ? await lastGameDate(database) : null;
    const downloaded = database?.type === "success" ? database.game_count : 0;
    if (type === "lichess") {
        await downloadLichess(title, since, total - downloaded, onProgress ?? (() => {}), token);
    } else {
        await downloadChessCom(title, since);
    }
    const pgnPath = await resolve(databaseDir, `${title}_${type}.pgn`);
    const filename = title + (type === "lichess" ? " Lichess" : " Chess.com");
    try {
        info(`converting ${pgnPath} ${since}`);
        const dbPath = await resolve(
            databaseDir,
            `${pgnPath
                .split(/(\\|\/)/g)
                .pop()
                ?.replace(".pgn", ".db3")}`,
        );
        const sourceFileName = await basename(pgnPath);
        setConversionState((previous) => ({
            ...previous,
            inProgress: true,
            phase: "importing",
            targetDatabasePath: dbPath,
            targetDatabaseTitle: filename,
            sourceFileName,
        }));
        unwrap(
            await commands.convertPgn(
                [pgnPath],
                dbPath,
                since ? since / 1000 : null,
                filename,
                null,
            ),
        );
        events.progressEvent.emit({ id: `${type}_${title}`, progress: 100, finished: true });
        await commands.deleteEmptyGames(pgnPath.replace(".pgn", ".db3"));
    } finally {
        setConversionState((previous) => ({
            ...previous,
            inProgress: false,
            phase: null,
            totalGames: 0,
            elapsedSeconds: 0,
            targetDatabasePath: null,
            targetDatabaseTitle: null,
            sourceFileName: null,
        }));
    }
}
