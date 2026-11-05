import { notifications } from "@mantine/notifications";
import i18n from "i18next";
import { atom, getDefaultStore, useAtomValue } from "jotai";
import { commands } from "@/bindings";

/**
 * Lichess sign-in through the browser (OAuth). It is optional for adding an account (its games
 * and stats only need the username), but Lichess opens its opening explorer (Lichess and Masters)
 * only to signed-in users, so the explorer needs it.
 */

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

/** The username a browser sign-in is waiting for, while Lichess is open in the browser. */
export const lichessLoginPendingAtom = atom<string | null>(null);

export function useLichessLoginPending() {
    return useAtomValue(lichessLoginPendingAtom);
}

/**
 * Opens Lichess in the browser to sign in as `username`. A new attempt replaces an unfinished
 * one, so trying again always works. The App's listener adds the account when Lichess answers.
 */
export async function startLichessLogin(username: string, alias = ""): Promise<boolean> {
    const store = getDefaultStore();
    sessionStorage.setItem("lichess_player_alias", alias);
    const pending = username.trim();
    store.set(lichessLoginPendingAtom, pending);
    // The attempt expires after five minutes on the Rust side; so does the waiting notice.
    setTimeout(() => {
        if (store.get(lichessLoginPendingAtom) === pending)
            store.set(lichessLoginPendingAtom, null);
    }, LOGIN_TIMEOUT_MS);
    try {
        const result = await commands.authenticate(username.trim());
        if (result.status === "error") throw new Error(String(result.error));
        return true;
    } catch (error) {
        store.set(lichessLoginPendingAtom, null);
        notifications.show({
            color: "red",
            title: i18n.t("Accounts.Lichess.LoginFailed", "Could not open the Lichess sign-in"),
            message: error instanceof Error ? error.message : String(error),
        });
        return false;
    }
}

/** Called by the App's listener once Lichess has answered (or the sign-in was abandoned). */
export function finishLichessLogin(username: string | null) {
    const store = getDefaultStore();
    store.set(lichessLoginPendingAtom, null);
    if (username) {
        notifications.show({
            color: "teal",
            title: i18n.t("Accounts.Lichess.LoggedIn", "Signed in to Lichess as {{name}}", {
                name: username,
            }),
            message: i18n.t(
                "Accounts.Lichess.LoggedIn.Desc",
                "The Lichess and Masters explorers are now available in the board's database panel.",
            ),
        });
    }
}

export function cancelLichessLogin() {
    getDefaultStore().set(lichessLoginPendingAtom, null);
}
