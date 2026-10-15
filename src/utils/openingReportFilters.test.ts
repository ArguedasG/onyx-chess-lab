import { describe, expect, it } from "vitest";
import type { OpeningReport, ReportMoveCell } from "@/bindings";
import { openingReportFixture } from "./openingReport.fixture";
import {
    ALL_GAMES,
    canFilterReport,
    filteredBands,
    filteredMoves,
    filteredTotal,
    moverPerformance,
    moverScore,
    moveTrends,
    reportYearRange,
    trendSeries,
} from "./openingReportFilters";

const result = (white: number, draw: number, black: number) => ({
    white,
    draw,
    black,
    unknown: 0,
});

const cell = (
    move: string,
    year: number | null,
    results: ReturnType<typeof result>,
    rated = { ratedGames: 0, expectedWhite: 0, scoreWhite: 0 },
): ReportMoveCell => ({ move, year, band: 1, results, ...rated });

describe("opening report filters", () => {
    it("compares the mover's score with the score the Elo difference predicts", () => {
        const report = openingReportFixture();
        const rich: OpeningReport = {
            ...report,
            moveBreakdown: [
                // 20 rated games: White expected 12 points (60 %), scored 14 (70 %).
                cell("e4", 2020, result(10, 8, 2), {
                    ratedGames: 20,
                    expectedWhite: 12,
                    scoreWhite: 14,
                }),
                cell("d4", 2020, result(2, 0, 1), {
                    ratedGames: 3,
                    expectedWhite: 1.5,
                    scoreWhite: 2,
                }),
            ],
        };
        const rows = filteredMoves(rich, { band: null, from: 2019, to: 2021 });
        const e4 = rows.find((row) => row.move === "e4")!;
        expect(moverPerformance(e4.rated, true)).toEqual({
            games: 20,
            score: 70,
            expected: 60,
            delta: 10,
        });
        expect(moverPerformance(e4.rated, false)!.delta).toBeCloseTo(-10);
        // Too few rated games for d4; reports without rated sums show nothing.
        expect(moverPerformance(rows.find((row) => row.move === "d4")!.rated, true)).toBeNull();
        expect(moverPerformance(undefined, true)).toBeNull();
    });

    it("marks moves gaining or losing popularity in the last three years", () => {
        const report = openingReportFixture();
        const cells: ReportMoveCell[] = [];
        for (let year = 2015; year <= 2024; year++) {
            const recent = year >= 2022;
            cells.push(cell("e4", year, result(recent ? 4 : 8, 0, 0)));
            cells.push(cell("c4", year, result(recent ? 6 : 2, 0, 0)));
        }
        const trends = moveTrends({ ...report, moveBreakdown: cells }, ALL_GAMES);
        expect(trends.get("c4")).toMatchObject({
            direction: "up",
            recentShare: 60,
            earlierShare: 20,
        });
        expect(trends.get("e4")?.direction).toBe("down");
        // Not enough recent games: nothing is marked.
        const thin = cells.filter((entry) => entry.year! < 2022 || entry.year === 2024);
        expect(moveTrends({ ...report, moveBreakdown: thin.slice(0, 16) }, ALL_GAMES).size).toBe(0);
    });

    it("uses the complete move list when nothing is filtered", () => {
        const report = openingReportFixture();
        expect(filteredMoves(report, ALL_GAMES).map((row) => row.move)).toEqual([
            "d4",
            "e4",
            "Nf3",
        ]);
        expect(filteredTotal(report, ALL_GAMES)).toBe(report.statistics.results);
    });

    it("filters moves, totals and bands by rating class and period", () => {
        const report = openingReportFixture();
        const strong = { band: 1, from: null, to: null };
        expect(filteredMoves(report, strong)).toEqual([
            { move: "d4", results: result(1, 0, 1) },
            { move: "Nf3", results: result(0, 1, 0) },
        ]);
        const recent = { band: null, from: 2023, to: null };
        expect(filteredMoves(report, recent)).toEqual([{ move: "Nf3", results: result(0, 1, 0) }]);
        expect(filteredTotal(report, recent)).toEqual(result(0, 1, 0));
        // Undated games drop out of any period; the band choice does not narrow the band table.
        expect(filteredBands(report, { band: 0, from: 2020, to: 2030 })).toEqual([
            { white: 0, draw: 0, black: 0, unknown: 0 },
            result(1, 1, 0),
        ]);
        expect(reportYearRange(report)).toEqual([2022, 2024]);
    });

    it("keeps reports saved before the breakdown existed unfiltered", () => {
        const report = {
            ...openingReportFixture(),
            moveBreakdown: undefined,
        } as unknown as OpeningReport;
        expect(canFilterReport(report)).toBe(false);
        expect(filteredMoves(report, { band: 1, from: null, to: null })).toHaveLength(3);
        expect(reportYearRange(report)).toEqual([2022, 2024]);
    });

    it("scores from the side that chooses the move", () => {
        expect(moverScore(result(2, 2, 0), true)).toBe(75);
        expect(moverScore(result(2, 2, 0), false)).toBe(25);
        expect(moverScore({ white: 0, draw: 0, black: 0, unknown: 3 }, true)).toBeNull();
    });

    it("draws trends only with enough dated games and hides thin score samples", () => {
        const report = openingReportFixture();
        expect(trendSeries(report, ALL_GAMES, true)).toBeNull();

        const cells: ReportMoveCell[] = [];
        for (let year = 2000; year <= 2009; year++) {
            cells.push(cell("e4", year, result(6, 2, 2)));
            cells.push(cell("d4", year, result(1, 0, 1)));
        }
        const rich = { ...report, moveBreakdown: cells };
        const trend = trendSeries(rich, ALL_GAMES, true)!;
        expect(trend.years).toEqual([2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009]);
        expect(trend.moves).toEqual(["e4", "d4"]);
        expect(trend.share.e4[5]).toBeCloseTo((50 / 60) * 100);
        // e4: 5 years × 10 games in the window, white scores (6 + 1) / 10.
        expect(trend.score.e4[5]).toBeCloseTo(70);
        // d4 never reaches the minimum sample in a five-year window (10 games).
        expect(trend.score.d4.every((value) => value === null)).toBe(true);
    });
});
