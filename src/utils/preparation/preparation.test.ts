import { describe, expect, it } from "vitest";
import type { PlayerGameRow, PlayerTree, PositionTreeNode, ThinkTime } from "@/bindings";
import type { PlayerAnalysisSource } from "@/utils/playerAnalysis";
import { type ProfileGame, toProfileGame } from "@/utils/players/profileGames";
import { playUci } from "@/utils/repertoireGenerator/positions";
import { createEmptyTrainingAreas, type OpeningsState } from "@/utils/trainingAreas";
import {
    bookSource,
    booksFromTrees,
    mainLine,
    movesInBook,
    playerPar,
    type PlayerBook,
    START_FEN,
} from "./book";
import { howToPlay } from "./howToPlay";
import { keyPositionCandidates } from "./keyPositions";
import { bookMovetext, preparationPackage } from "./package";
import { repertoirePositions } from "./repertoireDifficulty";
import { compareWithRepertoire, repertoireTree } from "./repertoireReality";
import { gameTypeRows, structureFamilyRows, structureRows } from "./structures";
import {
    binPercentile,
    bookChoices,
    fidelityPlan,
    splitForFidelity,
    twinRepertoire,
    twinThinking,
    twinTiming,
} from "./twin";

/** A tree node as Rust sends it, built by playing UCI lines (all games 1-0 unless given). */
function treeFromLines(
    lines: Array<{ moves: string[]; result?: "1-0" | "0-1" | "1/2-1/2"; date?: string }>,
): PositionTreeNode[] {
    const nodes = new Map<string, PositionTreeNode>();
    for (const line of lines) {
        let fen = START_FEN;
        for (const uci of line.moves) {
            const next = playUci(fen, uci)!;
            const node = nodes.get(fen) ?? { fen, games: 0, moves: [] };
            node.games += 1;
            let move = node.moves.find((candidate) => candidate.uci === next.uci);
            if (!move) {
                move = {
                    uci: next.uci,
                    san: next.san,
                    games: 0,
                    white: 0,
                    draws: 0,
                    black: 0,
                    ratedGames: 0,
                    ratedPoints: 0,
                    expectedPoints: 0,
                    firstDate: line.date ?? "2024.01.01",
                    lastDate: line.date ?? "2024.01.01",
                };
                node.moves.push(move);
            }
            move.games += 1;
            const result = line.result ?? "1-0";
            if (result === "1-0") move.white += 1;
            else if (result === "0-1") move.black += 1;
            else move.draws += 1;
            nodes.set(fen, node);
            fen = next.fen;
        }
    }
    return [...nodes.values()].map((node) => ({
        ...node,
        moves: [...node.moves].sort((a, b) => b.games - a.games),
    }));
}

function tree(
    white: PositionTreeNode[],
    black: PositionTreeNode[],
    whiteLines: string[][] = [],
): PlayerTree {
    return {
        white,
        black,
        whiteGames: white[0]?.games ?? 0,
        blackGames: black[0]?.games ?? 0,
        whiteLines: whiteLines.map((moves) => ({ moves, games: 1 })),
        blackLines: [],
        elapsedMs: 0,
    };
}

const source: PlayerAnalysisSource = {
    databasePath: "rival.db3",
    databaseTitle: "Rival",
    playerId: 1,
    playerName: "Rival",
};

let nextId = 1;
function game(input: Partial<PlayerGameRow> & { result: string }): ProfileGame {
    return toProfileGame(
        {
            id: nextId++,
            playerId: 1,
            isWhite: true,
            opponent: "Me",
            opponentId: 2,
            playerElo: 1600,
            opponentElo: 1600,
            date: "2026.01.10",
            time: null,
            event: "Event",
            site: "Site",
            timeControl: "600+5",
            eco: null,
            opening: "French Defense: Advance Variation",
            plies: 60,
            customStart: false,
            ending: "open",
            playerToMoveAtEnd: false,
            playerLastClock: null,
            opponentLastClock: null,
            structures: [],
            playerThink: null,
            queensOffPly: null,
            endgamePly: null,
            ...input,
        },
        source,
    );
}

describe("player book", () => {
    it("merges the trees of several databases by position", () => {
        const first = treeFromLines([{ moves: ["e2e4", "e7e5"] }]);
        const second = treeFromLines([
            { moves: ["e2e4", "c7c5"], result: "0-1", date: "2025.03.01" },
        ]);
        const books = booksFromTrees([
            { databasePath: "a.db3", tree: tree(first, []) },
            { databasePath: "b.db3", tree: tree(second, []) },
        ]);
        expect(books.white.games).toBe(2);
        const root = books.white.positions.values().next().value!;
        expect(root.moves[0].san).toBe("e4");
        expect(root.moves[0].games).toBe(2);
        expect(root.moves[0].lastDay).toBe("2025-03-01");
    });

    it("gives the rating par of the player whoever moved", () => {
        const book: PlayerBook = { color: "white", games: 10, positions: new Map(), lines: [] };
        const move = {
            uci: "e7e5",
            san: "e5",
            games: 10,
            white: 6,
            draws: 0,
            black: 4,
            ratedGames: 10,
            // Black played the move: Black scored 4 against 5 expected, so White scored 6 against 5.
            ratedPoints: 4,
            expectedPoints: 5,
        };
        const afterE4 = playUci(START_FEN, "e2e4")!.fen;
        expect(playerPar(book, afterE4, move)).toBeCloseTo(10);
        expect(playerPar({ ...book, color: "black" }, afterE4, move)).toBeCloseTo(-10);
    });

    it("works as a generator source and follows the most played line", async () => {
        const books = booksFromTrees([
            {
                databasePath: "a.db3",
                tree: tree(
                    treeFromLines([
                        { moves: ["e2e4", "c7c5", "g1f3"] },
                        { moves: ["e2e4", "c7c5", "g1f3"] },
                        { moves: ["d2d4"] },
                    ]),
                    [],
                ),
            },
        ]);
        const position = await bookSource(books.white, "Rival").position(START_FEN);
        expect(position?.games).toBe(3);
        const line = mainLine(books.white);
        expect(line.map((step) => step.played?.san).filter(Boolean)).toEqual(["e4", "c5", "Nf3"]);
        // A given start is followed first.
        expect(mainLine(books.white, ["d2d4"])[0].played?.san).toBe("d4");
    });

    it("tells where a line tried on the board leaves the player's games", () => {
        const books = booksFromTrees([
            {
                databasePath: "a.db3",
                tree: tree(
                    treeFromLines([
                        { moves: ["e2e4", "e7e5", "g1f3"] },
                        { moves: ["d2d4", "d7d5", "c2c4"] },
                    ]),
                    [],
                ),
            },
        ]);
        expect(movesInBook(books.white, ["e2e4", "e7e5", "g1f3"])).toBe(3);
        expect(movesInBook(books.white, ["e2e4", "c7c5", "g1f3"])).toBe(1);
        expect(movesInBook(books.white, ["c2c4"])).toBe(0);
        expect(movesInBook(books.white, [])).toBe(0);
    });
});

describe("key positions (I-33)", () => {
    it("keeps the player's turns reached often enough, from move three", () => {
        const lines = Array.from({ length: 6 }, () => ({
            moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6"],
        }));
        const books = booksFromTrees([
            { databasePath: "a.db3", tree: tree(treeFromLines(lines), []) },
        ]);
        const found = keyPositionCandidates(books.white);
        expect(found.length).toBeGreaterThan(0);
        expect(found.every((position) => position.path.length >= 4)).toBe(true);
        expect(found.every((position) => position.path.length % 2 === 0)).toBe(true);
    });
});

function openingsWith(lines: Array<{ moves: string[] }>, color: "white" | "black"): OpeningsState {
    const base = createEmptyTrainingAreas().openings;
    return {
        ...base,
        repertoires: {
            r1: {
                id: "r1",
                name: "Repertoire",
                color,
                description: "",
                path: "r1.pgn",
                sourcePath: "r1-source.pgn",
                recordCount: 1,
                variantIds: ["v1"],
                acceptanceThresholdCp: 50,
                subvariationPolicy: "all",
                createdAt: "",
                updatedAt: "",
            },
        },
        variants: {
            v1: {
                id: "v1",
                repertoireId: "r1",
                name: "Main",
                lineIds: lines.map((_, index) => `l${index}`),
                sourceRecordIndex: 0,
                trainingRecordIndex: 0,
                contentType: "theory",
                commentCount: 0,
                hasVariations: false,
            },
        },
        lines: Object.fromEntries(
            lines.map((line, index) => [
                `l${index}`,
                {
                    id: `l${index}`,
                    variantId: "v1",
                    name: `Line ${index}`,
                    fen: START_FEN,
                    moves: line.moves,
                    path: line.moves.map(() => 0),
                    plyCount: line.moves.length,
                    trainable: true,
                    sourceRecordIndex: null,
                    moveProgress: {},
                    session: { attempts: 0, completions: 0, flawless: 0, totalTimeMs: 0 },
                },
            ]),
        ),
    };
}

describe("repertoire against reality (I-19)", () => {
    const openings = openingsWith([{ moves: ["e2e4", "e7e5", "g1f3"] }], "white");

    it("separates the player's own deviations from replies the repertoire lacks", () => {
        const books = booksFromTrees([
            {
                databasePath: "a.db3",
                tree: tree(
                    treeFromLines([
                        { moves: ["e2e4", "e7e5", "g1f3", "b8c6"] },
                        { moves: ["e2e4", "e7e5", "f1c4"] },
                        { moves: ["e2e4", "c7c5"], result: "0-1" },
                        { moves: ["e2e4", "c7c5"], result: "0-1" },
                    ]),
                    [],
                ),
            },
        ]);
        const result = compareWithRepertoire(
            books.white,
            repertoireTree(openings, "white"),
            "self",
        );
        expect(result.games).toBe(4);
        expect(result.completed).toBe(1);
        const gap = result.exits.find((exit) => exit.kind === "gap")!;
        expect(gap.move.san).toBe("c5");
        expect(gap.games).toBe(2);
        expect(gap.scorePercent).toBe(0);
        const own = result.exits.find((exit) => exit.kind === "own")!;
        expect(own.move.san).toBe("Bc4");
        expect(own.prepared).toEqual(["Nf3"]);
    });

    it("lists only the rival's replies when the book is a rival's", () => {
        // The rival has Black against the user's 1.e4 repertoire.
        const books = booksFromTrees([
            {
                databasePath: "a.db3",
                tree: tree(
                    [],
                    treeFromLines([
                        { moves: ["e2e4", "e7e6"] },
                        { moves: ["d2d4", "d7d5"] },
                        { moves: ["e2e4", "e7e5", "f1c4"] },
                    ]),
                ),
            },
        ]);
        const result = compareWithRepertoire(
            books.black,
            repertoireTree(openings, "white"),
            "rival",
        );
        expect(result.exits.map((exit) => exit.move.san)).toEqual(["e6"]);
        expect(result.exits[0].kind).toBe("gap");
    });
});

describe("how to play (I-32)", () => {
    it("names lines below par and says to play the repertoire when nothing is", () => {
        const games = [
            ...Array.from({ length: 12 }, () =>
                game({ result: "0-1", opening: "Sicilian Defense: Najdorf Variation" }),
            ),
            ...Array.from({ length: 12 }, (_, index) =>
                game({
                    result: index % 2 ? "1-0" : "0-1",
                    opening: "French Defense: Advance Variation",
                }),
            ),
        ];
        const result = howToPlay(games, null);
        expect(result.verdict).toBe("targets");
        expect(result.weakOpenings.white[0].name).toContain("Sicilian Defense");
        const balanced = howToPlay(
            Array.from({ length: 16 }, (_, index) =>
                game({
                    result: index % 2 ? "1-0" : "0-1",
                    opening: "French Defense: Advance Variation",
                }),
            ),
            null,
        );
        expect(balanced.verdict).toBe("playYourRepertoire");
        expect(howToPlay(games.slice(0, 5), null).verdict).toBe("tooFewGames");
    });
});

describe("structures (I-31)", () => {
    it("counts each structure with it and against it", () => {
        const games = [
            game({ result: "1-0", structures: [{ structure: "iqp", ownerWhite: true, ply: 24 }] }),
            game({
                result: "0-1",
                isWhite: false,
                structures: [{ structure: "iqp", ownerWhite: true, ply: 30 }],
            }),
            game({ result: "1/2-1/2", queensOffPly: 30, endgamePly: 60 }),
        ];
        const [iqp] = structureRows(games);
        expect(iqp.structure).toBe("iqp");
        expect(iqp.own.games).toBe(1);
        expect(iqp.against.games).toBe(1);
        expect(iqp.against.wins).toBe(1);
        const types = gameTypeRows(games);
        expect(types.earlyQueens.games).toBe(1);
        expect(types.endgames.games).toBe(1);
    });
});

describe("structure families (I-31, 9.3)", () => {
    it("groups the structures and counts a game once per family and role", () => {
        const games = [
            game({
                result: "1-0",
                structures: [
                    { structure: "kingsIndianI", ownerWhite: false, ply: 24 },
                    { structure: "kingsIndianIII", ownerWhite: false, ply: 34 },
                ],
            }),
            game({
                result: "0-1",
                structures: [{ structure: "iqp", ownerWhite: true, ply: 30 }],
            }),
        ];
        const families = structureFamilyRows(games);
        const kingsIndian = families.find((family) => family.family === "kingsIndian")!;
        expect(kingsIndian.games).toBe(1);
        expect(kingsIndian.against.games).toBe(1);
        expect(kingsIndian.rows.map((row) => row.structure).sort()).toEqual([
            "kingsIndianI",
            "kingsIndianIII",
        ]);
        expect(families.find((family) => family.family === "isolated")!.own.games).toBe(1);
        expect(families.some((family) => family.family === "french")).toBe(false);
    });
});

describe("twin think time (9.3)", () => {
    const think = (moves: number, seconds: number): ThinkTime => ({
        moves,
        seconds,
        openingMoves: 10,
        openingSeconds: 10,
        bins: [0, 0, moves, 0, 0, 0, 0, 0],
    });
    const blitz = { timeControl: "180+2", site: "https://lichess.org" };
    const fallback = {
        minThinkTimeMs: 1000,
        averageThinkTimeMs: 3000,
        maxThinkTimeMs: 9000,
        repertoireTimePercent: 40,
    };

    it("adds the clocks of the games by rhythm", () => {
        const thinking = twinThinking([
            game({ result: "1-0", ...blitz, playerThink: think(30, 90) }),
            game({ result: "1-0", ...blitz, playerThink: think(30, 120) }),
            game({ result: "1-0", ...blitz, playerThink: null }),
        ]);
        expect(thinking.blitz).toMatchObject({ games: 2, moves: 60, seconds: 210 });
        expect(thinking.rapid).toBeUndefined();
    });

    it("reads percentiles inside the bins", () => {
        // Every move between 2 and 4 s.
        expect(binPercentile([0, 0, 10, 0, 0, 0, 0, 0], 0.5)).toBe(3);
        expect(binPercentile([0, 0, 0, 0, 0, 0, 0, 0], 0.5)).toBe(0);
    });

    it("uses the rhythm played, then the nearest one, then the rating's times", () => {
        const thinking = twinThinking([
            game({ result: "1-0", ...blitz, playerThink: think(100, 500) }),
        ]);
        const measured = twinTiming(thinking, "blitz", fallback);
        expect(measured.source).toEqual({ kind: "measured", rhythm: "blitz", moves: 100 });
        expect(measured.config).toMatchObject({ averageThinkTimeMs: 5000, fixedRhythm: true });
        expect(measured.config.repertoireTimePercent).toBe(20);
        const estimated = twinTiming(thinking, "rapid", fallback);
        expect(estimated.source?.kind).toBe("estimated");
        // Blitz times, rescaled by the game to its rhythm.
        expect(estimated.config).toMatchObject({ averageThinkTimeMs: 5000, fixedRhythm: false });
        const generic = twinTiming({}, "rapid", fallback);
        expect(generic.source).toBeNull();
        expect(generic.config).toEqual({ ...fallback, fixedRhythm: false });
    });
});

describe("twin (I-43)", () => {
    const lines = [
        { moves: ["e2e4", "e7e5", "g1f3"], games: 3 },
        { moves: ["e2e4", "c7c5", "g1f3"], games: 1 },
        { moves: ["d2d4", "d7d5"], games: 1 },
    ];

    it("chooses book moves with their real frequency after a prefix", () => {
        expect([...bookChoices(lines, [])]).toEqual([
            ["e2e4", 4],
            ["d2d4", 1],
        ]);
        expect(bookChoices(lines, ["e2e4", "c7c5"]).get("g1f3")).toBe(1);
        expect(bookChoices(lines, ["e2e4", "e7e6"]).size).toBe(0);
    });

    it("builds a weighted repertoire for the game", () => {
        const config = twinRepertoire(lines, "white", "card");
        expect(config.mode).toBe("weighted");
        expect(config.lines[0]).toEqual({
            moves: ["e2e4", "e7e5", "g1f3"],
            weight: 3,
            side: "white",
        });
    });

    it("measures the test games in the book and stops when they leave it", () => {
        const plan = fidelityPlan(lines, [{ moves: ["e2e4", "e7e6", "d2d4"], games: 1 }], "white");
        // 1.e4 is in the book (4 of 5); after 1...e6 the book is gone, so 2.d4 is out of it.
        expect(plan.inBook).toHaveLength(1);
        expect(plan.inBook[0].bookProbability).toBeCloseTo(0.8);
        expect(plan.inBook[0].bookTop).toBe(true);
        expect(plan.outOfBook).toBe(1);
    });

    it("keeps the most recent games for the test", () => {
        const { train, test } = splitForFidelity(Array.from({ length: 30 }, (_, index) => index));
        expect(test).toEqual([0, 1, 2, 3, 4, 5]);
        expect(train).toHaveLength(24);
    });
});

describe("own repertoire difficulty (I-33)", () => {
    it("collects the user's turns of the theory lines, the most shared first", () => {
        const openings = openingsWith(
            [{ moves: ["e2e4", "e7e5", "g1f3"] }, { moves: ["e2e4", "c7c5", "g1f3"] }],
            "white",
        );
        const positions = repertoirePositions(openings, "r1", "white");
        expect(positions[0].path).toEqual([]);
        expect(positions[0].prepared.map((move) => move.san)).toEqual(["e4"]);
        expect(positions[0].lines).toBe(2);
        expect(positions).toHaveLength(3);
    });
});

describe("preparation package", () => {
    it("writes the likely repertoire as a PGN with variations and comments", () => {
        const books = booksFromTrees([
            {
                databasePath: "a.db3",
                tree: tree(
                    treeFromLines([
                        { moves: ["e2e4", "e7e5"] },
                        { moves: ["e2e4", "e7e5"] },
                        { moves: ["e2e4", "c7c5"] },
                        { moves: ["e2e4", "c7c5"] },
                        { moves: ["e2e4", "c7c5"] },
                    ]),
                    [],
                ),
            },
        ]);
        const movetext = bookMovetext(books.white);
        expect(movetext).toMatch(/^1\. e4 \{5\/5/);
        expect(movetext).toContain("c5");
        expect(movetext).toContain("(1... e5");
        const pgn = preparationPackage({
            name: "Rival",
            books,
            summary: "Summary {with braces}",
            titles: { summary: "Summary", white: "White", black: "Black" },
            legend: "Legend",
            date: "2026.10.16",
        });
        expect(pgn).toContain('[Event "Rival: Summary"]');
        expect(pgn).toContain("{Summary with braces}");
        expect(pgn).not.toContain('[Event "Rival: Black"]');
    });
});
