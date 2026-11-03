import { atom } from "jotai";

/**
 * Doubtful squares of the last position read from an image (phase 9.4, I-57): square → piece
 * letter the model read (`null` for empty). The board marks them while the editor is open and
 * the square still holds what was read; correcting a square removes its mark.
 */
export const diagramDoubtsAtom = atom<Record<string, string | null> | null>(null);
