import type { DatabaseInfo } from "@/bindings";
import type { BotGamesInCard } from "@/state/atoms";
import { botGameSources } from "@/utils/botGamesDatabase";
import { getDatabases, query_players } from "@/utils/db";
import type { PlayerAnalysisSource } from "@/utils/playerAnalysis";
import type { Session } from "@/utils/session";

export type AccountPlayer = {
    /** Player name of the accounts (the alias chosen when adding them). */
    name: string;
    sessions: Session[];
    /** The account records found in the downloaded account databases. */
    sources: PlayerAnalysisSource[];
    /** The player's records in the databases of games against the bots, kept apart: the card
     *  shows them on request, and they never change its analysis profile. */
    botSources: PlayerAnalysisSource[];
};

export function sessionUsername(session: Session): string | undefined {
    return session.lichess?.account.username || session.chessCom?.username;
}

export function sessionPlayerName(session: Session): string {
    return session.player || session.lichess?.username || session.chessCom?.username || "";
}

/** Account database title as `AccountCard` names it when converting the download. */
export function accountDatabaseTitle(session: Session): string {
    return session.chessCom
        ? `${session.chessCom.username} Chess.com`
        : `${session.lichess?.username} Lichess`;
}

/** Database file the account download is converted into. */
export function accountDatabaseFilename(session: Session): string | null {
    if (session.lichess) return `${session.lichess.account.username}_lichess.db3`;
    if (session.chessCom) return `${session.chessCom.username}_chesscom.db3`;
    return null;
}

export function findAccountDatabase<T extends DatabaseInfo>(
    databases: readonly T[],
    session: Session,
): T | undefined {
    const filename = accountDatabaseFilename(session);
    return databases.find(
        (candidate) =>
            candidate.filename === filename ||
            (candidate.type === "success" && candidate.title === accountDatabaseTitle(session)),
    );
}

/** What `syncAccountGames` needs for a session, as the account cards compute it. */
export function accountSyncTarget(session: Session, databases: readonly DatabaseInfo[]) {
    if (session.lichess) {
        const perfs = session.lichess.account.perfs;
        const total = (
            ["ultraBullet", "bullet", "blitz", "rapid", "classical", "correspondence"] as const
        ).reduce((sum, speed) => sum + (perfs?.[speed]?.games ?? 0), 0);
        return {
            type: "lichess" as const,
            title: session.lichess.account.username,
            database: findAccountDatabase(databases, session) ?? null,
            total,
            token: session.lichess.accessToken,
        };
    }
    if (session.chessCom) {
        let total = 0;
        for (const stat of Object.values(session.chessCom.stats ?? {}))
            if (stat.record) total += stat.record.win + stat.record.loss + stat.record.draw;
        return {
            type: "chesscom" as const,
            title: session.chessCom.username,
            database: findAccountDatabase(databases, session) ?? null,
            total,
        };
    }
    return null;
}

/** Player names of the sessions, in the order they were added. */
export function accountPlayerNames(sessions: readonly Session[]): string[] {
    return [...new Set(sessions.map(sessionPlayerName).filter(Boolean))];
}

async function findAccountRecord(
    database: DatabaseInfo & { type: "success" },
    username: string,
): Promise<PlayerAnalysisSource | null> {
    const players = await query_players(database.file, {
        name: username,
        options: { page: 1, pageSize: 10, direction: "desc", sort: "games", skipCount: true },
    });
    // The search is by tokens, so "abc" also finds "abcdef": prefer the exact username.
    const player =
        players.data.find(
            (candidate) => candidate.name?.toLowerCase() === username.toLowerCase(),
        ) ?? players.data[0];
    if (!player) return null;
    return {
        databasePath: database.file,
        databaseTitle: database.title || database.filename,
        playerId: player.id,
        playerName: player.name || username,
    };
}

/** The connected accounts grouped by player name, with their records in the account databases
 *  and, as `botGames` asks, in the databases of games against the bots. */
export async function loadAccountPlayers(
    sessions: readonly Session[],
    botGames: BotGamesInCard = "rated",
): Promise<AccountPlayer[]> {
    if (sessions.length === 0) return [];
    const databases = (await getDatabases()).filter(
        (database): database is DatabaseInfo & { type: "success" } => database.type === "success",
    );
    return Promise.all(
        accountPlayerNames(sessions).map(async (name) => {
            const own = sessions.filter((session) => sessionPlayerName(session) === name);
            const sources = (
                await Promise.all(
                    own.map(async (session) => {
                        const username = sessionUsername(session);
                        const database = findAccountDatabase(databases, session);
                        if (!username || !database) return null;
                        return findAccountRecord(database, username).catch(() => null);
                    }),
                )
            ).filter((source): source is PlayerAnalysisSource => source !== null);
            const botSources = await botGameSources(name, botGames).catch(() => []);
            return { name, sessions: own, sources, botSources };
        }),
    );
}
