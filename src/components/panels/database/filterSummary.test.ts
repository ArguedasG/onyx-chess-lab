import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import type { LichessGamesOptions } from "@/utils/lichess/explorer";
import type { LocalOptions } from "./DatabasePanel";
import { filterSummary } from "./filterSummary";

// Echoes the English default (or the key), filling {{placeholders}} like i18next would.
const t = ((key: string, fallback?: unknown, values?: Record<string, unknown>) => {
    const vars = typeof fallback === "object" ? (fallback as Record<string, unknown>) : values;
    const text = typeof fallback === "string" ? fallback : key.split(".").pop()!;
    return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String(vars?.[name] ?? ""));
}) as unknown as TFunction;

const local: LocalOptions = {
    path: "db.si5",
    fen: "",
    type: "exact",
    player: null,
    color: "any",
    result: "any",
};
const lichess: LichessGamesOptions = { color: "white" };
const base = { local, lichess, masters: {}, weak: { below: null, unrated: false } };

describe("filterSummary", () => {
    it("is empty when nothing narrows a local query", () => {
        expect(filterSummary("local", base, t)).toEqual([]);
    });

    it("names every local filter briefly", () => {
        const summary = filterSummary(
            "local",
            {
                ...base,
                local: {
                    ...local,
                    player: 7,
                    color: "black",
                    elo_min: 1600,
                    start_date: "2010.01.01",
                    end_date: "2020.12.31",
                    result: "draw",
                },
                weak: { below: 1200, unrated: false },
            },
            t,
        );
        expect(summary).toEqual([
            "Player (Black)",
            "Elo 1600–",
            "2010–2020",
            "½-½",
            "No weak games < 1200",
        ]);
    });

    it("lists few Lichess speeds and ratings, and counts or spans many", () => {
        expect(
            filterSummary(
                "lch_all",
                {
                    ...base,
                    lichess: { ...lichess, speeds: ["blitz", "rapid"], ratings: [1800, 1600] },
                },
                t,
            ),
        ).toEqual(["Blitz, Rapid", "1600, 1800"]);
        expect(
            filterSummary(
                "lch_all",
                {
                    ...base,
                    lichess: {
                        ...lichess,
                        speeds: ["bullet", "blitz", "rapid", "classical"],
                        ratings: [0, 1000, 1200, 2500],
                    },
                },
                t,
            ),
        ).toEqual(["4 time controls", "400–2500"]);
    });

    it("gives the masters period in years", () => {
        expect(
            filterSummary("lch_master", { ...base, masters: { since: new Date(2015, 0, 1) } }, t),
        ).toEqual(["2015–"]);
    });
});
