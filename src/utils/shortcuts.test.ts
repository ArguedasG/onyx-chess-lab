import { describe, expect, it } from "vitest";
import { hintReady } from "@/state/hints";
import { shortcutKeys } from "./shortcuts";

describe("shortcut names", () => {
    it("names the keys of each shortcut", () => {
        expect(shortcutKeys("shift+arrowright")).toEqual([["Shift", "→"]]);
        expect(shortcutKeys("c")).toEqual([["C"]]);
        expect(shortcutKeys("ctrl+s, meta+s")).toEqual([
            ["Ctrl", "S"],
            ["Ctrl", "S"],
        ]);
        expect(shortcutKeys("shift+down")).toEqual([["Shift", "↓"]]);
        expect(shortcutKeys("meta+t", true)).toEqual([["⌘", "T"]]);
    });
});

describe("first-time hints", () => {
    it("come one at a time, in order", () => {
        expect(hintReady([], "board-controls")).toBe(true);
        expect(hintReady([], "variations")).toBe(false);
        expect(hintReady(["board-controls"], "variations")).toBe(true);
        expect(hintReady(["board-controls", "variations"], "variations")).toBe(false);
    });
});
