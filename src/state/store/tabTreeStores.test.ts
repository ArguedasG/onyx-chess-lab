import { afterEach, describe, expect, it } from "vitest";
import { defaultTree, type TreeState } from "@/utils/treeReducer";
import { getLatestSessionStorageValue } from "./debouncedStorage";
import { registerMountedTreeStore, updateTabTreeStore } from "./tabTreeStores";
import { createTreeStore } from "./tree";

describe("updateTabTreeStore", () => {
    afterEach(() => sessionStorage.clear());

    it("updates the live store while the tab is mounted", () => {
        const store = createTreeStore("mounted-tab");
        const unregister = registerMountedTreeStore("mounted-tab", store);
        store.getState().setReportInProgress(true);

        expect(
            updateTabTreeStore("mounted-tab", (s) => s.getState().setReportInProgress(false)),
        ).toBe(true);
        expect(store.getState().report.inProgress).toBe(false);
        unregister();
    });

    it("updates the persisted state of a tab that is not on screen", () => {
        const tree = { ...defaultTree(), report: { inProgress: true } };
        sessionStorage.setItem("hidden-tab", JSON.stringify({ version: 0, state: tree }));

        expect(
            updateTabTreeStore("hidden-tab", (s) => s.getState().setReportInProgress(false)),
        ).toBe(true);
        const stored = getLatestSessionStorageValue<TreeState>("hidden-tab");
        expect(stored?.state.report.inProgress).toBe(false);
        // A remounted tab hydrates the update.
        expect(createTreeStore("hidden-tab").getState().report.inProgress).toBe(false);
    });

    it("ignores tabs that were closed", () => {
        expect(updateTabTreeStore("closed-tab", () => undefined)).toBe(false);
        expect(sessionStorage.getItem("closed-tab")).toBeNull();
    });
});
