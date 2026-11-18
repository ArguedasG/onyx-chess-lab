import { describe, expect, it } from "vitest";
import type { ReportPlanCell, ReportPlanMove } from "@/bindings";
import { openingReportFixture } from "./openingReport.fixture";
import { ALL_GAMES } from "./openingReportFilters";
import { reportPlans } from "./openingReportPlans";

const planMove = (white: boolean, piece: string, from: string, to: string): ReportPlanMove => ({
    white,
    piece,
    from,
    to,
    castle: null,
    promotion: null,
    games: 0,
    typicalMove: 2,
});

const cell = (partial: Partial<ReportPlanCell>): ReportPlanCell => ({
    planMove: null,
    white: true,
    year: 2024,
    band: 0,
    games: 0,
    captures: 0,
    ratedGames: 0,
    score: 0,
    expected: 0,
    ...partial,
});

function report() {
    const base = openingReportFixture();
    base.plans = {
        window: 4,
        scanned: 100,
        moves: [planMove(true, "N", "g1", "f3"), planMove(true, "P", "d2", "d3")],
        cells: [
            // White's games: 60 in band 0 (2024), 40 in band 1 (2020).
            cell({ games: 60, ratedGames: 60, score: 30, expected: 30 }),
            cell({ year: 2020, band: 1, games: 40, ratedGames: 40, score: 20, expected: 20 }),
            // Nf3: 30 + 10 games, scoring 6 points over the expectation in band 0.
            cell({ planMove: 0, games: 30, ratedGames: 30, score: 21, expected: 15 }),
            cell({
                planMove: 0,
                year: 2020,
                band: 1,
                games: 10,
                ratedGames: 10,
                score: 5,
                expected: 5,
            }),
            // d3: only in 2020, and rarely.
            cell({ planMove: 1, year: 2020, band: 1, games: 5, captures: 0 }),
        ],
    };
    return base;
}

describe("reportPlans", () => {
    it("is null for reports saved before plans existed", () => {
        const old = openingReportFixture();
        old.plans = null;
        expect(reportPlans(old, ALL_GAMES)).toBeNull();
    });

    it("gives shares of the side's games and leaves rare moves out", () => {
        const [white, black] = reportPlans(report(), ALL_GAMES)!;
        expect(white.games).toBe(100);
        expect(white.rows.map((row) => [row.move.to, row.share])).toEqual([["f3", 0.4]]);
        expect(black.rows).toEqual([]);
    });

    it("follows the rating and period filters", () => {
        const [band0] = reportPlans(report(), { band: 0, from: null, to: null })!;
        expect(band0.games).toBe(60);
        expect(band0.rows[0].share).toBeCloseTo(0.5);
        // (21 - 15) / 30 - (30 - 30) / 60 = 0.2
        expect(band0.rows[0].delta).toBeCloseTo(20);
        const [old] = reportPlans(report(), { band: null, from: 2020, to: 2020 })!;
        expect(old.rows.map((row) => [row.move.to, row.share])).toEqual([
            ["f3", 0.25],
            ["d3", 0.125],
        ]);
        // Ten rated games are too few for a performance.
        expect(old.rows[0].delta).toBeNull();
    });
});
