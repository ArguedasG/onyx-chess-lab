import { describe, expect, it } from "vitest";
import {
    applyCheck,
    engineLostBelow,
    engineVerdict,
    initialWatchState,
    outcomeFromTablebase,
    rewindWatch,
    tablebaseVerdict,
} from "./endgameVerdict";

const cp = (value: number) => ({ type: "cp", value }) as const;
const mate = (value: number) => ({ type: "mate", value }) as const;

describe("tablebase verdicts", () => {
    it("reads the category from the side to move", () => {
        // After the student's move the opponent is to move: their loss is the student's win.
        expect(outcomeFromTablebase("loss", "black", "white")).toBe("win");
        expect(outcomeFromTablebase("win", "black", "white")).toBe("loss");
        expect(outcomeFromTablebase("win", "white", "white")).toBe("win");
    });

    it("counts the 50-move rule and does not trust maybe categories", () => {
        expect(outcomeFromTablebase("blessed-loss", "black", "white")).toBe("draw");
        expect(outcomeFromTablebase("cursed-win", "black", "white")).toBe("draw");
        expect(outcomeFromTablebase("maybe-loss", "black", "white")).toBeNull();
    });

    it("judges only whether the objective survives", () => {
        expect(tablebaseVerdict("loss", "black", "white", "win").reachable).toBe(true);
        expect(tablebaseVerdict("draw", "black", "white", "win").reachable).toBe(false);
        expect(tablebaseVerdict("draw", "white", "black", "draw").reachable).toBe(true);
        expect(tablebaseVerdict("win", "white", "black", "draw").reachable).toBe(false);
        expect(tablebaseVerdict("win", "white", "black", "loss").reachable).toBe(true);
    });
});

describe("engine verdicts", () => {
    it("keeps a win that only got slower", () => {
        expect(engineVerdict(cp(700), "white", "win", null).reachable).toBe(true);
        expect(engineVerdict(mate(25), "white", "win", null).reachable).toBe(true);
    });

    it("uses the student's point of view", () => {
        expect(engineVerdict(cp(-500), "black", "win", null).reachable).toBe(true);
        expect(engineVerdict(cp(500), "black", "win", null).reachable).toBe(false);
        expect(engineVerdict(mate(-3), "white", "draw", null).reachable).toBe(false);
    });

    it("lowers the threshold when the start position is already unclear", () => {
        expect(engineLostBelow("win", cp(90))).toBe(-60);
        expect(engineLostBelow("win", cp(600))).toBe(70);
        expect(engineVerdict(cp(20), "white", "win", cp(90)).reachable).toBe(true);
    });
});

describe("objective watch", () => {
    const start = initialWatchState(0);
    const ok = (ply: number) => ({ ply, verdict: engineVerdict(cp(600), "white", "win", null) });
    const doubt = (ply: number) => ({ ply, verdict: engineVerdict(cp(30), "white", "win", null) });
    const clear = (ply: number) => ({
        ply,
        verdict: tablebaseVerdict("draw", "black", "white", "win"),
    });

    it("moves the retry point after every verified move", () => {
        const state = applyCheck(applyCheck(start, ok(1), "win", null), ok(3), "win", null);
        expect(state.retryPly).toBe(4);
        expect(state.lostAtPly).toBeNull();
    });

    it("needs two doubtful engine readings, but one exact one", () => {
        const once = applyCheck(applyCheck(start, ok(1), "win", null), doubt(3), "win", null);
        expect(once.lostAtPly).toBeNull();
        const twice = applyCheck(once, doubt(5), "win", null);
        expect(twice.lostAtPly).toBe(3);
        expect(twice.retryPly).toBe(2);

        expect(applyCheck(start, clear(1), "win", null).lostAtPly).toBe(1);
    });

    it("ignores late answers and forgets the moves taken back", () => {
        const lost = applyCheck(applyCheck(start, ok(1), "win", null), clear(3), "win", null);
        expect(applyCheck(lost, ok(1), "win", null)).toBe(lost);
        const rewound = rewindWatch(lost, 2);
        expect(rewound.lostAtPly).toBeNull();
        expect(rewound.retryPly).toBe(2);
    });

    it("clears the warning when the objective becomes reachable again", () => {
        const lost = applyCheck(start, clear(1), "win", null);
        expect(applyCheck(lost, ok(3), "win", null).lostAtPly).toBeNull();
    });
});
