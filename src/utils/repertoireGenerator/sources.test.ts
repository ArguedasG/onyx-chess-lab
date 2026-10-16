import { describe, expect, it, vi } from "vitest";

vi.mock("@/utils/lichess/api", () => ({
    getMasterGames: vi.fn(async () => ({
        white: 6,
        draws: 3,
        black: 1,
        moves: [{ uci: "e2e4", san: "e4", averageRating: 2500, white: 6, draws: 3, black: 1 }],
        topGames: [
            {
                uci: "e2e4",
                id: "abcd1234",
                winner: "white",
                speed: "classical",
                mode: "rated",
                white: { name: "A", rating: 2700 },
                black: { name: "B", rating: 2650 },
                year: 2024,
                month: "2024-01",
            },
        ],
    })),
    getLichessGames: vi.fn(),
}));

import { loadSource } from "./sources";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("Lichess source", () => {
    // The generator asks every chosen move for its model game; this used to recurse forever.
    it("gives statistics and the model game of a position", async () => {
        const source = await loadSource({ kind: "masters" }, START, 8, 10, { id: "test" });
        const position = await source.position(START);
        expect(position?.games).toBe(10);
        expect(position?.moves[0]).toMatchObject({ uci: "e2e4", games: 10 });
        expect(await source.modelGame?.(START)).toMatchObject({ kind: "lichess", id: "abcd1234" });
    });
});
