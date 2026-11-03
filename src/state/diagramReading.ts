import { atom } from "jotai";
import type { TreeStore } from "@/state/store/tree";

/**
 * Doubtful squares of the last position read from an image (phase 9.4, I-57): square → piece
 * letter the model read (`null` for empty). The board marks them while the editor is open and
 * the square still holds what was read; correcting a square removes its mark.
 */
export const diagramDoubtsAtom = atom<Record<string, string | null> | null>(null);

/**
 * Set by the Books reader when a reading needs review: the analysis board with that tree store
 * (the book's tab) opens its position editor so the doubtful squares (marked in red) can be fixed.
 */
export const diagramEditRequestAtom = atom<{
    store: TreeStore;
    count: number;
    /** Open (to fix doubtful squares) or close (the position is ready to play) the editor. */
    open: boolean;
} | null>(null);
