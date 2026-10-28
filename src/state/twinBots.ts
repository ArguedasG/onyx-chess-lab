import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { PlayerStyleMeasurement } from "@/bindings";
import type { HumanBotOpeningRepertoireConfig } from "@/utils/humanBots";

/**
 * Books of the twin bots opened this session (I-43), by twin id. They can hold thousands of lines,
 * so they stay in memory instead of the persisted player settings; a twin chosen in an earlier
 * session is opened again from its player card.
 */
export const twinBooksAtom = atom<Record<string, HumanBotOpeningRepertoireConfig>>({});

/** A style measurement of a player (9.3): small, so it is kept between sessions. */
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
