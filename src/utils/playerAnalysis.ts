import type { GameMetadata, MoveAnalysis, ScoreValue } from "@/bindings";
import { getCPLoss, getWinChance, normalizeScore } from "@/utils/score";
import { positionFromFen } from "@/utils/chessops";
import { openingLevelKey, openingNameLevels } from "@/utils/openingFamilies";
import {
    addRatingParGame,
    emptyRatingPar,
    finishRatingPar,
    type RatingPar,
} from "@/utils/ratingPar";
import { getTimeControl } from "@/utils/timeControl";

export const PLAYER_ANALYSIS_SCHEMA_VERSION = 3;

export const PLAYER_ANALYSIS_TIME_CONTROLS = [
    "ultra_bullet",
    "bullet",
    "blitz",
    "rapid",
    "classical",
    "correspondence",
    "daily",
    "unknown",
] as const;
export type PlayerAnalysisTimeControl = (typeof PLAYER_ANALYSIS_TIME_CONTROLS)[number];
export type PlayerAnalysisExercisePerspective = "improveDecision" | "punishError";

export type PlayerAnalysisSource = {
    databasePath: string;
    databaseTitle: string;
    playerId: number;
    playerName: string;
};

export type PlayerAnalysisGame = {
    key: string;
    source: PlayerAnalysisSource;
    game: GameMetadata;
};

export type PlayerAnalysisFilters = {
    startDate: string | null;
    endDate: string | null;
    color: "any" | "white" | "black";
    opponentEloMin: number | null;
    opponentEloMax: number | null;
    timeControl: string | null;
};

export type PlayerAnalysisReference = {
    key: string;
    databasePath: string;
    databaseTitle: string;
    gameId: number;
    playerId: number;
    ply: number | null;
};

export type PlayerAnalysisBucket = {
    key: string;
    games: number;
    wins: number;
    draws: number;
    losses: number;
    unknown: number;
    scorePercent: number | null;
    averagePlayerElo: number | null;
    averageOpponentElo: number | null;
    references: PlayerAnalysisReference[];
} & Partial<RatingPar>;

export type PlayerAnalysisFinding = {
    id: string;
    category: "opening" | "color" | "timeControl" | "rating" | "trend";
    priority: "high" | "medium" | "low";
    subject: string;
    sampleSize: number;
    scorePercent: number | null;
    references: PlayerAnalysisReference[];
};

export type PlayerMetadataAnalysis = {
    schemaVersion: number;
    generatedAt: string;
    playerName: string;
    sources: PlayerAnalysisSource[];
    filters: PlayerAnalysisFilters;
    sampleSize: number;
    summary: PlayerAnalysisBucket;
    byColor: PlayerAnalysisBucket[];
    byTimeControl: PlayerAnalysisBucket[];
    byOpponentRating: PlayerAnalysisBucket[];
    byRatingDifference: PlayerAnalysisBucket[];
    openings: PlayerAnalysisBucket[];
    /**
     * The same games grouped by opening family ("French Defense") and by family and variation
     * ("French Defense: Advance Variation"), so every level of the opening tree has exact results.
     * Missing in profiles generated before it existed.
     */
    openingGroups?: PlayerAnalysisBucket[];
    opponents: PlayerAnalysisBucket[];
    byYear: PlayerAnalysisBucket[];
    findings: PlayerAnalysisFinding[];
};

export type PlayerAnalysisPhase = "opening" | "middlegame" | "endgame";
export type PlayerAnalysisClassification = "inaccuracy" | "mistake" | "blunder";
export type PlayerClockCoverageLevel = "insufficient" | "exploratory" | "adequate" | "high";

export type PlayerAnalysisCriticalPosition = PlayerAnalysisReference & {
    fen: string;
    postMoveFen: string;
    playedMove: string;
    bestLine: string[];
    punishmentLine: string[];
    playerColor: "white" | "black";
    cpLoss: number;
    /** Points of winning chances lost by the move. Missing in analyses made before 8.4. */
    winChanceLoss?: number;
    classification: PlayerAnalysisClassification;
    phase: PlayerAnalysisPhase;
    opening: string;
    gameLabel: string;
    gameDate?: string | null;
};

export type PlayerEngineGameMetrics = {
    key: string;
    reference: PlayerAnalysisReference;
    moves: number;
    acpl: number | null;
    inaccuracies: number;
    mistakes: number;
    blunders: number;
    hadAdvantage: boolean;
    convertedAdvantage: boolean;
    wasInferior: boolean;
    savedInferior: boolean;
    phases: Array<{
        phase: PlayerAnalysisPhase;
        moves: number;
        acpl: number | null;
        inaccuracies: number;
        mistakes: number;
        blunders: number;
    }>;
    criticalPositions: PlayerAnalysisCriticalPosition[];
    hasClockData?: boolean;
    clock?: {
        clockedMoves: number;
        measuredDecisions: number;
        totalDecisionSeconds: number;
        averageDecisionSeconds: number | null;
        lowTimeMoves: number;
        criticalErrorsInLowTime: number;
    };
    /** Lowest and final winning chances of the player, 0–100. Missing before 8.4. */
    lowestWinChance?: number;
    finalWinChance?: number;
    /** Player moves and mistakes or blunders by remaining clock (see `clockBand`). */
    clockBands?: Record<PlayerClockBand, PlayerMoveErrors>;
    /** Moves decided in `FAST_MOVE_SECONDS` or less after the opening moves, and the rest. */
    fastMoves?: { fast: PlayerMoveErrors; other: PlayerMoveErrors };
    /** Player moves and mistakes or blunders in each range of `PLAYER_MOVE_RANGES`. */
    moveRanges?: PlayerMoveErrors[];
};

export type PlayerMoveErrors = { moves: number; errors: number };
export type PlayerClockBand = "low" | "middle" | "high";

/** Move-number ranges of the error distribution: 1–10, 11–20, 21–30, 31–40, 41–60 and 61+. */
export const PLAYER_MOVE_RANGES: ReadonlyArray<readonly [number, number | null]> = [
    [1, 10],
    [11, 20],
    [21, 30],
    [31, 40],
    [41, 60],
    [61, null],
];
/** A decision this quick, from move `FAST_MOVE_FROM` on, counts as a fast move. */
export const FAST_MOVE_SECONDS = 2;
export const FAST_MOVE_FROM = 11;

/**
 * Clock before a move as a share of the base time: under 10 % is "low", over a third is "high".
 * Only for a known base time; the bands describe, they do not judge time management.
 */
export function clockBand(remainingSeconds: number, baseSeconds: number): PlayerClockBand {
    const share = remainingSeconds / baseSeconds;
    if (share < 0.1) return "low";
    if (share > 1 / 3) return "high";
    return "middle";
}

function moveRangeIndex(moveNumber: number): number {
    const index = PLAYER_MOVE_RANGES.findIndex(
        ([from, to]) => moveNumber >= from && (to === null || moveNumber <= to),
    );
    return index < 0 ? PLAYER_MOVE_RANGES.length - 1 : index;
}

export type PlayerEngineAnalysis = {
    schemaVersion: number;
    analyzedAt: string;
    engine: {
        name: string;
        path: string;
        args: string[];
        options: Array<{ name: string; value: string }>;
        limit: string;
    };
    requestedGames: number;
    eligibleGames: number;
    timeControls: PlayerAnalysisTimeControl[];
    timeControlBreakdown: Array<{
        value: PlayerAnalysisTimeControl;
        eligibleGames: number;
        analyzedGames: number;
    }>;
    analyzedGames: number;
    skippedGames: number;
    moves: number;
    acpl: number | null;
    inaccuracies: number;
    mistakes: number;
    blunders: number;
    advantageGames: number;
    convertedAdvantages: number;
    conversionRate: number | null;
    inferiorGames: number;
    savedInferiorGames: number;
    defenseRate: number | null;
    phases: PlayerEngineGameMetrics["phases"];
    recurringErrors: Array<{
        key: string;
        fen?: string;
        playedMove?: string;
        phase: PlayerAnalysisPhase;
        classification: PlayerAnalysisClassification;
        opening: string;
        count: number;
        averageLoss: number;
        references: PlayerAnalysisReference[];
    }>;
    games: PlayerEngineGameMetrics[];
    criticalPositions: PlayerAnalysisCriticalPosition[];
    clockCoverage?: {
        selectedGames: number;
        gamesWithClock: number;
        percent: number;
        level: PlayerClockCoverageLevel;
    };
    timeManagement?: {
        measuredDecisions: number;
        averageDecisionSeconds: number;
        lowTimeMoves: number;
        criticalErrorsInLowTime: number;
    };
};

export function playerClockCoverage(
    gamesWithClock: number,
    selectedGames: number,
): NonNullable<PlayerEngineAnalysis["clockCoverage"]> {
    const percent = selectedGames ? (gamesWithClock / selectedGames) * 100 : 0;
    const level: PlayerClockCoverageLevel =
        gamesWithClock >= 50 && percent >= 85
            ? "high"
            : gamesWithClock >= 20 && percent >= 70
              ? "adequate"
              : gamesWithClock >= 10 && percent >= 50
                ? "exploratory"
                : "insufficient";
    return { selectedGames, gamesWithClock, percent, level };
}

export const DEFAULT_PLAYER_ANALYSIS_FILTERS: PlayerAnalysisFilters = {
    startDate: null,
    endDate: null,
    color: "any",
    opponentEloMin: null,
    opponentEloMax: null,
    timeControl: null,
};

type Perspective = {
    isWhite: boolean;
    player: string;
    opponent: string;
    playerElo: number | null;
    opponentElo: number | null;
    outcome: "win" | "draw" | "loss" | "unknown";
};

function perspective(item: PlayerAnalysisGame): Perspective {
    const isWhite = item.game.white_id === item.source.playerId;
    const result = item.game.result;
    const outcome =
        result === "1/2-1/2"
            ? "draw"
            : result === "*"
              ? "unknown"
              : (result === "1-0") === isWhite
                ? "win"
                : "loss";
    return {
        isWhite,
        player: isWhite ? item.game.white : item.game.black,
        opponent: isWhite ? item.game.black : item.game.white,
        playerElo: isWhite ? (item.game.white_elo ?? null) : (item.game.black_elo ?? null),
        opponentElo: isWhite ? (item.game.black_elo ?? null) : (item.game.white_elo ?? null),
        outcome,
    };
}

function reference(item: PlayerAnalysisGame, ply: number | null = null): PlayerAnalysisReference {
    return {
        key: item.key,
        databasePath: item.source.databasePath,
        databaseTitle: item.source.databaseTitle,
        gameId: item.game.id,
        playerId: item.source.playerId,
        ply,
    };
}

function mean(values: Array<number | null>): number | null {
    const known = values.filter((value): value is number => value != null);
    return known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : null;
}

function bucket(key: string, games: PlayerAnalysisGame[]): PlayerAnalysisBucket {
    let wins = 0;
    let draws = 0;
    let losses = 0;
    let unknown = 0;
    const views = games.map(perspective);
    const par = emptyRatingPar();
    for (const view of views) {
        if (view.outcome === "win") wins += 1;
        else if (view.outcome === "draw") draws += 1;
        else if (view.outcome === "loss") losses += 1;
        else unknown += 1;
        const points =
            view.outcome === "win"
                ? 1
                : view.outcome === "draw"
                  ? 0.5
                  : view.outcome === "loss"
                    ? 0
                    : null;
        addRatingParGame(par, view.playerElo, view.opponentElo, points);
    }
    const known = wins + draws + losses;
    return {
        key,
        games: games.length,
        wins,
        draws,
        losses,
        unknown,
        scorePercent: known ? ((wins + draws / 2) / known) * 100 : null,
        averagePlayerElo: mean(views.map((view) => view.playerElo)),
        averageOpponentElo: mean(views.map((view) => view.opponentElo)),
        references: games.slice(0, 100).map((game) => reference(game)),
        ...finishRatingPar(par),
    };
}

function group(
    games: PlayerAnalysisGame[],
    getKey: (game: PlayerAnalysisGame, view: Perspective) => string,
): PlayerAnalysisBucket[] {
    const groups = new Map<string, PlayerAnalysisGame[]>();
    for (const game of games) {
        const key = getKey(game, perspective(game));
        const values = groups.get(key) ?? [];
        values.push(game);
        groups.set(key, values);
    }
    return [...groups.entries()]
        .map(([key, values]) => bucket(key, values))
        .sort((a, b) => b.games - a.games || a.key.localeCompare(b.key));
}

function opponentRatingBand(elo: number | null): string {
    if (elo == null) return "unknown";
    if (elo < 1200) return "<1200";
    if (elo < 1600) return "1200–1599";
    if (elo < 1800) return "1600–1799";
    if (elo < 2000) return "1800–1999";
    if (elo < 2200) return "2000–2199";
    if (elo < 2400) return "2200–2399";
    return "2400+";
}

function ratingDifferenceBand(view: Perspective): string {
    if (view.playerElo == null || view.opponentElo == null) return "unknown";
    const difference = view.opponentElo - view.playerElo;
    if (difference <= -200) return "opponent ≤ -200";
    if (difference <= -50) return "opponent -199…-50";
    if (difference < 50) return "similar rating";
    if (difference < 200) return "opponent +50…+199";
    return "opponent ≥ +200";
}

export function filtersPlayerAnalysisGame(
    game: PlayerAnalysisGame,
    filters: PlayerAnalysisFilters,
): boolean {
    const view = perspective(game);
    if (filters.color === "white" && !view.isWhite) return false;
    if (filters.color === "black" && view.isWhite) return false;
    if (filters.startDate && (!game.game.date || game.game.date < filters.startDate)) return false;
    if (filters.endDate && (!game.game.date || game.game.date > filters.endDate)) return false;
    if (filters.timeControl && (game.game.time_control || "unknown") !== filters.timeControl) {
        return false;
    }
    if (filters.opponentEloMin != null && (view.opponentElo ?? -1) < filters.opponentEloMin) {
        return false;
    }
    if (
        filters.opponentEloMax != null &&
        (view.opponentElo ?? Number.MAX_VALUE) > filters.opponentEloMax
    ) {
        return false;
    }
    return true;
}

export function selectPlayerEngineGames(
    games: PlayerAnalysisGame[],
    filters: PlayerAnalysisFilters,
    limit: number | "all",
    timeControls: PlayerAnalysisTimeControl[] = [...PLAYER_ANALYSIS_TIME_CONTROLS],
): PlayerAnalysisGame[] {
    const selectedTimeControls = new Set(timeControls);
    const eligible = games
        .filter(
            (game) =>
                filtersPlayerAnalysisGame(game, filters) &&
                selectedTimeControls.has(getPlayerAnalysisTimeControl(game)),
        )
        .sort(
            (a, b) => (b.game.date ?? "").localeCompare(a.game.date ?? "") || b.game.id - a.game.id,
        );
    return limit === "all" ? eligible : eligible.slice(0, Math.max(1, limit));
}

export function getPlayerAnalysisTimeControl(item: PlayerAnalysisGame): PlayerAnalysisTimeControl {
    return timeControlCategory(item.game.time_control, item.game.site);
}

/** Category of a TimeControl header ("180+2", "blitz", Chess.com "1/86400"…). */
export function timeControlCategory(
    timeControl: string | null | undefined,
    site: string,
): PlayerAnalysisTimeControl {
    const raw = timeControl?.trim() ?? "";
    const direct = raw.toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
    if (direct === "ultrabullet") return "ultra_bullet";
    if (PLAYER_ANALYSIS_TIME_CONTROLS.includes(direct as PlayerAnalysisTimeControl)) {
        return direct as PlayerAnalysisTimeControl;
    }
    if (!raw || raw === "?") return "unknown";
    const website = site.toLowerCase().includes("chess.com") ? "Chess.com" : null;
    const isDaily = website === "Chess.com" && /^\d+\/\d+$/.test(raw);
    if (raw !== "-" && !isDaily && !/^\d+(?:\+\d+)?$/.test(raw)) return "unknown";
    const category = getTimeControl(website, raw);
    return PLAYER_ANALYSIS_TIME_CONTROLS.includes(category as PlayerAnalysisTimeControl)
        ? (category as PlayerAnalysisTimeControl)
        : "unknown";
}

export function playerAnalysisTimeControlCounts(
    games: PlayerAnalysisGame[],
    filters: PlayerAnalysisFilters,
): Array<{ value: PlayerAnalysisTimeControl; count: number }> {
    const counts = new Map<PlayerAnalysisTimeControl, number>();
    for (const game of games) {
        if (!filtersPlayerAnalysisGame(game, filters)) continue;
        const value = getPlayerAnalysisTimeControl(game);
        counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return PLAYER_ANALYSIS_TIME_CONTROLS.flatMap((value) =>
        counts.has(value) ? [{ value, count: counts.get(value)! }] : [],
    );
}

export function criticalPositionForPerspective(
    critical: PlayerAnalysisCriticalPosition,
    mode: PlayerAnalysisExercisePerspective,
) {
    if (mode === "punishError") {
        return {
            mode,
            fen: critical.postMoveFen,
            moves: critical.punishmentLine,
            ply: (critical.ply ?? 0) + 1,
            sideToMove: critical.playerColor === "white" ? ("black" as const) : ("white" as const),
        };
    }
    return {
        mode,
        fen: critical.fen,
        moves: critical.bestLine,
        ply: critical.ply ?? 0,
        sideToMove: critical.playerColor,
    };
}

function findingPriority(
    scorePercent: number | null,
    sample: number,
): PlayerAnalysisFinding["priority"] {
    if (sample >= 10 && scorePercent != null && scorePercent < 35) return "high";
    if (sample >= 5 && scorePercent != null && scorePercent < 45) return "medium";
    return "low";
}

function buildFindings(
    summary: PlayerAnalysisBucket,
    byColor: PlayerAnalysisBucket[],
    byTimeControl: PlayerAnalysisBucket[],
    openings: PlayerAnalysisBucket[],
    byRating: PlayerAnalysisBucket[],
): PlayerAnalysisFinding[] {
    const findings: PlayerAnalysisFinding[] = [];
    const weak = (
        category: PlayerAnalysisFinding["category"],
        values: PlayerAnalysisBucket[],
        minimum: number,
    ) => {
        for (const value of values) {
            if (value.games < minimum || value.scorePercent == null || value.scorePercent >= 45)
                continue;
            findings.push({
                id: `${category}:${value.key}`,
                category,
                priority: findingPriority(value.scorePercent, value.games),
                subject: value.key,
                sampleSize: value.games,
                scorePercent: value.scorePercent,
                references: value.references,
            });
        }
    };
    weak("opening", openings, 5);
    weak("timeControl", byTimeControl, 8);
    weak("rating", byRating, 8);
    if (summary.games >= 10) weak("color", byColor, 5);
    return findings.sort(
        (a, b) =>
            ({ high: 0, medium: 1, low: 2 })[a.priority] -
                { high: 0, medium: 1, low: 2 }[b.priority] || b.sampleSize - a.sampleSize,
    );
}

export function analyzePlayerGames(
    playerName: string,
    games: PlayerAnalysisGame[],
    sources: PlayerAnalysisSource[],
    filters: PlayerAnalysisFilters = DEFAULT_PLAYER_ANALYSIS_FILTERS,
    generatedAt = new Date().toISOString(),
): PlayerMetadataAnalysis {
    const filtered = games.filter((game) => filtersPlayerAnalysisGame(game, filters));
    const byColor = group(filtered, (_game, view) => (view.isWhite ? "white" : "black"));
    const byTimeControl = group(filtered, (game) => game.game.time_control || "unknown");
    const byOpponentRating = group(filtered, (_game, view) => opponentRatingBand(view.opponentElo));
    const byRatingDifference = group(filtered, (_game, view) => ratingDifferenceBand(view));
    const openings = group(
        filtered,
        (game) => game.game.opening || game.game.eco || "Unknown opening",
    );
    const openingName = (game: PlayerAnalysisGame) => game.game.opening || game.game.eco || "";
    const levelKey = (game: PlayerAnalysisGame, depth: number) => {
        const levels = openingNameLevels(openingName(game));
        return levels.length >= depth ? openingLevelKey(levels.slice(0, depth)) : null;
    };
    const openingGroups = [1, 2].flatMap((depth) =>
        group(
            filtered.filter((game) => levelKey(game, depth) !== null),
            (game) => levelKey(game, depth)!,
        ),
    );
    const opponents = group(filtered, (_game, view) => view.opponent || "Unknown opponent");
    const byYear = group(filtered, (game) => game.game.date?.slice(0, 4) || "unknown");
    const summary = bucket("all", filtered);
    return {
        schemaVersion: PLAYER_ANALYSIS_SCHEMA_VERSION,
        generatedAt,
        playerName,
        sources,
        filters,
        sampleSize: filtered.length,
        summary,
        byColor,
        byTimeControl,
        byOpponentRating,
        byRatingDifference,
        openings,
        openingGroups,
        opponents,
        byYear,
        findings: buildFindings(summary, byColor, byTimeControl, openings, byRatingDifference),
    };
}

function classifyPhase(fen: string, ply: number): PlayerAnalysisPhase {
    const board = fen.split(" ")[0]?.toLowerCase() ?? "";
    const queens = (board.match(/q/g) ?? []).length;
    const nonPawnPieces = (board.match(/[qrbn]/g) ?? []).length;
    if (ply < 20 && queens > 0 && nonPawnPieces >= 10) return "opening";
    if (queens === 0 && nonPawnPieces <= 6) return "endgame";
    return "middlegame";
}

/**
 * Version of the move classification, part of the stored engine limit so results classified
 * another way are recalculated (the analysis cache makes that cheap).
 */
export const PLAYER_ANALYSIS_CLASSIFICATION = "winchance-v1";

/**
 * Same thresholds as the game report: points of winning chances lost by the move (5, 10, 20), so
 * a slip at +8 is not judged like one at 0.00. The centipawn loss is kept for the ACPL.
 */
export function winChanceClassification(
    before: ScoreValue,
    after: ScoreValue,
    turn: "white" | "black",
): PlayerAnalysisClassification | null {
    const loss =
        getWinChance(normalizeScore(before, turn)) - getWinChance(normalizeScore(after, turn));
    if (loss > 20) return "blunder";
    if (loss > 10) return "mistake";
    if (loss > 5) return "inaccuracy";
    return null;
}

export function buildEngineGameMetrics(input: {
    item: PlayerAnalysisGame;
    uciMoves: string[];
    preMoveFens: string[];
    analysis: MoveAnalysis[];
    hasClockData?: boolean;
    clockSeconds?: Array<number | null>;
}): PlayerEngineGameMetrics {
    const { item, uciMoves, preMoveFens, analysis } = input;
    const losses: Array<{
        loss: number;
        phase: PlayerAnalysisPhase;
        label: PlayerAnalysisClassification | null;
    }> = [];
    const criticalPositions: PlayerAnalysisCriticalPosition[] = [];
    let hadAdvantage = false;
    let wasInferior = false;
    let previousPlayerClock: number | null = null;
    let clockedMoves = 0;
    let measuredDecisions = 0;
    let totalDecisionSeconds = 0;
    let lowTimeMoves = 0;
    let criticalErrorsInLowTime = 0;
    const simpleTimeControl = item.game.time_control?.match(/^(\d+(?:\.\d+)?)\+(\d+(?:\.\d+)?)$/);
    const initialSeconds = simpleTimeControl ? Number(simpleTimeControl[1]) : null;
    const incrementSeconds = simpleTimeControl ? Number(simpleTimeControl[2]) : null;
    // The clock bands also accept a base without increment ("600", as Chess.com writes it).
    const baseOnly = item.game.time_control?.match(/^(\d+(?:\.\d+)?)(?:\+\d+(?:\.\d+)?)?$/);
    const baseSeconds = baseOnly && Number(baseOnly[1]) > 0 ? Number(baseOnly[1]) : null;
    const playerColor = item.game.white_id === item.source.playerId ? "white" : "black";
    const empty = (): PlayerMoveErrors => ({ moves: 0, errors: 0 });
    const clockBands: Record<PlayerClockBand, PlayerMoveErrors> = {
        low: empty(),
        middle: empty(),
        high: empty(),
    };
    const fastMoves = { fast: empty(), other: empty() };
    let fastMeasured = false;
    const moveRanges = PLAYER_MOVE_RANGES.map(empty);
    let lowestWinChance: number | undefined;
    let finalWinChance: number | undefined;
    for (let index = 0; index <= uciMoves.length; index += 1) {
        const score = analysis[index]?.best[0]?.score.value;
        if (!score) continue;
        const chance = getWinChance(normalizeScore(score, playerColor));
        lowestWinChance =
            lowestWinChance === undefined ? chance : Math.min(lowestWinChance, chance);
        finalWinChance = chance;
    }
    for (let ply = 0; ply < uciMoves.length; ply += 1) {
        const preFen = preMoveFens[ply];
        const [position] = positionFromFen(preFen);
        if (!position) continue;
        const playerTurn =
            (position.turn === "white" && item.game.white_id === item.source.playerId) ||
            (position.turn === "black" && item.game.black_id === item.source.playerId);
        if (!playerTurn) continue;
        const currentClock = input.clockSeconds?.[ply];
        // Clock before this move (the one after the previous player move), for its band.
        const clockBefore = previousPlayerClock ?? baseSeconds;
        let decisionSeconds: number | null = null;
        if (currentClock != null && Number.isFinite(currentClock) && currentClock >= 0) {
            clockedMoves += 1;
            if (currentClock <= 30) lowTimeMoves += 1;
            const previous = previousPlayerClock ?? initialSeconds;
            if (previous != null && incrementSeconds != null) {
                const seconds = previous + incrementSeconds - currentClock;
                if (seconds >= 0 && seconds <= 86_400) {
                    measuredDecisions += 1;
                    totalDecisionSeconds += seconds;
                    decisionSeconds = seconds;
                }
            }
            previousPlayerClock = currentClock;
        }
        if (!analysis[ply]?.best[0] || !analysis[ply + 1]?.best[0]) continue;
        const playerScore = normalizeScore(analysis[ply].best[0].score.value, position.turn);
        if (playerScore >= 150) hadAdvantage = true;
        if (playerScore <= -150) wasInferior = true;
        const loss = getCPLoss(
            analysis[ply].best[0].score.value,
            analysis[ply + 1].best[0].score.value,
            position.turn,
        );
        const phase = classifyPhase(preFen, ply);
        const label = winChanceClassification(
            analysis[ply].best[0].score.value,
            analysis[ply + 1].best[0].score.value,
            position.turn,
        );
        losses.push({ loss, phase, label });
        const isError = label === "mistake" || label === "blunder";
        const moveNumber = Math.floor(ply / 2) + 1;
        const range = moveRanges[moveRangeIndex(moveNumber)];
        range.moves += 1;
        if (isError) range.errors += 1;
        if (currentClock != null && clockBefore != null && baseSeconds != null) {
            const band = clockBands[clockBand(clockBefore, baseSeconds)];
            band.moves += 1;
            if (isError) band.errors += 1;
        }
        if (decisionSeconds != null && moveNumber >= FAST_MOVE_FROM) {
            fastMeasured = true;
            const bucket = decisionSeconds <= FAST_MOVE_SECONDS ? fastMoves.fast : fastMoves.other;
            bucket.moves += 1;
            if (isError) bucket.errors += 1;
        }
        if (label) {
            if (currentClock != null && currentClock <= 30) criticalErrorsInLowTime += 1;
            const postMoveFen = preMoveFens[ply + 1];
            const punishmentLine = analysis[ply + 1].best[0].uciMoves.slice(0, 8);
            if (!postMoveFen || punishmentLine.length === 0) continue;
            criticalPositions.push({
                ...reference(item, ply),
                fen: preFen,
                postMoveFen,
                playedMove: uciMoves[ply],
                bestLine: analysis[ply].best[0].uciMoves.slice(0, 8),
                punishmentLine,
                playerColor: position.turn,
                cpLoss: loss,
                winChanceLoss:
                    getWinChance(normalizeScore(analysis[ply].best[0].score.value, position.turn)) -
                    getWinChance(
                        normalizeScore(analysis[ply + 1].best[0].score.value, position.turn),
                    ),
                classification: label,
                phase,
                opening: item.game.opening || item.game.eco || "Unknown opening",
                gameLabel: `${item.game.white} – ${item.game.black}`,
                gameDate: item.game.date,
            });
        }
    }
    const summarize = (values: typeof losses) => ({
        moves: values.length,
        acpl: values.length
            ? values.reduce((sum, value) => sum + value.loss, 0) / values.length
            : null,
        inaccuracies: values.filter((value) => value.label === "inaccuracy").length,
        mistakes: values.filter((value) => value.label === "mistake").length,
        blunders: values.filter((value) => value.label === "blunder").length,
    });
    return {
        key: item.key,
        reference: reference(item),
        ...summarize(losses),
        hadAdvantage,
        convertedAdvantage: hadAdvantage && perspective(item).outcome === "win",
        wasInferior,
        savedInferior: wasInferior && ["win", "draw"].includes(perspective(item).outcome),
        phases: (["opening", "middlegame", "endgame"] as PlayerAnalysisPhase[]).map((phase) => ({
            phase,
            ...summarize(losses.filter((value) => value.phase === phase)),
        })),
        criticalPositions,
        hasClockData:
            clockedMoves > 0 || (input.clockSeconds === undefined && (input.hasClockData ?? false)),
        clock:
            clockedMoves > 0
                ? {
                      clockedMoves,
                      measuredDecisions,
                      totalDecisionSeconds,
                      averageDecisionSeconds: measuredDecisions
                          ? totalDecisionSeconds / measuredDecisions
                          : null,
                      lowTimeMoves,
                      criticalErrorsInLowTime,
                  }
                : undefined,
        lowestWinChance,
        finalWinChance,
        clockBands: clockedMoves > 0 && baseSeconds != null ? clockBands : undefined,
        fastMoves: fastMeasured ? fastMoves : undefined,
        moveRanges,
    };
}

export function aggregateEngineAnalysis(input: {
    engine: PlayerEngineAnalysis["engine"];
    requestedGames: number;
    eligibleGames?: number;
    timeControls?: PlayerAnalysisTimeControl[];
    timeControlBreakdown?: PlayerEngineAnalysis["timeControlBreakdown"];
    skippedGames: number;
    games: PlayerEngineGameMetrics[];
    analyzedAt?: string;
}): PlayerEngineAnalysis {
    const metrics = input.games;
    const moves = metrics.reduce((sum, game) => sum + game.moves, 0);
    const weightedLoss = metrics.reduce((sum, game) => sum + (game.acpl ?? 0) * game.moves, 0);
    const phases = (["opening", "middlegame", "endgame"] as PlayerAnalysisPhase[]).map((phase) => {
        const values = metrics.map((game) => game.phases.find((value) => value.phase === phase)!);
        const phaseMoves = values.reduce((sum, value) => sum + value.moves, 0);
        return {
            phase,
            moves: phaseMoves,
            acpl: phaseMoves
                ? values.reduce((sum, value) => sum + (value.acpl ?? 0) * value.moves, 0) /
                  phaseMoves
                : null,
            inaccuracies: values.reduce((sum, value) => sum + value.inaccuracies, 0),
            mistakes: values.reduce((sum, value) => sum + value.mistakes, 0),
            blunders: values.reduce((sum, value) => sum + value.blunders, 0),
        };
    });
    const advantageGames = metrics.filter((game) => game.hadAdvantage).length;
    const convertedAdvantages = metrics.filter((game) => game.convertedAdvantage).length;
    const inferiorGames = metrics.filter((game) => game.wasInferior).length;
    const savedInferiorGames = metrics.filter((game) => game.savedInferior).length;
    const criticalPositions = metrics
        .flatMap((game) => game.criticalPositions)
        .sort((a, b) => b.cpLoss - a.cpLoss);
    const recurring = new Map<string, PlayerAnalysisCriticalPosition[]>();
    for (const critical of criticalPositions) {
        const normalizedFen = critical.fen.split(" ").slice(0, 4).join(" ");
        const key = `${normalizedFen}:${critical.playedMove}:${critical.classification}`;
        recurring.set(key, [...(recurring.get(key) ?? []), critical]);
    }
    const clockCoverage = playerClockCoverage(
        metrics.filter((game) => game.hasClockData).length,
        input.requestedGames,
    );
    const measuredDecisions = metrics.reduce(
        (sum, game) => sum + (game.clock?.measuredDecisions ?? 0),
        0,
    );
    const timeManagement =
        clockCoverage.level !== "insufficient" && measuredDecisions > 0
            ? {
                  measuredDecisions,
                  averageDecisionSeconds:
                      metrics.reduce(
                          (sum, game) => sum + (game.clock?.totalDecisionSeconds ?? 0),
                          0,
                      ) / measuredDecisions,
                  lowTimeMoves: metrics.reduce(
                      (sum, game) => sum + (game.clock?.lowTimeMoves ?? 0),
                      0,
                  ),
                  criticalErrorsInLowTime: metrics.reduce(
                      (sum, game) => sum + (game.clock?.criticalErrorsInLowTime ?? 0),
                      0,
                  ),
              }
            : undefined;
    return {
        schemaVersion: PLAYER_ANALYSIS_SCHEMA_VERSION,
        analyzedAt: input.analyzedAt ?? new Date().toISOString(),
        engine: input.engine,
        requestedGames: input.requestedGames,
        eligibleGames: input.eligibleGames ?? input.requestedGames,
        timeControls: input.timeControls ?? [...PLAYER_ANALYSIS_TIME_CONTROLS],
        timeControlBreakdown: input.timeControlBreakdown ?? [],
        analyzedGames: metrics.length,
        skippedGames: input.skippedGames,
        moves,
        acpl: moves ? weightedLoss / moves : null,
        inaccuracies: metrics.reduce((sum, game) => sum + game.inaccuracies, 0),
        mistakes: metrics.reduce((sum, game) => sum + game.mistakes, 0),
        blunders: metrics.reduce((sum, game) => sum + game.blunders, 0),
        advantageGames,
        convertedAdvantages,
        conversionRate: advantageGames ? (convertedAdvantages / advantageGames) * 100 : null,
        inferiorGames,
        savedInferiorGames,
        defenseRate: inferiorGames ? (savedInferiorGames / inferiorGames) * 100 : null,
        phases,
        recurringErrors: [...recurring.entries()]
            .filter(([, values]) => values.length >= 2)
            .map(([key, values]) => ({
                key,
                fen: values[0].fen.split(" ").slice(0, 4).join(" "),
                playedMove: values[0].playedMove,
                phase: values[0].phase,
                classification: values[0].classification,
                opening: values[0].opening,
                count: values.length,
                averageLoss: values.reduce((sum, value) => sum + value.cpLoss, 0) / values.length,
                references: values.slice(0, 20).map((value) => ({
                    key: value.key,
                    databasePath: value.databasePath,
                    databaseTitle: value.databaseTitle,
                    gameId: value.gameId,
                    playerId: value.playerId,
                    ply: value.ply,
                })),
            }))
            .sort((a, b) => b.count - a.count || b.averageLoss - a.averageLoss),
        games: metrics,
        criticalPositions,
        clockCoverage,
        timeManagement,
    };
}
