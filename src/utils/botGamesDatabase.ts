import { resolve } from "@tauri-apps/api/path";
import { remove, writeTextFile } from "@tauri-apps/plugin-fs";
import i18n from "i18next";
import { commands, type DatabaseInfo } from "@/bindings";
import type { BotGamesInCard } from "@/state/atoms";
import { getDatabases, query_players } from "@/utils/db";
import { getDatabasesDir } from "@/utils/directories";
import type { PlayerAnalysisSource } from "@/utils/playerAnalysis";
import { unwrap } from "@/utils/unwrap";

/**
 * Games against the bots (Phase 9.1) in two databases of the databases folder, rated and
 * friendly, so the player card can include only the rated ones. They are ordinary databases:
 * they appear in Databases and Player Analysis reads them like any other.
 */
const BOT_GAMES_DATABASES = {
    rated: {
        filename: "onyx-bot-games-rated.db3",
        title: () => i18n.t("HumanBots.Database.Rated", "Rated games against Onyx bots"),
    },
    friendly: {
        filename: "onyx-bot-games-friendly.db3",
        title: () => i18n.t("HumanBots.Database.Friendly", "Friendly games against Onyx bots"),
    },
} as const;

export function botGamesDatabaseFilename(rated: boolean): string {
    return BOT_GAMES_DATABASES[rated ? "rated" : "friendly"].filename;
}

/** Adds a finished game to its database, creating it the first time. */
export async function saveBotGame(pgn: string, rated: boolean, gameId: string): Promise<void> {
    const database = BOT_GAMES_DATABASES[rated ? "rated" : "friendly"];
    const dir = await getDatabasesDir();
    const pgnPath = await resolve(dir, `onyx-bot-game-${gameId}.pgn`);
    await writeTextFile(pgnPath, pgn);
    try {
        unwrap(
            await commands.convertPgn(
                [pgnPath],
                await resolve(dir, database.filename),
                null,
                database.title(),
                null,
            ),
        );
    } finally {
        await remove(pgnPath).catch(() => {});
    }
}

/** The player's records in the bot game databases that `include` asks for. */
export async function botGameSources(
    playerName: string,
    include: BotGamesInCard,
): Promise<PlayerAnalysisSource[]> {
    if (include === "none") return [];
    const filenames: string[] = [BOT_GAMES_DATABASES.rated.filename];
    if (include === "all") filenames.push(BOT_GAMES_DATABASES.friendly.filename);
    const databases = (await getDatabases()).filter(
        (database): database is DatabaseInfo & { type: "success" } =>
            database.type === "success" && filenames.includes(database.filename),
    );
    const sources = await Promise.all(
        databases.map(async (database) => {
            const players = await query_players(database.file, {
                name: playerName,
                options: {
                    page: 1,
                    pageSize: 10,
                    direction: "desc",
                    sort: "games",
                    skipCount: true,
                },
            });
            const player = players.data.find(
                (candidate) => candidate.name?.toLowerCase() === playerName.toLowerCase(),
            );
            if (!player) return null;
            return {
                databasePath: database.file,
                databaseTitle: database.title || database.filename,
                playerId: player.id,
                playerName: player.name || playerName,
            } satisfies PlayerAnalysisSource;
        }),
    );
    return sources.filter((source): source is PlayerAnalysisSource => source !== null);
}
