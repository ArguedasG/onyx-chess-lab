import { commands } from "@/bindings";
import { warn } from "@tauri-apps/plugin-log";
import type { Session } from "./session";
import { unwrap } from "./unwrap";

async function secureStorageAvailable(): Promise<boolean> {
    try {
        return await commands.secureTokenStorageAvailable();
    } catch (error) {
        warn(`Could not check secure Lichess token storage: ${error}`);
        return false;
    }
}

export async function persistLichessToken(username: string, token: string): Promise<void> {
    if (!(await secureStorageAvailable())) return;
    try {
        unwrap(await commands.storeLichessToken(username, token));
    } catch (error) {
        warn(`Could not copy the Lichess token to secure storage: ${error}`);
    }
}

export async function deletePersistedLichessToken(username: string): Promise<void> {
    if (!(await secureStorageAvailable())) return;
    try {
        unwrap(await commands.deleteLichessToken(username));
    } catch (error) {
        warn(`Could not remove the secure Lichess token copy: ${error}`);
    }
}

export async function migrateAndHydrateLichessTokens(sessions: Session[]): Promise<Session[]> {
    if (!(await secureStorageAvailable())) return sessions;

    const hydrated: Session[] = [];
    for (const session of sessions) {
        if (!session.lichess) {
            hydrated.push(session);
            continue;
        }

        try {
            const { username, accessToken } = session.lichess;
            if (accessToken) {
                unwrap(await commands.storeLichessToken(username, accessToken));
                hydrated.push(session);
                continue;
            }

            const storedToken = unwrap(await commands.getLichessToken(username));
            hydrated.push(
                storedToken
                    ? { ...session, lichess: { ...session.lichess, accessToken: storedToken } }
                    : session,
            );
        } catch (error) {
            warn(`Could not synchronize secure Lichess credentials: ${error}`);
            hydrated.push(session);
        }
    }

    return hydrated;
}
