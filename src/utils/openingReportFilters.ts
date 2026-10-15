import type { OpeningReport, ReportMoveCell, ReportResults } from "@/bindings";
import { reportGames } from "./openingReport";

/** Rating class (index into `report.eloBands`) and inclusive year range; null means "all". */
export type ReportCellFilter = {
    band: number | null;
    from: number | null;
    to: number | null;
};

export const ALL_GAMES: ReportCellFilter = { band: null, from: null, to: null };

/** Minimum games in a smoothed year window before its score is drawn. */
export const MIN_TREND_SCORE_GAMES = 30;
/** Minimum dated games and distinct years before the trends are worth a chart. */
export const MIN_TREND_GAMES = 100;
export const MIN_TREND_YEARS = 6;
const SMOOTHING_RADIUS = 2; // five-year window, centred

export function emptyResults(): ReportResults {
    return { white: 0, draw: 0, black: 0, unknown: 0 };
}

export function addResults(target: ReportResults, source: ReportResults) {
    target.white += source.white;
    target.draw += source.draw;
    target.black += source.black;
    target.unknown += source.unknown;
}

/** Reports saved before version 4 have no breakdown; their views stay unfiltered. */
export function reportCells(report: OpeningReport): ReportMoveCell[] {
    return report.moveBreakdown ?? [];
}

export function canFilterReport(report: OpeningReport) {
    return reportCells(report).length > 0;
}

export function isFiltered(filter: ReportCellFilter) {
    return filter.band !== null || filter.from !== null || filter.to !== null;
}

function matches(cell: ReportMoveCell, filter: ReportCellFilter, ignoreBand = false) {
    if (!ignoreBand && filter.band !== null && cell.band !== filter.band) return false;
    if (filter.from === null && filter.to === null) return true;
    if (cell.year === null) return false;
    return (
        (filter.from === null || cell.year >= filter.from) &&
        (filter.to === null || cell.year <= filter.to)
    );
}

/** Dated years covered by the breakdown, oldest first. */
export function reportYearRange(report: OpeningReport): [number, number] | null {
    let first = Number.POSITIVE_INFINITY;
    let last = Number.NEGATIVE_INFINITY;
    for (const cell of reportCells(report)) {
        if (cell.year === null) continue;
        first = Math.min(first, cell.year);
        last = Math.max(last, cell.year);
    }
    if (Number.isFinite(first)) return [first, last];
    const years = report.years.map((year) => year.year);
    return years.length ? [Math.min(...years), Math.max(...years)] : null;
}

/** Rated games of a continuation and White's expected and actual score over them (sums). */
export type RatedSums = { games: number; expectedWhite: number; scoreWhite: number };

export type MoveRow = { move: string; results: ReportResults; rated?: RatedSums };

/** Fewest rated games before a performance against the Elo expectation is shown. */
export const MIN_PERFORMANCE_GAMES = 10;

/** Rated sums per continuation under the filter. Reports saved before version 5 have none. */
function ratedByMove(report: OpeningReport, filter: ReportCellFilter) {
    const byMove = new Map<string, RatedSums>();
    for (const cell of reportCells(report)) {
        if (!matches(cell, filter) || !cell.ratedGames) continue;
        const sums = byMove.get(cell.move) ?? { games: 0, expectedWhite: 0, scoreWhite: 0 };
        sums.games += cell.ratedGames;
        sums.expectedWhite += cell.expectedWhite;
        sums.scoreWhite += cell.scoreWhite;
        byMove.set(cell.move, sums);
    }
    return byMove;
}

/**
 * Score of the side choosing the move against the score its Elo difference predicts, both in %.
 * Discounts that a move is mostly played by the stronger side. Null below `MIN_PERFORMANCE_GAMES`.
 */
export function moverPerformance(rated: RatedSums | undefined, moverIsWhite: boolean) {
    if (!rated || rated.games < MIN_PERFORMANCE_GAMES) return null;
    const score = moverIsWhite ? rated.scoreWhite : rated.games - rated.scoreWhite;
    const expected = moverIsWhite ? rated.expectedWhite : rated.games - rated.expectedWhite;
    return {
        games: rated.games,
        score: (score / rated.games) * 100,
        expected: (expected / rated.games) * 100,
        delta: ((score - expected) / rated.games) * 100,
    };
}

/** Continuations under the filter, most played first. Unfiltered uses the complete list. */
export function filteredMoves(report: OpeningReport, filter: ReportCellFilter): MoveRow[] {
    let rows: MoveRow[];
    const rated = ratedByMove(report, filter);
    if (!isFiltered(filter) || !canFilterReport(report)) {
        rows = report.position.openings.map(({ move, white, draw, black, unknown }) => ({
            move,
            results: { white, draw, black, unknown },
            rated: rated.get(move),
        }));
    } else {
        const byMove = new Map<string, ReportResults>();
        for (const cell of reportCells(report)) {
            if (!matches(cell, filter)) continue;
            const results = byMove.get(cell.move) ?? emptyResults();
            addResults(results, cell.results);
            byMove.set(cell.move, results);
        }
        rows = [...byMove].map(([move, results]) => ({ move, results, rated: rated.get(move) }));
    }
    return rows
        .filter((row) => reportGames(row.results) > 0)
        .sort(
            (a, b) =>
                reportGames(b.results) - reportGames(a.results) || a.move.localeCompare(b.move),
        );
}

/** Results of the whole position under the filter. */
export function filteredTotal(report: OpeningReport, filter: ReportCellFilter): ReportResults {
    if (!isFiltered(filter) || !canFilterReport(report)) return report.statistics.results;
    const total = emptyResults();
    for (const row of filteredMoves(report, filter)) addResults(total, row.results);
    return total;
}

/** Results per Elo band for the filter's period (the band choice itself is ignored). */
export function filteredBands(report: OpeningReport, filter: ReportCellFilter): ReportResults[] {
    if ((filter.from === null && filter.to === null) || !canFilterReport(report)) {
        return report.eloBands.map((band) => band.results);
    }
    const bands = report.eloBands.map(() => emptyResults());
    for (const cell of reportCells(report)) {
        if (cell.band === null || !matches(cell, filter, true)) continue;
        if (bands[cell.band]) addResults(bands[cell.band], cell.results);
    }
    return bands;
}

export type TrendSeries = {
    years: number[];
    moves: string[];
    /** Share of the position's games that chose each move, per year (0–100). */
    share: Record<string, number[]>;
    /** Score of the side choosing the move (0–100), or null where the sample is too small. */
    score: Record<string, (number | null)[]>;
};

/**
 * Year-by-year popularity and score of the main moves, smoothed over five years. Returns null
 * when there are too few dated games or years for a trend to mean anything.
 */
export function trendSeries(
    report: OpeningReport,
    filter: ReportCellFilter,
    moverIsWhite: boolean,
    maxMoves = 4,
): TrendSeries | null {
    const cells = reportCells(report).filter((cell) => cell.year !== null && matches(cell, filter));
    const yearSet = new Set(cells.map((cell) => cell.year!));
    const datedGames = cells.reduce((sum, cell) => sum + reportGames(cell.results), 0);
    if (yearSet.size < MIN_TREND_YEARS || datedGames < MIN_TREND_GAMES) return null;

    const first = Math.min(...yearSet);
    const last = Math.max(...yearSet);
    const years = Array.from({ length: last - first + 1 }, (_, i) => first + i);
    const totals = new Map<string, number>();
    const byYear = new Map<string, ReportResults[]>();
    const allByYear = years.map(() => 0);
    for (const cell of cells) {
        const index = cell.year! - first;
        const games = reportGames(cell.results);
        allByYear[index] += games;
        totals.set(cell.move, (totals.get(cell.move) ?? 0) + games);
        const series = byYear.get(cell.move) ?? years.map(() => emptyResults());
        addResults(series[index], cell.results);
        byYear.set(cell.move, series);
    }
    const moves = [...totals]
        .filter(([move]) => move !== "*")
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, maxMoves)
        .map(([move]) => move);

    const window = (index: number) => ({
        start: Math.max(0, index - SMOOTHING_RADIUS),
        end: Math.min(years.length - 1, index + SMOOTHING_RADIUS),
    });
    const share: TrendSeries["share"] = {};
    const score: TrendSeries["score"] = {};
    for (const move of moves) {
        const series = byYear.get(move)!;
        share[move] = years.map((_, index) => {
            const { start, end } = window(index);
            let moveGames = 0;
            let allGames = 0;
            for (let i = start; i <= end; i++) {
                moveGames += reportGames(series[i]);
                allGames += allByYear[i];
            }
            return allGames ? (moveGames / allGames) * 100 : 0;
        });
        score[move] = years.map((_, index) => {
            const { start, end } = window(index);
            const sum = emptyResults();
            for (let i = start; i <= end; i++) addResults(sum, series[i]);
            const known = sum.white + sum.draw + sum.black;
            if (known < MIN_TREND_SCORE_GAMES) return null;
            const wins = moverIsWhite ? sum.white : sum.black;
            return ((wins + sum.draw / 2) / known) * 100;
        });
    }
    return { years, moves, share, score };
}

/** Recent years compared with the earlier ones in `moveTrends`. */
export const TREND_RECENT_YEARS = 3;
/** Fewest games in each period, and the share change in points, before a trend is marked. */
export const MIN_TREND_PERIOD_GAMES = 30;
export const TREND_SHARE_POINTS = 5;

export type MoveTrend = { direction: "up" | "down"; recentShare: number; earlierShare: number };

/**
 * Whether each continuation is gaining or losing popularity: its share of the position's games in
 * the last `TREND_RECENT_YEARS` dated years against its share before them. Only marked when both
 * periods have enough games and the change is at least `TREND_SHARE_POINTS`.
 */
export function moveTrends(report: OpeningReport, filter: ReportCellFilter) {
    const trends = new Map<string, MoveTrend>();
    const cells = reportCells(report).filter((cell) => cell.year !== null && matches(cell, filter));
    if (!cells.length) return trends;
    const firstRecent = Math.max(...cells.map((cell) => cell.year!)) - TREND_RECENT_YEARS + 1;
    let recentTotal = 0;
    let earlierTotal = 0;
    const byMove = new Map<string, { recent: number; earlier: number }>();
    for (const cell of cells) {
        const games = reportGames(cell.results);
        const counts = byMove.get(cell.move) ?? { recent: 0, earlier: 0 };
        if (cell.year! >= firstRecent) {
            counts.recent += games;
            recentTotal += games;
        } else {
            counts.earlier += games;
            earlierTotal += games;
        }
        byMove.set(cell.move, counts);
    }
    if (recentTotal < MIN_TREND_PERIOD_GAMES || earlierTotal < MIN_TREND_PERIOD_GAMES)
        return trends;
    for (const [move, counts] of byMove) {
        if (move === "*") continue;
        const recentShare = (counts.recent / recentTotal) * 100;
        const earlierShare = (counts.earlier / earlierTotal) * 100;
        if (Math.abs(recentShare - earlierShare) < TREND_SHARE_POINTS) continue;
        trends.set(move, {
            direction: recentShare > earlierShare ? "up" : "down",
            recentShare,
            earlierShare,
        });
    }
    return trends;
}

/** Score of the side to move (who chooses the continuation), or null without known results. */
export function moverScore(results: ReportResults, moverIsWhite: boolean) {
    const known = results.white + results.draw + results.black;
    if (!known) return null;
    return (((moverIsWhite ? results.white : results.black) + results.draw / 2) / known) * 100;
}
