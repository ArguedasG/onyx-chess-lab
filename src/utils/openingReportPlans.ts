import type { OpeningReport, ReportPlanCell, ReportPlanMove } from "@/bindings";
import type { ReportCellFilter } from "./openingReportFilters";

/** Moves below this share of the side's games are left out of the report. */
export const REPORT_PLAN_MIN_SHARE = 0.1;
export const REPORT_PLAN_ROWS = 8;
/** Fewest rated games before a performance against the Elo expectation is shown. */
export const REPORT_PLAN_MIN_RATED = 30;

export type ReportPlanRow = {
    move: ReportPlanMove;
    games: number;
    /** Share of the side's games under the filter (0–1). */
    share: number;
    capture: boolean;
    /** Points above (or below) the Elo expectation, beyond the side's own margin. */
    delta: number | null;
};

export type ReportSidePlans = { white: boolean; games: number; rows: ReportPlanRow[] };

type Sums = { games: number; captures: number; rated: number; score: number; expected: number };

const emptySums = (): Sums => ({ games: 0, captures: 0, rated: 0, score: 0, expected: 0 });

function inFilter(cell: ReportPlanCell, filter: ReportCellFilter) {
    if (filter.band !== null && cell.band !== filter.band) return false;
    if (filter.from === null && filter.to === null) return true;
    if (cell.year === null) return false;
    return (
        (filter.from === null || cell.year >= filter.from) &&
        (filter.to === null || cell.year <= filter.to)
    );
}

const margin = (sums: Sums) => (sums.score - sums.expected) / sums.rated;

/**
 * Each side's typical moves (white first) under the report's rating and period filter, most
 * played first. Null for reports saved before plans existed (version 6).
 */
export function reportPlans(
    report: OpeningReport,
    filter: ReportCellFilter,
): ReportSidePlans[] | null {
    const plans = report.plans;
    if (!plans) return null;
    return [true, false].map((white) => {
        const base = emptySums();
        const byMove = new Map<number, Sums>();
        for (const cell of plans.cells) {
            if (cell.white !== white || !inFilter(cell, filter)) continue;
            let sums = base;
            if (cell.planMove !== null) {
                sums = byMove.get(cell.planMove) ?? emptySums();
                byMove.set(cell.planMove, sums);
            }
            sums.games += cell.games;
            sums.captures += cell.captures;
            sums.rated += cell.ratedGames;
            sums.score += cell.score;
            sums.expected += cell.expected;
        }
        const rows = [...byMove]
            .map(([index, sums]): ReportPlanRow => {
                const delta =
                    sums.rated >= REPORT_PLAN_MIN_RATED && base.rated >= REPORT_PLAN_MIN_RATED
                        ? (margin(sums) - margin(base)) * 100
                        : null;
                return {
                    move: plans.moves[index],
                    games: sums.games,
                    share: base.games ? sums.games / base.games : 0,
                    capture: sums.captures * 2 > sums.games,
                    delta,
                };
            })
            .filter((row) => row.share >= REPORT_PLAN_MIN_SHARE)
            .sort((a, b) => b.games - a.games || a.move.typicalMove - b.move.typicalMove)
            .slice(0, REPORT_PLAN_ROWS);
        return { white, games: base.games, rows };
    });
}
