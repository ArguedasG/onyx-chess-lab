import { parsePgn } from "chessops/pgn";
import { describe, expect, it } from "vitest";
import type { EngineEvaluator, MaiaSampler } from "./engines";
import { generateRepertoire } from "./generate";
import { repertoirePgn, surprisesPgn } from "./pgn";
import { canonicalUci, playUci, positionKey } from "./positions";
import {
    difficulty,
    difficultyLevel,
    evaluationSymbol,
    focusValue,
    popularReplies,
    repliesToCover,
    wilsonLower,
} from "./scoring";
import type { LoadedSource } from "./sources";
import { findSurprises } from "./surprises";
import type { EngineView, GeneratorConfig, SourceMove, SourcePosition } from "./types";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const t = (_key: string, fallback: string, options?: Record<string, unknown>) =>
    fallback.replace(/\{\{(\w+)\}\}/g, (_, name) => String(options?.[name] ?? ""));

function move(uci: string, san: string, games: number, white: number, draws: number): SourceMove {
    return { uci, san, games, white, draws, black: games - white - draws };
}

function after(...moves: string[]) {
    let fen = START;
    for (const uci of moves) fen = playUci(fen, uci)!.fen;
    return fen;
}

function source(positions: Record<string, SourcePosition>): LoadedSource {
    const byKey = new Map(
        Object.entries(positions).map(([fen, value]) => [positionKey(fen), value]),
    );
    return { label: "Test", position: async (fen: string) => byKey.get(positionKey(fen)) ?? null };
}

/** Engine with fixed views; any other position is level with one legal move as best. */
function engine(views: Record<string, EngineView>): EngineEvaluator {
    const byKey = new Map(Object.entries(views).map(([fen, value]) => [positionKey(fen), value]));
    return {
        engine: { name: "Fake" },
        evaluate: async (fens: string[]) =>
            fens.map((fen) => {
                const known = byKey.get(positionKey(fen));
                if (known) return known;
                const sideMoves: Record<string, string> = { w: "g1f3", b: "g8f6" };
                const uci = sideMoves[fen.split(" ")[1]];
                return canonicalUci(fen, uci) ? { lines: [{ uci, cp: 0 }], bestCp: 0 } : null;
            }),
        cancel: () => {},
    } as unknown as EngineEvaluator;
}

const config: GeneratorConfig = {
    rootFen: START,
    rootMoves: [],
    color: "white",
    focus: "score",
    source: { kind: "masters" },
    opponent: { mode: "popular", maxReplies: 3, minShare: 10, elo: 1600 },
    depth: 3,
    minGames: 10,
    maxLoss: 50,
    surpriseShare: 5,
    engineMs: 100,
    maxPositions: 50,
};

describe("scoring", () => {
    it("prefers a large sample to a lucky small one", () => {
        expect(wilsonLower(65, 100)).toBeLessThan(0.65);
        const small = move("e2e4", "e4", 30, 18, 3);
        const large = move("d2d4", "d4", 3000, 1600, 300);
        expect(focusValue("score", large, "white")).toBeGreaterThan(
            focusValue("score", small, "white"),
        );
    });

    it("uses the rating par for the practical focus when the games are rated", () => {
        const stats = {
            ...move("e2e4", "e4", 100, 50, 0),
            ratedGames: 100,
            ratedPoints: 50,
            expectedPoints: 40,
        };
        expect(focusValue("practical", stats, "white")).toBeGreaterThan(0);
    });

    it("counts the replies a position needs and picks the popular ones", () => {
        const position: SourcePosition = {
            games: 100,
            moves: [
                move("e7e5", "e5", 80, 30, 20),
                move("c7c5", "c5", 15, 5, 5),
                move("a7a6", "a6", 5, 2, 1),
            ],
        };
        expect(repliesToCover(position)).toBe(1);
        expect(popularReplies(position, config.opponent, 10).map((reply) => reply.uci)).toEqual([
            "e7e5",
            "c7c5",
        ]);
    });

    it("measures how often a human keeps the evaluation", () => {
        const view: EngineView = {
            bestCp: 50,
            lines: [
                { uci: "e7e5", cp: 50 },
                { uci: "c7c5", cp: 45 },
                { uci: "a7a6", cp: -150 },
            ],
        };
        const found = difficulty(
            view,
            [
                { uci: "e7e5", count: 2 },
                { uci: "a7a6", count: 6 },
                { uci: "h7h5", count: 2 },
            ],
            "maia",
        )!;
        expect(found.keepProbability).toBeCloseTo(0.2);
        expect(difficultyLevel(found)).toBe("trap");
        expect(evaluationSymbol(20)).toBe("=");
        expect(evaluationSymbol(-250)).toBe("−+");
    });

    it("writes castling as engines do", () => {
        const fen = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";
        expect(canonicalUci(fen, "e1h1")).toBe("e1g1");
        expect(canonicalUci(fen, "e1g1")).toBe("e1g1");
        expect(canonicalUci(fen, "e1e3")).toBeNull();
    });
});

describe("repertoire generator", () => {
    const stats = source({
        [START]: {
            games: 300,
            moves: [
                move("e2e4", "e4", 150, 80, 30),
                move("d2d4", "d4", 100, 45, 20),
                move("b2b4", "b4", 50, 40, 5),
            ],
        },
        [after("e2e4")]: {
            games: 150,
            moves: [
                move("e7e5", "e5", 90, 40, 20),
                move("c7c5", "c5", 55, 25, 10),
                move("a7a6", "a6", 5, 3, 1),
            ],
        },
    });
    const views = engine({
        [START]: {
            bestCp: 30,
            lines: [
                { uci: "e2e4", cp: 30 },
                { uci: "d2d4", cp: 25 },
                { uci: "g1f3", cp: 20 },
            ],
        },
        // 1. b4 is not among the engine lines; after it Black is better.
        [after("b2b4")]: { bestCp: 120, lines: [{ uci: "e7e5", cp: 120 }] },
    });

    it("chooses by focus among sound moves and prepares the popular replies", async () => {
        const result = await generateRepertoire(config, { source: stats, evaluator: views });
        const first = result.root.children;
        expect(first).toHaveLength(1);
        // b4 scores best but the engine rejects it.
        expect(first[0].san).toBe("e4");
        expect(first[0].reason).toBe("focus");
        expect(first[0].children.map((child) => child.san)).toEqual(["e5", "c5"]);
        // Without statistics further on, the engine's move.
        expect(first[0].children[0].children[0].reason).toBe("engineFallback");
        expect(result.lines).toBe(2);

        const pgn = repertoirePgn(result, { name: "Test", startFen: START, provenance: "Test", t });
        const [game] = parsePgn(pgn);
        expect(game.moves.children[0].data.san).toBe("e4");
        expect(pgn).toContain("( 1... c5");
        expect(pgn).toContain("150 games");
    });

    it("uses Maia for the replies when the source has no games", async () => {
        const maia = {
            engine: { name: "Maia" },
            frequencies: async (fens: string[]) =>
                fens.map(() => [
                    { uci: "g8f6", count: 10 },
                    { uci: "d7d5", count: 6 },
                ]),
        } as unknown as MaiaSampler;
        const result = await generateRepertoire(
            { ...config, depth: 2, opponent: { ...config.opponent, mode: "maia" } },
            { source: source({}), evaluator: views, maia },
        );
        expect(result.root.children[0].san).toBe("e4");
        expect(result.root.children[0].reason).toBe("engineFallback");
        expect(result.root.children[0].children.map((child) => child.san)).toEqual(["Nf6", "d5"]);
    });
});

describe("surprise finder", () => {
    it("lists sound rare moves until the book ends and writes them with arrows", async () => {
        const line = [
            { fen: START, played: { uci: "e2e4", san: "e4" } },
            { fen: after("e2e4"), played: { uci: "e7e5", san: "e5" } },
            { fen: after("e2e4", "e7e5") },
        ];
        const stats = source({
            [START]: {
                games: 300,
                moves: [move("e2e4", "e4", 290, 150, 50), move("g1f3", "Nf3", 10, 5, 2)],
            },
            [after("e2e4")]: { games: 100, moves: [move("e7e5", "e5", 100, 40, 30)] },
            [after("e2e4", "e7e5")]: { games: 20, moves: [] },
        });
        const views = engine({
            [START]: {
                bestCp: 30,
                lines: [
                    { uci: "e2e4", cp: 30 },
                    { uci: "g1f3", cp: 25 },
                    { uci: "h2h4", cp: -80 },
                ],
            },
            [after("e2e4")]: {
                bestCp: -30,
                lines: [
                    { uci: "e7e5", cp: -30 },
                    { uci: "g8f6", cp: -40 },
                ],
            },
        });
        const result = await findSurprises(
            { line, color: null, firstMove: 1, stopGames: 40, maxShare: 5, maxLoss: 25 },
            { source: stats, evaluator: views },
        );
        expect(result.stopReason).toBe("book");
        expect(result.stoppedAt).toBe(2);
        // Nf3 is 3.3 % of the games; Nf6 has none; h4 loses too much.
        expect(result.surprises.map((surprise) => [surprise.san, surprise.kind])).toEqual(
            expect.arrayContaining([
                ["Nf3", "rare"],
                ["Nf6", "novelty"],
            ]),
        );
        expect(result.surprises).toHaveLength(2);
        const pgn = surprisesPgn(line, result.surprises, {
            name: "Surprises",
            startFen: START,
            elo: 1600,
            provenance: "Test",
            t,
        });
        expect(pgn).toContain("[%cal Gg1f3]");
        expect(pgn).toContain("[%cal Rg8f6]");
        const [game] = parsePgn(pgn);
        expect(game.moves.children[0].data.san).toBe("e4");
        expect(game.moves.children).toHaveLength(2);
    });
});
