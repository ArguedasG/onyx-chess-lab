import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import { playerAnalysisViewFamily } from "./playerAnalysis";

describe("Player Analysis view state", () => {
    it("keeps the selected section and scroll position while evidence is open", () => {
        const store = createStore();
        const viewAtom = playerAnalysisViewFamily("profile-1");

        store.set(viewAtom, (previous) => ({
            ...previous,
            section: "engine",
            scrollY: { ...previous.scrollY, engine: 684 },
        }));

        expect(store.get(playerAnalysisViewFamily("profile-1"))).toEqual({
            section: "engine",
            scrollY: { summary: 0, openings: 0, findings: 0, engine: 684 },
        });
        expect(store.get(playerAnalysisViewFamily("profile-2")).section).toBe("summary");
    });
});
