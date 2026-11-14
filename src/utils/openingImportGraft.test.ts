import { afterEach, describe, expect, it, vi } from "vitest";
import { Chess } from "chessops/chess";
import { makeFen, parseFen } from "chessops/fen";
import { parseSan } from "chessops/san";

vi.mock("i18next", () => ({
    default: {
        t: (_key: string, fallback: string, values: Record<string, unknown> = {}) =>
            fallback.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(values[name])),
    },
}));
import { commands, type Token } from "@/bindings";
import { attachSectionFens, graftTree, positionKey } from "./openingImportGraft";
import {
    getOpeningImportGroupPreviews,
    inspectOpeningPgn,
    type OpeningPgnSample,
    prepareOpeningImport,
} from "./openingTraining";
import { createNode, defaultTree, type TreeNode } from "./treeReducer";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** The FEN after some moves, with the "0 1" counters course exports usually write. */
function fenAfter(sans: string[]): string {
    const position = Chess.default();
    for (const san of sans) position.play(parseSan(position, san)!);
    return makeFen(position.toSetup()).replace(/ \d+ \d+$/, " 0 1");
}

function treeFrom(fen: string, sans: string[]): TreeNode {
    const root = defaultTree(fen).root;
    const position = Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
    let node = root;
    for (const san of sans) {
        const move = parseSan(position, san);
        if (!move) throw new Error(`Invalid test move: ${san}`);
        position.play(move);
        const child = createNode({
            fen: makeFen(position.toSetup()),
            move,
            san,
            halfMoves: node.halfMoves + 1,
        });
        node.children.push(child);
        node = child;
    }
    return root;
}

function mainLine(node: TreeNode): string[] {
    const sans: string[] = [];
    for (let current = node.children[0]; current; current = current.children[0])
        sans.push(current.san!);
    return sans;
}

describe("grafting course records that start from a position", () => {
    const french = ["e4", "e6", "d4", "d5", "Nc3", "dxe4"];

    it("recognizes a position whatever its move counters", () => {
        let reached = treeFrom(START, french);
        while (reached.children[0]) reached = reached.children[0];
        expect(reached.fen).not.toBe(fenAfter(french));
        expect(positionKey(reached.fen)).toBe(positionKey(fenAfter(french)));
        expect(positionKey(fenAfter(["e4"]))).toBe(
            "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -",
        );
    });

    it("attaches a record to the tree whose moves reach its start", () => {
        const fen = fenAfter(french);
        const sections = attachSectionFens([
            treeFrom(START, [...french, "Nxe4"]),
            treeFrom(fen, ["Nxe4", "Bd7"]),
            treeFrom(fenAfter(["d4", "Nf6"]), ["c4"]),
        ]);
        expect(sections[0]).toBe(START);
        expect(sections[1]).toBe(START);
        // Nobody reaches it: it keeps its own start.
        expect(positionKey(sections[2])).toBe(positionKey(fenAfter(["d4", "Nf6"])));
    });

    it("grafts at the position, numbering the moves from there", () => {
        const target = treeFrom(START, [...french, "Nxe4"]);
        const source = treeFrom(fenAfter([...french, "Nxe4"]), ["Bd7"]);
        const path = graftTree(target, source, [], (node, right) => {
            node.children.push(...right.children);
        });

        expect(path).toHaveLength(7);
        expect(mainLine(target)).toEqual([...french, "Nxe4", "Bd7"]);
        let node = target;
        for (let i = 0; i < 8; i++) node = node.children[0];
        expect(node.halfMoves).toBe(8);
    });

    it("bridges through another record when the section does not reach the position yet", () => {
        const target = defaultTree(START).root;
        const source = treeFrom(fenAfter(french), ["Nxe4"]);
        const path = graftTree(target, source, [treeFrom(START, french)], (node, right) => {
            node.children.push(...right.children);
        });

        expect(path).toHaveLength(6);
        expect(mainLine(target)).toEqual([...french, "Nxe4"]);
        expect(target.children[0].comment).toBe("");
    });
});

describe("course chapters with records that start further on", () => {
    const base = (index: number, extra: Partial<OpeningPgnSample>): OpeningPgnSample => ({
        index,
        name: `Record ${index}`,
        startingFen: START,
        lineCount: 1,
        commentCount: 0,
        hasVariations: false,
        contentType: "theory",
        eventName: "The French",
        ...extra,
    });
    const theory = "A1) 3.Nc3/Nd2 - Fort Knox - Theory";
    const plans = "A2) 3.Nc3/Nd2 - Fort Knox - Typical Plans";
    const later = fenAfter(["e4", "e6", "d4", "d5", "Nc3", "dxe4"]);
    const samples = [
        base(0, { whiteName: theory, blackName: "3.Nc3/Nd2 - 5.Bc4 #1" }),
        base(1, { whiteName: theory, blackName: "3.Nc3/Nd2 - 5.Bc4 #2" }),
        base(2, {
            whiteName: theory,
            blackName: "3.Nc3/Nd2 - 5.Bd3",
            startingFen: later,
            sectionFen: START,
        }),
        base(3, {
            whiteName: plans,
            blackName: "Trading Pieces #1",
            startingFen: later,
            sectionFen: START,
        }),
        base(4, {
            whiteName: plans,
            blackName: "Trading Pieces #2",
            startingFen: later,
            sectionFen: START,
        }),
        base(5, { whiteName: plans, blackName: "Typical Plans" }),
    ];

    it("keep a theory chapter in one section and a plans chapter informative", () => {
        const groups = getOpeningImportGroupPreviews({ filename: "french.pgn", samples }, "smart");
        expect(groups.map((group) => [group.name, group.contentType, group.recordIndexes])).toEqual(
            [
                [theory, "theory", [0, 1, 2]],
                [plans, "reference", [3, 4, 5]],
            ],
        );
    });

    it("combine every theory record in one section when asked, plans still apart", () => {
        const groups = getOpeningImportGroupPreviews({ filename: "french.pgn", samples }, "single");
        expect(groups.map((group) => [group.contentType, group.recordIndexes])).toEqual([
            ["theory", [0, 1, 2]],
            ["reference", [3, 4, 5]],
        ]);
    });
});

describe("importing a course whose line titles start with a move number", () => {
    afterEach(() => vi.restoreAllMocks());

    const header = (tag: string, value: string): Token => ({
        type: "Header",
        value: { tag, value },
    });
    const sans = (moves: string[]): Token[] => moves.map((value) => ({ type: "San", value }));
    const chapter = "A1) 3.Nc3/Nd2 - Fort Knox - Theory";
    const records: Record<string, Token[]> = {
        r0: [
            header("White", chapter),
            header("Black", "3.Nc3/Nd2 - 5.Bc4 #1"),
            ...sans(["e4", "e6", "d4", "d5", "Nc3", "dxe4", "Nxe4", "Bd7"]),
        ],
        r1: [
            header("White", chapter),
            header("Black", "3.Nc3/Nd2 - 5.Bc4 #2"),
            ...sans(["e4", "e6", "d4", "d5", "Nd2", "dxe4", "Nxe4", "Bd7"]),
        ],
        r2: [
            header("White", chapter),
            header("Black", "3.Nc3/Nd2 - 6.Bd3"),
            header("SetUp", "1"),
            header("FEN", fenAfter(["e4", "e6", "d4", "d5", "Nc3", "dxe4", "Nxe4", "Bd7"])),
            ...sans(["Nf3", "Bc6", "Bd3"]),
        ],
    };

    it("puts the chapter in one section, the later record grafted into its line", async () => {
        vi.spyOn(commands, "countPgnGames").mockResolvedValue({ status: "ok", data: 3 });
        vi.spyOn(commands, "readGames").mockResolvedValue({
            status: "ok",
            data: ["r0", "r1", "r2"],
        });
        vi.spyOn(commands, "lexPgn").mockImplementation(async (raw) => ({
            status: "ok",
            data: [...records[raw], { type: "Outcome", value: "*" }],
        }));
        const config = {
            color: "black",
            subvariationPolicy: "all",
            groupingMode: "smart",
        } as const;
        const inspection = await inspectOpeningPgn("french.pgn", config);
        const prepared = await prepareOpeningImport(inspection, config);

        expect(prepared.variants.map((variant) => variant.name)).toEqual([chapter]);
        const lines = prepared.variants[0].lines.map((line) => line.moves.join(" "));
        expect(lines).toContain("e2e4 e7e6 d2d4 d7d5 b1c3 d5e4 c3e4 c8d7 g1f3 d7c6 f1d3");
        expect(
            prepared.variants[0].lines.every((line) => line.path.length === line.moves.length),
        ).toBe(true);
        expect(prepared.trainingPgn).not.toContain("[SetUp");
    });
});
