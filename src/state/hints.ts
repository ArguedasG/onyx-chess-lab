import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

/** First-time hints of the interface; each one is shown until the user dismisses it. */
export type HintId = "board-controls" | "variations";

/** The order hints are shown in: one at a time, a later one only after the earlier ones. */
export const HINT_ORDER: readonly HintId[] = ["board-controls", "variations"];

export const seenHintsAtom = atomWithStorage<HintId[]>("seen-hints", [], undefined, {
    getOnInit: true,
});

/** Marks a hint as seen. */
export const dismissHintAtom = atom(null, (get, set, id: HintId) => {
    const seen = get(seenHintsAtom);
    if (!seen.includes(id)) set(seenHintsAtom, [...seen, id]);
});

/** Whether a hint may show now: not seen yet, and every earlier hint already seen. */
export function hintReady(seen: readonly HintId[], id: HintId): boolean {
    if (seen.includes(id)) return false;
    return HINT_ORDER.slice(0, HINT_ORDER.indexOf(id)).every((earlier) => seen.includes(earlier));
}
