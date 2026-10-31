import { atomWithStorage } from "jotai/utils";
import type { PlayerStyleMeasurement } from "@/bindings";

/**
 * A style measurement of a player (9.3), from before saved twins: it now only seeds the general
 * profile of the first twin built for the card (`TwinSection`).
 */
export type TwinStyleRecord = {
    measuredAt: string;
    /** Maia's rating it was measured at and the games it used. */
    elo: number;
    games: number;
    measurement: PlayerStyleMeasurement;
};

/** Style measurements by player card. */
export const twinStylesAtom = atomWithStorage<Record<string, TwinStyleRecord>>(
    "twin-styles-v1",
    {},
);
