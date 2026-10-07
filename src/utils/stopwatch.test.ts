import { describe, expect, it } from "vitest";
import { Stopwatch } from "./stopwatch";

describe("Stopwatch", () => {
    it("excludes paused time and keeps the counted time", () => {
        const clock = new Stopwatch(500, true, 1000);
        expect(clock.elapsed(1600)).toBe(1100);
        clock.pause(1600);
        expect(clock.running).toBe(false);
        expect(clock.elapsed(9000)).toBe(1100);
        clock.resume(9000);
        expect(clock.elapsed(9400)).toBe(1500);
    });

    it("ignores repeated pauses and resumes", () => {
        const clock = new Stopwatch(0, true, 0);
        clock.resume(50);
        expect(clock.elapsed(100)).toBe(100);
        clock.pause(100);
        clock.pause(400);
        expect(clock.elapsed(400)).toBe(100);
    });

    it("resets to a stopped or running state", () => {
        const clock = new Stopwatch(0, true, 0);
        clock.reset(2000, false, 100);
        expect(clock.elapsed(5000)).toBe(2000);
        clock.reset(0, true, 5000);
        expect(clock.elapsed(5250)).toBe(250);
    });
});
