import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import {
    playerAnalysisProfileId,
    playerAnalysisReturnTargetAtom,
    playerAnalysisViewFamily,
} from "./playerAnalysis";

describe("Player Analysis view state", () => {
    it("uses a stable and distinct identity for each player profile", () => {
        const firstSources = [
            { databasePath: "one.db3", playerId: 1 },
            { databasePath: "two.db3", playerId: 2 },
        ];
        expect(playerAnalysisProfileId("First", firstSources)).toBe(
            playerAnalysisProfileId("First", [...firstSources].reverse()),
        );
        expect(playerAnalysisProfileId("First", firstSources)).not.toBe(
            playerAnalysisProfileId("Second", firstSources),
        );
    });

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

    it("keeps the exact profile target while an evidence tab is open", () => {
        const store = createStore();
        const target = { profileId: "profile-2", playerName: "Second" };
        store.set(playerAnalysisReturnTargetAtom, target);
        expect(store.get(playerAnalysisReturnTargetAtom)).toEqual(target);
    });
});
