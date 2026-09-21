import { afterEach, describe, expect, it, vi } from "vitest";
import { commands } from "@/bindings";
import type { Session } from "./session";
import { migrateAndHydrateLichessTokens, persistLichessToken } from "./secureLichessTokens";

vi.mock("@tauri-apps/plugin-log", () => ({ warn: vi.fn() }));

afterEach(() => vi.restoreAllMocks());

describe("secure Lichess token migration", () => {
    it("moves legacy tokens to native storage and hydrates token-free metadata", async () => {
        vi.spyOn(commands, "secureTokenStorageAvailable").mockResolvedValue(true);
        const store = vi
            .spyOn(commands, "storeLichessToken")
            .mockResolvedValue({ status: "ok", data: null });
        vi.spyOn(commands, "getLichessToken").mockResolvedValue({
            status: "ok",
            data: "restored-token",
        });

        const sessions = [
            {
                player: "Legacy",
                updatedAt: 1,
                lichess: { username: "legacy", accessToken: "legacy-token", account: {} },
            },
            {
                player: "Stored",
                updatedAt: 2,
                lichess: { username: "stored", account: {} },
            },
        ] as Session[];

        const hydrated = await migrateAndHydrateLichessTokens(sessions);

        expect(store).toHaveBeenCalledWith("legacy", "legacy-token");
        expect(hydrated[0].lichess?.accessToken).toBe("legacy-token");
        expect(hydrated[1].lichess?.accessToken).toBe("restored-token");
    });

    it("keeps login functional when the native secure copy cannot be written", async () => {
        vi.spyOn(commands, "secureTokenStorageAvailable").mockResolvedValue(true);
        vi.spyOn(commands, "storeLichessToken").mockResolvedValue({
            status: "error",
            error: "DPAPI unavailable",
        });

        await expect(persistLichessToken("player", "working-token")).resolves.toBeUndefined();
    });
});
