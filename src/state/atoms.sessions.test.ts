import { createStore } from "jotai";
import { beforeEach, describe, expect, it } from "vitest";
import { sessionsAtom } from "./atoms";

describe("Lichess session persistence", () => {
    beforeEach(() => localStorage.removeItem("sessions"));

    it("keeps the OAuth token available to the explorer after navigation and restart", () => {
        const store = createStore();
        store.set(sessionsAtom, [
            {
                player: "Player",
                updatedAt: 1,
                lichess: {
                    username: "player",
                    accessToken: "oauth-token",
                    account: {} as never,
                },
            },
        ]);

        expect(JSON.parse(localStorage.getItem("sessions") ?? "[]")[0].lichess.accessToken).toBe(
            "oauth-token",
        );
    });
});
