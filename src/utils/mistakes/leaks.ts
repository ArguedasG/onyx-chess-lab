/**
 * Catalogue of leaks (8.7, I-29): every error of an engine analysis in one category, from the
 * most specific to the generic one, with written thresholds. A category is named only when a rule
 * checks it on the board or in the engine lines; the rest stay "unclassified", which is the honest
 * drawer (market study, section 5).
 */
import {
    attacks,
    type Color,
    isNormal,
    type NormalMove,
    parseUci,
    type Piece,
    type Square,
} from "chessops";
import { makeFen } from "chessops/fen";
import { positionFromFen } from "@/utils/chessops";
import type {
    PlayerAnalysisCriticalPosition,
    PlayerAnalysisPhase,
    PlayerEngineAnalysis,
} from "@/utils/playerAnalysis";

export type LeakCategory =
    | "allowedMate"
    | "missedMate"
    | "hangingPiece"
    | "allowedFork"
    | "missedFork"
    | "missedCapture"
    | "missedPromotion"
    | "conversion"
    | "collapse"
    | "timeTrouble"
    | "opening"
    | "endgame"
    | "unclassified";

/** Order of the checks: the first rule that holds names the error. */
export const LEAK_CATEGORIES: readonly LeakCategory[] = [
    "allowedMate",
    "missedMate",
    "hangingPiece",
    "allowedFork",
    "missedFork",
    "missedCapture",
    "missedPromotion",
    "conversion",
    "collapse",
    "timeTrouble",
    "opening",
    "endgame",
    "unclassified",
];

/** Points of winning chances a tactical category needs (the "mistake" threshold). */
export const TACTICAL_LOSS = 10;
/** Conversion: from at least this chance… */
export const CONVERSION_FROM = 80;
/** …to below this one after the move. */
export const CONVERSION_TO = 60;
/** Collapse when worse: a defendable position (between these chances) and a mistake. */
export const COLLAPSE_RANGE = [10, 40] as const;
/** Time trouble: less than this share of the base time on the clock. */
export const TIME_TROUBLE_SHARE = 0.1;
/** The opening, for this category: the first ten moves. */
export const OPENING_PLIES = 20;

const VALUE: Record<string, number> = {
    pawn: 1,
    knight: 3,
    bishop: 3,
    rook: 5,
    queen: 9,
    king: 100,
};

function move(uci: string | undefined): NormalMove | null {
    const parsed = uci ? parseUci(uci) : undefined;
    return parsed && isNormal(parsed) ? parsed : null;
}

/** Plays a UCI line from a FEN; the position after it, or null when a move is illegal. */
function playLine(fen: string, line: readonly string[]) {
    const [position] = positionFromFen(fen);
    if (!position) return null;
    for (const uci of line) {
        const parsed = parseUci(uci);
        if (!parsed || !position.isLegal(parsed)) return null;
        position.play(parsed);
    }
    return position;
}

/** The pieces of `victim` worth a knight or more (or the king) that the piece on `square` attacks. */
function forkTargets(fen: string, square: Square, victim: Color) {
    const [position] = positionFromFen(fen);
    if (!position) return 0;
    const piece: Piece | undefined = position.board.get(square);
    if (!piece || piece.color === victim) return 0;
    let count = 0;
    for (const target of attacks(piece, square, position.board.occupied)) {
        const attacked = position.board.get(target);
        if (attacked && attacked.color === victim && VALUE[attacked.role] >= 3) count += 1;
    }
    return count;
}

/** After a move, its piece attacks two or more valuable pieces (or the king and one). */
function isFork(fen: string, uci: string | undefined, victim: Color): boolean {
    const parsed = move(uci);
    if (!parsed) return false;
    const after = playLine(fen, [uci!]);
    if (!after) return false;
    return forkTargets(makeFen(after.toSetup()), parsed.to, victim) >= 2;
}

/**
 * The opponent's reply takes a piece of the player (a knight or more) that nothing of the player
 * can take back.
 */
function isHangingPiece(critical: PlayerAnalysisCriticalPosition): boolean {
    const reply = move(critical.punishmentLine[0]);
    if (!reply) return false;
    const [position] = positionFromFen(critical.postMoveFen);
    if (!position) return false;
    const taken = position.board.get(reply.to);
    if (!taken || taken.color !== critical.playerColor || VALUE[taken.role] < 3) return false;
    position.play(reply);
    const defenders = position.kingAttackers(
        reply.to,
        critical.playerColor,
        position.board.occupied,
    );
    return defenders.isEmpty();
}

function opponent(color: Color): Color {
    return color === "white" ? "black" : "white";
}

export function classifyLeak(critical: PlayerAnalysisCriticalPosition): LeakCategory {
    const loss = critical.winChanceLoss ?? 0;
    const tactical = loss >= TACTICAL_LOSS;
    if (tactical) {
        const punished = playLine(critical.postMoveFen, critical.punishmentLine);
        if (punished?.isCheckmate()) return "allowedMate";
        if (critical.bestWasMate) return "missedMate";
        if (isHangingPiece(critical)) return "hangingPiece";
        if (isFork(critical.postMoveFen, critical.punishmentLine[0], critical.playerColor))
            return "allowedFork";
        if (isFork(critical.fen, critical.bestLine[0], opponent(critical.playerColor)))
            return "missedFork";
        const best = move(critical.bestLine[0]);
        if (best?.promotion) return "missedPromotion";
        if (best) {
            const [before] = positionFromFen(critical.fen);
            const captured = before?.board.get(best.to);
            if (captured && captured.color !== critical.playerColor && VALUE[captured.role] >= 3)
                return "missedCapture";
        }
    }
    const before = critical.winChanceBefore;
    if (before != null) {
        if (before >= CONVERSION_FROM && before - loss < CONVERSION_TO) return "conversion";
        if (before >= COLLAPSE_RANGE[0] && before <= COLLAPSE_RANGE[1] && tactical)
            return "collapse";
    }
    if (critical.clockShare != null && critical.clockShare < TIME_TROUBLE_SHARE)
        return "timeTrouble";
    if (critical.ply != null && critical.ply < OPENING_PLIES) return "opening";
    if (critical.phase === ("endgame" satisfies PlayerAnalysisPhase)) return "endgame";
    return "unclassified";
}

export type LeakRow = {
    category: LeakCategory;
    errors: number;
    /** Points of winning chances given away in total. */
    cost: number;
    /** Games with an error of the category made from a position that was not worse, then lost. */
    turnedLosses: number;
    examples: PlayerAnalysisCriticalPosition[];
};

export type LeakCatalogue = {
    rows: LeakRow[];
    /** Errors of the analysis made before 8.7, without the data some rules need. */
    missingData: number;
    analyzedGames: number;
    playerMoves: number;
};

/**
 * Leaks of the analyzed games among `keys` (the card filters), most costly first. Only mistakes
 * and blunders by default; inaccuracies are too noisy to name a habit.
 */
export function leakCatalogue(
    engine: PlayerEngineAnalysis,
    keys: ReadonlySet<string>,
    outcomes: ReadonlyMap<string, string>,
    includeInaccuracies = false,
): LeakCatalogue {
    const games = engine.games.filter((game) => keys.has(game.key));
    const criticals = games
        .flatMap((game) => game.criticalPositions)
        .filter((critical) => includeInaccuracies || critical.classification !== "inaccuracy");
    const rows = new Map<LeakCategory, LeakRow & { lostGames: Set<string> }>();
    let missingData = 0;
    for (const critical of criticals) {
        if (critical.winChanceBefore == null) missingData += 1;
        const category = classifyLeak(critical);
        const row = rows.get(category) ?? {
            category,
            errors: 0,
            cost: 0,
            turnedLosses: 0,
            examples: [],
            lostGames: new Set<string>(),
        };
        row.errors += 1;
        row.cost += critical.winChanceLoss ?? 0;
        if ((critical.winChanceBefore ?? 0) >= 40 && outcomes.get(critical.key) === "loss")
            row.lostGames.add(critical.key);
        row.examples.push(critical);
        rows.set(category, row);
    }
    return {
        rows: [...rows.values()]
            .map(({ lostGames, ...row }) => ({
                ...row,
                turnedLosses: lostGames.size,
                examples: row.examples.sort(
                    (a, b) => (b.winChanceLoss ?? 0) - (a.winChanceLoss ?? 0),
                ),
            }))
            .sort((a, b) => b.cost - a.cost || b.errors - a.errors),
        missingData,
        analyzedGames: games.length,
        playerMoves: games.reduce((sum, game) => sum + game.moves, 0),
    };
}

/** "2024-Q2" of a date ("2024.05.01", "2024-05" …); null when unknown. */
export function quarterOf(date: string | null | undefined): string | null {
    const match = date?.match(/^(\d{4})[.-](\d{2})/);
    if (!match) return null;
    return `${match[1]}-Q${Math.floor((Number(match[2]) - 1) / 3) + 1}`;
}

export type LeakTrendPoint = { quarter: string; moves: number } & Partial<
    Record<LeakCategory, number>
>;

/**
 * Errors of each category per 100 moves of the player, by quarter. Quarters with fewer than
 * `minMoves` analyzed moves are left out: a rate over a handful of moves means nothing.
 */
export function leakTrend(
    engine: PlayerEngineAnalysis,
    keys: ReadonlySet<string>,
    dates: ReadonlyMap<string, string | null>,
    categories: readonly LeakCategory[],
    minMoves = 100,
): LeakTrendPoint[] {
    const byQuarter = new Map<string, { moves: number; counts: Map<LeakCategory, number> }>();
    for (const game of engine.games) {
        if (!keys.has(game.key)) continue;
        const quarter = quarterOf(dates.get(game.key));
        if (!quarter) continue;
        const entry = byQuarter.get(quarter) ?? { moves: 0, counts: new Map() };
        entry.moves += game.moves;
        for (const critical of game.criticalPositions) {
            if (critical.classification === "inaccuracy") continue;
            const category = classifyLeak(critical);
            entry.counts.set(category, (entry.counts.get(category) ?? 0) + 1);
        }
        byQuarter.set(quarter, entry);
    }
    return [...byQuarter.entries()]
        .filter(([, entry]) => entry.moves >= minMoves)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([quarter, entry]) => ({
            quarter,
            moves: entry.moves,
            ...Object.fromEntries(
                categories.map((category) => [
                    category,
                    Math.round(((entry.counts.get(category) ?? 0) / entry.moves) * 1000) / 10,
                ]),
            ),
        }));
}
