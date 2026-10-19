import { describe, expect, it } from "vitest";
import type { BestMoves } from "@/bindings";
import { guidedMoment } from "./guidedPlay";

function line(multipv: number, uci: string, cp: number, mate = false): BestMoves {
    return {
        nodes: 0,
        depth: 14,
        score: {
            value: mate ? { type: "mate", value: cp } : { type: "cp", value: cp },
            wdl: null,
        },
        uciMoves: [uci],
        sanMoves: [],
        multipv,
        nps: 0,
    } as BestMoves;
}

describe("guided play", () => {
    it("calls a moment critical when only one move keeps the balance", () => {
        const moment = guidedMoment([line(1, "e2e4", 30), line(2, "d2d4", -200)], true);
        expect(moment).toEqual({ critical: true, best: "e2e4", gapCp: 230 });
    });

    it("reads the scores for Black when Black is to move", () => {
        // From White's point of view: the best for Black is -40, the second +150.
        const moment = guidedMoment([line(1, "e7e5", -40), line(2, "c7c5", 150)], false);
        expect(moment.critical).toBe(true);
        expect(moment.gapCp).toBe(190);
    });

    it("stays quiet when several moves are fine or the game is decided", () => {
        expect(guidedMoment([line(1, "a2a3", 20), line(2, "b2b3", 0)], true).critical).toBe(false);
        expect(guidedMoment([line(1, "a2a3", 900), line(2, "b2b3", 700)], true).critical).toBe(
            false,
        );
        expect(guidedMoment([line(1, "a2a3", 3, true), line(2, "b2b3", 800)], true).critical).toBe(
            false,
        );
        expect(guidedMoment([line(1, "a2a3", 0)], true)).toEqual({
            critical: false,
            best: "a2a3",
            gapCp: 0,
        });
    });

    it("warns when a single move saves a position that is otherwise lost", () => {
        expect(guidedMoment([line(1, "a2a3", -100), line(2, "b2b3", -900)], true).critical).toBe(
            true,
        );
    });
});
