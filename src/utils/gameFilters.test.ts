import { describe, expect, it } from "vitest";
import {
    clearGameFilters,
    countActiveGameFilters,
    EMPTY_GAME_FILTERS,
    eloFromRange,
    eloToRange,
    outcomeToResult,
    resultToOutcome,
    toPgnDate,
} from "./gameFilters";

describe("game filters", () => {
    it("writes dates as PGN does, whatever form they were saved in", () => {
        expect(toPgnDate("2024-12-31")).toBe("2024.12.31");
        expect(toPgnDate("2024.12.31")).toBe("2024.12.31");
        expect(toPgnDate("")).toBeNull();
        expect(toPgnDate(null)).toBeNull();
    });

    it("counts and clears only the fields a screen shows", () => {
        const value = {
            ...EMPTY_GAME_FILTERS,
            color: "white" as const,
            eloMin: 2000,
            result: "draw" as const,
        };
        expect(countActiveGameFilters(value, ["color", "elo", "dates", "result"])).toBe(3);
        expect(countActiveGameFilters(value, ["dates"])).toBe(0);
        expect(clearGameFilters(value, ["elo"])).toEqual({ ...value, eloMin: null });
    });

    it("converts results and Elo ranges to a database query and back", () => {
        expect(resultToOutcome("whitewon")).toBe("1-0");
        expect(resultToOutcome("any")).toBeUndefined();
        expect(outcomeToResult("1/2-1/2")).toBe("draw");
        expect(outcomeToResult(undefined)).toBe("any");
        expect(eloFromRange([0, 3000])).toEqual({ eloMin: null, eloMax: null });
        expect(eloFromRange([1800, 3000])).toEqual({ eloMin: 1800, eloMax: null });
        expect(eloToRange(null, 2200)).toEqual([0, 2200]);
        expect(eloToRange(null, null)).toEqual([0, 3000]);
    });
});
