import { parseSan } from "chessops/san";
import { describe, expect, it } from "vitest";
import { uciNormalize } from "./chess";
import { positionFromFen } from "./chessops";
import { courseThemeTitle, planTacticsCourseFiles, solutionLinesWith } from "./tacticsTraining";

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
