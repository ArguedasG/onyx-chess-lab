import { atomWithStorage } from "jotai/utils";
import type {
    GeneratorFocus,
    OpponentConfig,
    StatsSourceConfig,
} from "@/utils/repertoireGenerator/types";

/** The last settings of the generator and the surprise finder, so a second run starts from them. */
export type RepertoireGeneratorSettings = {
    focus: GeneratorFocus;
    source: StatsSourceConfig;
    opponent: OpponentConfig;
    depth: number;
    minGames: number;
    maxLoss: number;
    surpriseShare: number;
    engineId: string | null;
    engineMs: number;
    maxPositions: number;
    surprises: {
        mySideOnly: boolean;
        firstMove: number;
        stopGames: number;
        maxShare: number;
        maxLoss: number;
    };
};

export const DEFAULT_GENERATOR_SETTINGS: RepertoireGeneratorSettings = {
    focus: "practical",
    source: {
        kind: "lichess",
        ratings: [1600, 1800, 2000],
        speeds: ["blitz", "rapid", "classical"],
    },
    opponent: { mode: "popular", maxReplies: 3, minShare: 10, elo: 1600 },
    depth: 12,
    minGames: 30,
    maxLoss: 30,
    surpriseShare: 5,
    engineId: null,
    engineMs: 300,
    maxPositions: 120,
    // Matthew Sadler's defaults: from move 4, until fewer than 40 games, at most 5 %.
    surprises: { mySideOnly: true, firstMove: 4, stopGames: 40, maxShare: 5, maxLoss: 25 },
};

export const repertoireGeneratorSettingsAtom = atomWithStorage<RepertoireGeneratorSettings>(
    "repertoire-generator-v1",
    DEFAULT_GENERATOR_SETTINGS,
);

/**
 * Settings of the generator against a rival (8.6, I-41): their games are few, so a move counts
 * from two games and the surprise finder stops when the rival has fewer than two.
 */
export const DEFAULT_RIVAL_GENERATOR_SETTINGS: RepertoireGeneratorSettings = {
    ...DEFAULT_GENERATOR_SETTINGS,
    focus: "practical",
    minGames: 2,
    opponent: { mode: "popular", maxReplies: 3, minShare: 15, elo: 1600 },
    maxPositions: 100,
    surprises: { mySideOnly: true, firstMove: 3, stopGames: 2, maxShare: 5, maxLoss: 25 },
};

export const repertoireGeneratorRivalSettingsAtom = atomWithStorage<RepertoireGeneratorSettings>(
    "repertoire-generator-rival-v1",
    DEFAULT_RIVAL_GENERATOR_SETTINGS,
);
