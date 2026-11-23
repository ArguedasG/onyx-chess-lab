import { parseSan } from "chessops/san";
import { describe, expect, it } from "vitest";
import { uciNormalize } from "./chess";
import { positionFromFen } from "./chessops";
import { parseUci } from "chessops";
import { playUci } from "./repertoireGenerator/positions";
import {
    courseThemeTitle,
    extractTacticsComments,
    pgnRecordHasMoves,
    pgnRecordIndex,
    planTacticsCourseFiles,
    solutionLinesWith,
    visibleTacticsComments,
} from "./tacticsTraining";
import { createNode, defaultTree, type TreeNode } from "./treeReducer";

const FEN = "r3k2r/pppq1ppp/2n1bn2/3pp3/3PP3/2N1BN2/PPPQ1PPP/R3K2R w KQkq - 0 1";

/** A solution line stored as PGN records store it: SAN parsed and normalized. */
function storedLine(fen: string, sans: string[]): string[] {
    const [position] = positionFromFen(fen);
    if (!position) throw new Error("bad fen");
    return sans.map((san) => {
        const move = parseSan(position, san)!;
        const uci = uciNormalize(position.clone(), move);
        position.play(move);
        return uci;
    });
}

describe("solutionLinesWith", () => {
    it("accepts long castling as the king's step or dropped on the rook", () => {
        const lines = [storedLine(FEN, ["O-O-O", "O-O"])];
        expect(lines[0][0]).toBe("e1a1");
        expect(solutionLinesWith(FEN, lines, 0, "e1c1")).toEqual(lines);
        expect(solutionLinesWith(FEN, lines, 0, "e1a1")).toEqual(lines);
        expect(solutionLinesWith(FEN, lines, 0, "e1g1")).toEqual([]);
    });

    it("accepts short castling later in the line", () => {
        const lines = [storedLine(FEN, ["O-O-O", "O-O"])];
        expect(solutionLinesWith(FEN, lines, 1, "e8g8")).toEqual(lines);
        expect(solutionLinesWith(FEN, lines, 1, "e8c8")).toEqual([]);
    });

    it("keeps ordinary moves and branches as before", () => {
        const lines = [storedLine(FEN, ["Nb5", "a6"]), storedLine(FEN, ["a3", "Nb4"])];
        expect(solutionLinesWith(FEN, lines, 0, "c3b5")).toEqual([lines[0]]);
        expect(solutionLinesWith(FEN, lines, 0, "a2a3")).toEqual([lines[1]]);
        expect(solutionLinesWith(FEN, lines, 0, "h2h3")).toEqual([]);
    });
});

describe("course folders", () => {
    const file = (filename: string, recordCount = 10) => ({
        path: `I:/course/${filename}`,
        filename,
        recordCount,
    });

    it("names themes without extension or leading number", () => {
        expect(courseThemeTitle("01. Double Attack.pgn")).toBe("Double Attack");
        expect(courseThemeTitle("10_Magnet.pgn")).toBe("Magnet");
        expect(courseThemeTitle("Bain - Chess Tactics for Students.pgn")).toBe(
            "Bain - Chess Tactics for Students",
        );
        expect(courseThemeTitle("2024.pgn")).toBe("2024");
    });

    it("orders files by number and leaves unnumbered and empty ones unchecked", () => {
        const plan = planTacticsCourseFiles([
            file("Beginner s Guide To Chess Tactics.pgn", 900),
            file("10. Magnet.pgn"),
            file("02. Pin.pgn"),
            file("01. Double Attack.pgn"),
            file("03. Skewer.pgn", 0),
        ]);
        expect(plan.map((entry) => entry.filename)).toEqual([
            "01. Double Attack.pgn",
            "02. Pin.pgn",
            "03. Skewer.pgn",
            "10. Magnet.pgn",
            "Beginner s Guide To Chess Tactics.pgn",
        ]);
        expect(plan.map((entry) => entry.suggested)).toEqual([true, true, false, true, false]);
    });

    it("suggests every file when none is numbered", () => {
        const plan = planTacticsCourseFiles([file("Pins.pgn"), file("Forks.pgn")]);
        expect(plan.every((entry) => entry.suggested)).toBe(true);
    });
});

describe("records without moves", () => {
    const intro = `[Event "?"]
[White "How to Train with this Course"]
[Black "How to Train with this Course"]
[Result "*"]

{ How to Train with this Course. Week 1: 1 move ahead (10 exercises). [%cal Ge2e4] } *`;
    const puzzle = `[Event "?"]
[FEN "3r2k1/p3b1pp/bp2pp2/8/P2P4/2RNPPP1/1B5P/6K1 b - - 0 1"]
[SetUp "1"]

{ Visualise the moves 1... Rc8 2. Kf2, then find the best continuation. } 1...
Rc8 2. Kf2 Rxc3 3. Bxc3 Bxd3 { CORRECT! Well done. } *`;

    it("tells exercises from records that only hold text", () => {
        expect(pgnRecordHasMoves(intro)).toBe(false);
        expect(pgnRecordHasMoves(puzzle)).toBe(true);
        expect(pgnRecordHasMoves('[Event "x"]\n\n1. e4 *')).toBe(true);
        expect(pgnRecordHasMoves('[Event "x"]\n\n1. O-O-O *')).toBe(true);
        expect(pgnRecordHasMoves('[Event "x"]\n\n{ only a comment with e4 } (1. d4) 1-0')).toBe(
            false,
        );
    });

    it("maps exercises to the records of the file around the skipped ones", () => {
        expect(pgnRecordIndex(0)).toBe(0);
        expect(pgnRecordIndex(5, [])).toBe(5);
        expect(pgnRecordIndex(0, [0])).toBe(1);
        expect(pgnRecordIndex(3, [0])).toBe(4);
        expect(pgnRecordIndex(2, [0, 3, 10])).toBe(4);
        expect(pgnRecordIndex(3, [0, 3, 10])).toBe(5);
        expect(pgnRecordIndex(8, [0, 3, 10])).toBe(11);
    });
});

describe("PGN comments in tactics", () => {
    const fen = "3r2k1/p3b1pp/bp2pp2/8/P2P4/2RNPPP1/1B5P/6K1 b - - 0 1";

    /** A tree with one line from `fen`, each move with the given comment. */
    function lineTree(moves: Array<[string, string]>, start = ""): TreeNode {
        const tree = defaultTree(fen);
        tree.root.comment = start;
        let node = tree.root;
        for (const [uci, comment] of moves) {
            const played = playUci(node.fen, uci)!;
            const child = createNode({
                move: parseUci(uci)!,
                san: played.san,
                fen: played.fen,
                halfMoves: node.halfMoves + 1,
            });
            child.comment = comment;
            node.children.push(child);
            node = child;
        }
        return tree.root;
    }

    const line = ["d8c8", "g1f2", "c8c3", "b2c3", "a6d3"];
    const root = lineTree(
        [
            ["d8c8", ""],
            ["g1f2", ""],
            ["c8c3", "The key capture. [%csl Rc3]"],
            ["b2c3", ""],
            ["a6d3", "CORRECT! Well done."],
        ],
        "Visualise the moves 1... Rc8 2. Kf2, then find the best continuation.",
    );

    it("reads the opening comment and each move's comment without embedded commands", () => {
        const comments = extractTacticsComments(root);
        expect(comments.start).toBe(
            "Visualise the moves 1... Rc8 2. Kf2, then find the best continuation.",
        );
        expect(comments.moves).toEqual({
            "d8c8 g1f2 c8c3": "The key capture.",
            "d8c8 g1f2 c8c3 b2c3 a6d3": "CORRECT! Well done.",
        });
    });

    it("shows only the comments of moves already played until the exercise is over", () => {
        const comments = extractTacticsComments(root);
        expect(visibleTacticsComments(comments, [], [line], false)).toEqual([comments.start]);
        expect(visibleTacticsComments(comments, line.slice(0, 2), [line], false)).toEqual([
            comments.start,
        ]);
        expect(visibleTacticsComments(comments, line.slice(0, 3), [line], false)).toEqual([
            comments.start,
            "The key capture.",
        ]);
        expect(visibleTacticsComments(comments, line.slice(0, 1), [line], true)).toEqual([
            comments.start,
            "The key capture.",
            "CORRECT! Well done.",
        ]);
    });
});
