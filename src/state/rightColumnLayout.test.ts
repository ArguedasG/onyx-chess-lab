import { describe, expect, it } from "vitest";
import {
    DEFAULT_RIGHT_COLUMN_LAYOUTS,
    resolveRightColumnLayout,
    rightColumnLayoutKey,
    swapZones,
    toggleZoneCollapsed,
    toggleZoneMaximized,
    type RightColumnLayout,
} from "./rightColumnLayout";

const base: RightColumnLayout = { first: "notation", collapsed: null, split: 40 };

describe("right column layout", () => {
    it("folds and unfolds a zone with the chevron", () => {
        const folded = toggleZoneCollapsed(base, "tools");
        expect(folded.collapsed).toBe("tools");
        expect(toggleZoneCollapsed(folded, "tools").collapsed).toBeNull();
        // Folding the other zone moves the fold instead of hiding both.
        expect(toggleZoneCollapsed(folded, "notation").collapsed).toBe("notation");
    });

    it("maximizes by folding the other zone and restores on the second press", () => {
        const maximized = toggleZoneMaximized(base, "notation");
        expect(maximized.collapsed).toBe("tools");
        expect(toggleZoneMaximized(maximized, "notation").collapsed).toBeNull();
    });

    it("swaps zones keeping each zone's height", () => {
        expect(swapZones(base)).toEqual({ first: "tools", collapsed: null, split: 60 });
    });

    it("picks a layout per screen, with repertoires separate from analysis", () => {
        expect(rightColumnLayoutKey("analysis", false)).toBe("analysis");
        expect(rightColumnLayoutKey("analysis", true)).toBe("repertoire");
        expect(rightColumnLayoutKey("puzzles", false)).toBe("puzzles");
        expect(DEFAULT_RIGHT_COLUMN_LAYOUTS.analysis.first).toBe("notation");
        expect(DEFAULT_RIGHT_COLUMN_LAYOUTS.puzzles.first).toBe("tools");
    });

    it("repairs stored values", () => {
        expect(
            resolveRightColumnLayout("analysis", {
                first: "sideways" as never,
                collapsed: "nope" as never,
                split: 120,
            }),
        ).toEqual({ first: "notation", collapsed: null, split: 85 });
        expect(resolveRightColumnLayout("play", undefined)).toEqual(
            DEFAULT_RIGHT_COLUMN_LAYOUTS.play,
        );
    });
});
