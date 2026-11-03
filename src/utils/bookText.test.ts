import { describe, expect, it } from "vitest";
import { moveContext, type TextRun } from "./bookText";

// A diagram from x 100 to 300 and y 400 to 600 (PDF units, y up): squares of 25.
const BOX: [number, number, number, number] = [100, 400, 300, 600];
const run = (str: string, y: number, x = 100): TextRun => ({
    str,
    x,
    y,
    width: 8 * str.length,
    height: 10,
});

describe("moveContext", () => {
    it("reads Black's next move below the diagram", () => {
        expect(moveContext([run("15...Qxd2+?", 385)], BOX)).toEqual({
            turn: "b",
            fullmove: 15,
            evidence: "15...Qxd2+?",
        });
    });

    it("reads White's next move below the diagram, castling included", () => {
        expect(moveContext([run("8.0-0", 385)], BOX)).toMatchObject({ turn: "w", fullmove: 8 });
    });

    it("accepts the spaced and single-character ellipsis of text layers", () => {
        expect(moveContext([run("1 ... e5 2.Nf3", 385)], BOX)).toMatchObject({
            turn: "b",
            fullmove: 1,
        });
        expect(moveContext([run("23…Rxe4", 385)], BOX)).toMatchObject({ turn: "b", fullmove: 23 });
    });

    it("prefers a stated side to move", () => {
        expect(moveContext([run("Juegan las negras", 385), run("12.Qd2", 370)], BOX)).toMatchObject(
            {
                turn: "b",
                fullmove: null,
            },
        );
        expect(moveContext([run("White to play", 385)], BOX)).toMatchObject({ turn: "w" });
    });

    it("falls back to the last move printed above the diagram", () => {
        expect(moveContext([run("7.Nge2 c6", 615)], BOX)).toMatchObject({ turn: "w", fullmove: 8 });
        expect(moveContext([run("9.Bd3", 615)], BOX)).toMatchObject({ turn: "b", fullmove: 9 });
        expect(moveContext([run("11...Re8", 615)], BOX)).toMatchObject({ turn: "w", fullmove: 12 });
    });

    it("ignores text of another column and far away", () => {
        expect(moveContext([run("15...Qxd2", 385, 400)], BOX).turn).toBeNull();
        expect(moveContext([run("15...Qxd2", 100)], BOX).turn).toBeNull();
    });

    it("does not read decimals or page numbers as moves", () => {
        expect(
            moveContext([run("Posición 120", 385), run("2,5 puntos", 375)], BOX).turn,
        ).toBeNull();
    });

    it("joins runs of the same line", () => {
        expect(
            moveContext([run("15", 385, 100), run("...", 385, 118), run("Qxd2", 385, 140)], BOX),
        ).toMatchObject({
            turn: "b",
            fullmove: 15,
        });
    });

    it("joins digits split by OCR", () => {
        expect(moveContext([run("1 1 . Te1 a5", 385)], BOX)).toMatchObject({
            turn: "w",
            fullmove: 11,
        });
    });

    it("follows a diagram reference in another column", () => {
        const left = (str: string, y: number): TextRun => ({
            str,
            x: 37,
            y,
            width: 60,
            height: 10,
        });
        expect(
            moveContext(
                [
                    left("8.c4 e5 9.Bh2", 80),
                    left("Diagram 11-7", 68),
                    left("9", 55),
                    left("...", 55),
                    left("Ne4!", 55),
                ],
                BOX,
            ),
        ).toMatchObject({ turn: "b", fullmove: 9 });
    });
});
