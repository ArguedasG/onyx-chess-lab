import { describe, expect, it } from "vitest";
import {
    cancelPlayerEngineRun,
    finishPlayerEngineRun,
    startPlayerEngineRun,
} from "./playerEngineRuns";

describe("player engine runs", () => {
    it("allow one run per profile until it finishes", () => {
        const run = startPlayerEngineRun("profile-a")!;
        expect(run).not.toBeNull();
        expect(startPlayerEngineRun("profile-a")).toBeNull();
        expect(startPlayerEngineRun("profile-b")).not.toBeNull();

        finishPlayerEngineRun("profile-a", run);
        expect(startPlayerEngineRun("profile-a")).not.toBeNull();
    });

    it("cancel a run from anywhere and return the analyses in progress", () => {
        const run = startPlayerEngineRun("profile-c")!;
        run.analysisIds.add("player-analysis-profile-c-1");

        expect(cancelPlayerEngineRun("profile-c")).toEqual(["player-analysis-profile-c-1"]);
        expect(run.cancelled).toBe(true);
        expect(cancelPlayerEngineRun("profile-unknown")).toEqual([]);
    });
});
