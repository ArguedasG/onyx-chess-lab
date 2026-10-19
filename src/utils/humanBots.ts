import type { BotPlayConfig } from "@/bindings";
import {
    BOT_CATALOG_SPECS,
    type BotCatalogSpec,
    type BotOpeningStyleId,
    type BotPlayStyleId,
} from "./botCatalogSpecs";
import { generatedPlayerSpec, parseGeneratedPlayerId } from "./botGeneratedPlayers";
import { type BotOpeningFamilyId, botFamilyLines } from "./botOpenings";
import type { EngineSettings, LocalEngine } from "./engines";
import { RANDOM_SEED_PLACEHOLDER } from "./engines";

export const HUMAN_BOT_CONFIG_VERSION = 6;
export const HUMAN_BOT_CATALOG_VERSION = "9.1.0";
export const HUMAN_BOT_PROFILE_VERSION = 3;
export const HUMAN_BOT_REPERTOIRE_SCHEMA_VERSION = 2;
export const HUMAN_BOT_MODEL_ID = "maia3";

export type HumanBotStyle = "adventurous" | "balanced" | "focused";
export type HumanBotStyleAxisLevel = "low" | "medium" | "high";
export type HumanBotOpeningLineSide = "white" | "black" | "both";
export type HumanBotRepertoireMode = "weighted" | "forcedLine" | "none";

export type HumanBotDecisionStyle = {
    aggression: HumanBotStyleAxisLevel;
    complexity: HumanBotStyleAxisLevel;
};

export type HumanBotOpeningStyle = {
    sharpness: HumanBotStyleAxisLevel;
    theory: HumanBotStyleAxisLevel;
};

export type HumanBotStyleEvidence = "unclassified" | "editorial" | "measured";

export type HumanBotLevel = {
    id: string;
    elo: number;
};

export type HumanBotSamplingStyle = {
    id: string;
    style: HumanBotStyle;
    temperature: number;
    topP: number;
};

export type HumanBotTiming = {
    id: string;
    minThinkTimeMs: number;
    averageThinkTimeMs: number;
    maxThinkTimeMs: number;
    repertoireTimePercent: number;
};

export type HumanBotOpeningLine = {
    id: string;
    moves: readonly string[];
    weight: number;
    side: HumanBotOpeningLineSide;
};

export type HumanBotRepertoire = {
    id: string;
    version: number;
    mode: HumanBotRepertoireMode;
    maxPly: number;
    lines: readonly HumanBotOpeningLine[];
};

export type HumanBotProfile = {
    id: string;
    name: string;
    profileVersion: number;
    levelId: string;
    samplingStyleId: string;
    timingId: string;
    repertoireId: HumanBotRepertoireId;
    elo: number;
    style: HumanBotStyle;
    temperature: number;
    topP: number;
    repertoire: HumanBotRepertoire;
    timing: HumanBotTiming;
    decisionStyle: HumanBotDecisionStyle | null;
    openingStyle: HumanBotOpeningStyle | null;
    styleEvidence: HumanBotStyleEvidence;
    /** Catalog bots of Phase 9.1: their personalities and opening families. */
    catalog?: {
        play: BotPlayStyleId;
        opening: BotOpeningStyleId;
        families: Pick<BotCatalogSpec, "white" | "vsE4" | "vsD4" | "vsFlank">;
    };
};

export type HumanBotOpeningRepertoireConfig = {
    id: string;
    version: number;
    mode: HumanBotRepertoireMode;
    maxPly: number;
    lines: { moves: string[]; weight: number; side: HumanBotOpeningLineSide }[];
};

export type HumanBotTimingConfig = Omit<HumanBotTiming, "id">;

const ORIGINAL_HUMAN_BOT_LEVELS = [
    { id: "novice-900", elo: 900 },
    { id: "novice-1050", elo: 1050 },
    { id: "developing-1200", elo: 1200 },
    { id: "developing-1300", elo: 1300 },
    { id: "club-1450", elo: 1450 },
    { id: "club-1500", elo: 1500 },
    { id: "club-1650", elo: 1650 },
    { id: "club-1700", elo: 1700 },
    { id: "club-1800", elo: 1800 },
    { id: "expert-1900", elo: 1900 },
    { id: "expert-2000", elo: 2000 },
    { id: "expert-2100", elo: 2100 },
    { id: "advanced-2200", elo: 2200 },
    { id: "advanced-2300", elo: 2300 },
    { id: "master-2400", elo: 2400 },
] as const satisfies readonly HumanBotLevel[];

export const HUMAN_BOT_SAMPLING_STYLES = [
    { id: "adventurous-wide", style: "adventurous", temperature: 1.25, topP: 0.98 },
    { id: "adventurous", style: "adventurous", temperature: 1.12, topP: 0.96 },
    { id: "balanced", style: "balanced", temperature: 1, topP: 0.94 },
    { id: "balanced-selective", style: "balanced", temperature: 0.92, topP: 0.92 },
    { id: "focused", style: "focused", temperature: 0.82, topP: 0.88 },
    { id: "focused-narrow", style: "focused", temperature: 0.72, topP: 0.84 },
] as const satisfies readonly HumanBotSamplingStyle[];

export const HUMAN_BOT_TIMINGS = [
    {
        id: "casual-fast",
        minThinkTimeMs: 1000,
        averageThinkTimeMs: 2800,
        maxThinkTimeMs: 8000,
        repertoireTimePercent: 40,
    },
    {
        id: "casual",
        minThinkTimeMs: 1100,
        averageThinkTimeMs: 3300,
        maxThinkTimeMs: 9500,
        repertoireTimePercent: 38,
    },
    {
        id: "steady",
        minThinkTimeMs: 1300,
        averageThinkTimeMs: 3900,
        maxThinkTimeMs: 11500,
        repertoireTimePercent: 36,
    },
    {
        id: "deliberate",
        minThinkTimeMs: 1400,
        averageThinkTimeMs: 4500,
        maxThinkTimeMs: 13500,
        repertoireTimePercent: 34,
    },
    {
        id: "patient",
        minThinkTimeMs: 1500,
        averageThinkTimeMs: 5200,
        maxThinkTimeMs: 15500,
        repertoireTimePercent: 32,
    },
    {
        id: "deep",
        minThinkTimeMs: 1600,
        averageThinkTimeMs: 6000,
        maxThinkTimeMs: 18000,
        repertoireTimePercent: 30,
    },
] as const satisfies readonly HumanBotTiming[];

const OPENING_LINES = {
    italian: [
        "e2e4",
        "e7e5",
        "g1f3",
        "b8c6",
        "f1c4",
        "f8c5",
        "c2c3",
        "g8f6",
        "d2d4",
        "e5d4",
        "c3d4",
        "c5b4",
        "b1c3",
        "f6e4",
    ],
    twoKnights: [
        "e2e4",
        "e7e5",
        "g1f3",
        "b8c6",
        "f1c4",
        "g8f6",
        "d2d3",
        "f8c5",
        "e1g1",
        "d7d6",
        "c2c3",
        "e8g8",
    ],
    ruyLopez: [
        "e2e4",
        "e7e5",
        "g1f3",
        "b8c6",
        "f1b5",
        "a7a6",
        "b5a4",
        "g8f6",
        "e1g1",
        "f8e7",
        "f1e1",
        "b7b5",
        "a4b3",
        "d7d6",
        "c2c3",
        "e8g8",
        "h2h3",
    ],
    scotch: [
        "e2e4",
        "e7e5",
        "g1f3",
        "b8c6",
        "d2d4",
        "e5d4",
        "f3d4",
        "g8f6",
        "d4c6",
        "b7c6",
        "e4e5",
        "d8e7",
        "d1e2",
        "f6d5",
    ],
    sicilian: [
        "e2e4",
        "c7c5",
        "g1f3",
        "d7d6",
        "d2d4",
        "c5d4",
        "f3d4",
        "g8f6",
        "b1c3",
        "a7a6",
        "c1e3",
        "g7g6",
        "f2f3",
        "f8g7",
    ],
    sicilianEnglishAttack: [
        "e2e4",
        "c7c5",
        "g1f3",
        "d7d6",
        "d2d4",
        "c5d4",
        "f3d4",
        "g8f6",
        "b1c3",
        "a7a6",
        "c1e3",
        "g7g6",
        "f2f3",
        "f8g7",
    ],
    scandinavian: ["e2e4", "d7d5", "e4d5", "d8d5", "b1c3", "d5d8", "d2d4", "g8f6"],
    caroKann: [
        "e2e4",
        "c7c6",
        "d2d4",
        "d7d5",
        "b1c3",
        "d5e4",
        "c3e4",
        "c8f5",
        "e4g3",
        "f5g6",
        "h2h4",
        "h7h6",
    ],
    french: [
        "e2e4",
        "e7e6",
        "d2d4",
        "d7d5",
        "b1c3",
        "g8f6",
        "e4e5",
        "f6d7",
        "f2f4",
        "c7c5",
        "g1f3",
        "b8c6",
    ],
    queensGambit: [
        "d2d4",
        "d7d5",
        "c2c4",
        "e7e6",
        "b1c3",
        "g8f6",
        "c1g5",
        "f8e7",
        "e2e3",
        "e8g8",
        "g1f3",
        "b8d7",
    ],
    slav: [
        "d2d4",
        "d7d5",
        "c2c4",
        "c7c6",
        "g1f3",
        "g8f6",
        "b1c3",
        "d5c4",
        "a2a4",
        "c8f5",
        "e2e3",
        "e7e6",
    ],
    london: [
        "d2d4",
        "d7d5",
        "g1f3",
        "g8f6",
        "c1f4",
        "e7e6",
        "e2e3",
        "c7c5",
        "c2c3",
        "b8c6",
        "b1d2",
        "f8d6",
    ],
    nimzoIndian: [
        "d2d4",
        "g8f6",
        "c2c4",
        "e7e6",
        "b1c3",
        "f8b4",
        "e2e3",
        "e8g8",
        "f1d3",
        "d7d5",
        "g1f3",
        "c7c5",
    ],
    queensIndian: [
        "d2d4",
        "g8f6",
        "c2c4",
        "e7e6",
        "g1f3",
        "b7b6",
        "g2g3",
        "c8a6",
        "b2b3",
        "f8b4",
        "c1d2",
        "b4e7",
    ],
    kingsIndian: [
        "d2d4",
        "g8f6",
        "c2c4",
        "g7g6",
        "b1c3",
        "f8g7",
        "e2e4",
        "d7d6",
        "g1f3",
        "e8g8",
        "f1e2",
        "e7e5",
    ],
    pirc: ["e2e4", "d7d6", "d2d4", "g8f6", "b1c3", "g7g6", "c1e3", "f8g7", "d1d2", "e8g8"],
    modern: ["e2e4", "g7g6", "d2d4", "f8g7", "b1c3", "d7d6", "c1e3", "c7c6", "d1d2"],
    kingsIndianAttack: [
        "e2e4",
        "e7e6",
        "d2d3",
        "d7d5",
        "b1d2",
        "g8f6",
        "g1f3",
        "f8e7",
        "g2g3",
        "e8g8",
        "f1g2",
    ],
    grunfeld: ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "d7d5", "c4d5", "f6d5", "e2e4", "d5c3"],
    english: [
        "c2c4",
        "e7e5",
        "b1c3",
        "g8f6",
        "g2g3",
        "d7d5",
        "c4d5",
        "f6d5",
        "f1g2",
        "d5b6",
        "g1f3",
        "b8c6",
    ],
    reti: [
        "g1f3",
        "d7d5",
        "g2g3",
        "g8f6",
        "f1g2",
        "g7g6",
        "e1g1",
        "f8g7",
        "d2d3",
        "e8g8",
        "b1d2",
        "c7c5",
    ],
} as const;

type OpeningLineId = keyof typeof OPENING_LINES;

function openingLine(
    id: OpeningLineId,
    weight: number,
    side: HumanBotOpeningLineSide = "both",
): HumanBotOpeningLine {
    return { id, moves: OPENING_LINES[id], weight, side };
}

const ORIGINAL_HUMAN_BOT_REPERTOIRES = [
    {
        id: "luna-e4-explorer",
        version: HUMAN_BOT_REPERTOIRE_SCHEMA_VERSION,
        mode: "weighted",
        maxPly: 12,
        lines: [
            openingLine("italian", 4, "white"),
            openingLine("scotch", 3, "white"),
            openingLine("french", 2, "black"),
            openingLine("scandinavian", 1, "black"),
        ],
    },
    {
        id: "nico-sicilian-attack",
        version: HUMAN_BOT_REPERTOIRE_SCHEMA_VERSION,
        mode: "weighted",
        maxPly: 14,
        lines: [
            openingLine("italian", 4, "white"),
            openingLine("twoKnights", 4, "white"),
            openingLine("sicilianEnglishAttack", 5, "black"),
        ],
    },
    {
        id: "vera-classical-choices",
        version: HUMAN_BOT_REPERTOIRE_SCHEMA_VERSION,
        mode: "weighted",
        maxPly: 14,
        lines: [
            openingLine("queensGambit", 4, "white"),
            openingLine("london", 3, "white"),
            openingLine("slav", 4, "black"),
        ],
    },
    {
        id: "gabriel-queen-pawn",
        version: HUMAN_BOT_REPERTOIRE_SCHEMA_VERSION,
        mode: "weighted",
        maxPly: 16,
        lines: [
            openingLine("queensGambit", 4, "white"),
            openingLine("london", 4, "white"),
            openingLine("slav", 4, "black"),
            openingLine("queensIndian", 3, "black"),
        ],
    },
    {
        id: "irene-solid-classical",
        version: HUMAN_BOT_REPERTOIRE_SCHEMA_VERSION,
        mode: "weighted",
        maxPly: 16,
        lines: [
            openingLine("queensGambit", 4, "white"),
            openingLine("english", 2, "white"),
            openingLine("caroKann", 5, "black"),
        ],
    },
    {
        id: "leo-flexible-mainlines",
        version: HUMAN_BOT_REPERTOIRE_SCHEMA_VERSION,
        mode: "weighted",
        maxPly: 16,
        lines: [
            openingLine("ruyLopez", 4, "white"),
            openingLine("english", 2, "white"),
            openingLine("sicilian", 4, "black"),
            openingLine("nimzoIndian", 4, "black"),
            openingLine("kingsIndian", 3, "black"),
        ],
    },
    {
        id: "sofia-fixed-starter",
        version: HUMAN_BOT_REPERTOIRE_SCHEMA_VERSION,
        mode: "forcedLine",
        maxPly: 6,
        lines: [openingLine("scandinavian", 1)],
    },
    {
        id: "daniela-french",
        version: HUMAN_BOT_REPERTOIRE_SCHEMA_VERSION,
        mode: "weighted",
        maxPly: 14,
        lines: [openingLine("scotch", 3, "white"), openingLine("french", 5, "black")],
    },
    {
        id: "marcos-maia-natural",
        version: HUMAN_BOT_REPERTOIRE_SCHEMA_VERSION,
        mode: "none",
        maxPly: 0,
        lines: [],
    },
    {
        id: "carlos-london-english",
        version: HUMAN_BOT_REPERTOIRE_SCHEMA_VERSION,
        mode: "weighted",
        maxPly: 16,
        lines: [
            openingLine("london", 5, "white"),
            openingLine("english", 3, "white"),
            openingLine("slav", 4, "black"),
            openingLine("queensIndian", 2, "black"),
        ],
    },
    {
        id: "nelson-indian-defenses",
        version: HUMAN_BOT_REPERTOIRE_SCHEMA_VERSION,
        mode: "weighted",
        maxPly: 16,
        lines: [
            openingLine("queensGambit", 3, "white"),
            openingLine("nimzoIndian", 4, "black"),
            openingLine("queensIndian", 3, "black"),
            openingLine("kingsIndian", 3, "black"),
            openingLine("grunfeld", 2, "black"),
        ],
    },
    {
        id: "mariann-classical-defenses",
        version: HUMAN_BOT_REPERTOIRE_SCHEMA_VERSION,
        mode: "weighted",
        maxPly: 16,
        lines: [
            openingLine("ruyLopez", 3, "white"),
            openingLine("queensGambit", 3, "white"),
            openingLine("french", 4, "black"),
            openingLine("caroKann", 4, "black"),
        ],
    },
    {
        id: "valeria-pirc-modern",
        version: HUMAN_BOT_REPERTOIRE_SCHEMA_VERSION,
        mode: "weighted",
        maxPly: 14,
        lines: [
            openingLine("italian", 3, "white"),
            openingLine("pirc", 4, "black"),
            openingLine("modern", 3, "black"),
        ],
    },
    {
        id: "tomas-kings-indian",
        version: HUMAN_BOT_REPERTOIRE_SCHEMA_VERSION,
        mode: "weighted",
        maxPly: 16,
        lines: [
            openingLine("kingsIndianAttack", 5, "white"),
            openingLine("kingsIndian", 5, "black"),
        ],
    },
    {
        id: "atlas-mainline",
        version: HUMAN_BOT_REPERTOIRE_SCHEMA_VERSION,
        mode: "weighted",
        maxPly: 18,
        lines: [
            openingLine("ruyLopez", 5, "white"),
            openingLine("scotch", 2, "white"),
            openingLine("sicilian", 5, "black"),
            openingLine("nimzoIndian", 4, "black"),
            openingLine("grunfeld", 3, "black"),
        ],
    },
] as const satisfies readonly HumanBotRepertoire[];

type HumanBotLevelId = (typeof ORIGINAL_HUMAN_BOT_LEVELS)[number]["id"];
type HumanBotSamplingStyleId = (typeof HUMAN_BOT_SAMPLING_STYLES)[number]["id"];
type HumanBotTimingId = (typeof HUMAN_BOT_TIMINGS)[number]["id"];
export type HumanBotRepertoireId = string;

const HUMAN_BOT_PROFILE_DEFINITIONS = [
    {
        id: "luna",
        name: "Luna",
        profileVersion: HUMAN_BOT_PROFILE_VERSION,
        levelId: "novice-900",
        samplingStyleId: "adventurous-wide",
        timingId: "casual-fast",
        repertoireId: "luna-e4-explorer",
        decisionStyle: { aggression: "high", complexity: "high" },
        openingStyle: { sharpness: "medium", theory: "low" },
        styleEvidence: "editorial",
    },
    {
        id: "daniela",
        name: "Daniela",
        profileVersion: HUMAN_BOT_PROFILE_VERSION,
        levelId: "developing-1300",
        samplingStyleId: "adventurous",
        timingId: "casual",
        repertoireId: "daniela-french",
        decisionStyle: { aggression: "medium", complexity: "high" },
        openingStyle: { sharpness: "medium", theory: "medium" },
        styleEvidence: "editorial",
    },
    {
        id: "nico",
        name: "Nico",
        profileVersion: HUMAN_BOT_PROFILE_VERSION,
        levelId: "developing-1200",
        samplingStyleId: "adventurous",
        timingId: "casual",
        repertoireId: "nico-sicilian-attack",
        decisionStyle: { aggression: "high", complexity: "high" },
        openingStyle: { sharpness: "high", theory: "low" },
        styleEvidence: "editorial",
    },
    {
        id: "sofia",
        name: "Sofía",
        profileVersion: HUMAN_BOT_PROFILE_VERSION,
        levelId: "novice-1050",
        samplingStyleId: "adventurous-wide",
        timingId: "casual",
        repertoireId: "sofia-fixed-starter",
        decisionStyle: { aggression: "high", complexity: "medium" },
        openingStyle: { sharpness: "medium", theory: "low" },
        styleEvidence: "editorial",
    },
    {
        id: "gabriel",
        name: "Gabriel",
        profileVersion: HUMAN_BOT_PROFILE_VERSION,
        levelId: "club-1700",
        samplingStyleId: "balanced-selective",
        timingId: "deliberate",
        repertoireId: "gabriel-queen-pawn",
        decisionStyle: { aggression: "low", complexity: "low" },
        openingStyle: { sharpness: "low", theory: "medium" },
        styleEvidence: "editorial",
    },
    {
        id: "vera",
        name: "Vera",
        profileVersion: HUMAN_BOT_PROFILE_VERSION,
        levelId: "club-1500",
        samplingStyleId: "balanced",
        timingId: "steady",
        repertoireId: "vera-classical-choices",
        decisionStyle: { aggression: "medium", complexity: "medium" },
        openingStyle: { sharpness: "medium", theory: "medium" },
        styleEvidence: "editorial",
    },
    {
        id: "carlos",
        name: "Carlos",
        profileVersion: HUMAN_BOT_PROFILE_VERSION,
        levelId: "club-1650",
        samplingStyleId: "balanced-selective",
        timingId: "deliberate",
        repertoireId: "carlos-london-english",
        decisionStyle: { aggression: "medium", complexity: "high" },
        openingStyle: { sharpness: "medium", theory: "high" },
        styleEvidence: "editorial",
    },
    {
        id: "marcos",
        name: "Marcos",
        profileVersion: HUMAN_BOT_PROFILE_VERSION,
        levelId: "club-1450",
        samplingStyleId: "balanced",
        timingId: "steady",
        repertoireId: "marcos-maia-natural",
        decisionStyle: { aggression: "medium", complexity: "medium" },
        openingStyle: { sharpness: "medium", theory: "low" },
        styleEvidence: "editorial",
    },
    {
        id: "nelson",
        name: "Nelson",
        profileVersion: HUMAN_BOT_PROFILE_VERSION,
        levelId: "club-1800",
        samplingStyleId: "balanced-selective",
        timingId: "deliberate",
        repertoireId: "nelson-indian-defenses",
        decisionStyle: { aggression: "high", complexity: "high" },
        openingStyle: { sharpness: "high", theory: "high" },
        styleEvidence: "editorial",
    },
    {
        id: "irene",
        name: "Irene",
        profileVersion: HUMAN_BOT_PROFILE_VERSION,
        levelId: "expert-1900",
        samplingStyleId: "focused",
        timingId: "patient",
        repertoireId: "irene-solid-classical",
        decisionStyle: { aggression: "low", complexity: "low" },
        openingStyle: { sharpness: "low", theory: "high" },
        styleEvidence: "editorial",
    },
    {
        id: "mariann",
        name: "Mariann",
        profileVersion: HUMAN_BOT_PROFILE_VERSION,
        levelId: "expert-2000",
        samplingStyleId: "focused",
        timingId: "patient",
        repertoireId: "mariann-classical-defenses",
        decisionStyle: { aggression: "low", complexity: "medium" },
        openingStyle: { sharpness: "low", theory: "high" },
        styleEvidence: "editorial",
    },
    {
        id: "valeria",
        name: "Valeria",
        profileVersion: HUMAN_BOT_PROFILE_VERSION,
        levelId: "expert-2100",
        samplingStyleId: "focused",
        timingId: "patient",
        repertoireId: "valeria-pirc-modern",
        decisionStyle: { aggression: "high", complexity: "high" },
        openingStyle: { sharpness: "high", theory: "medium" },
        styleEvidence: "editorial",
    },
    {
        id: "leo",
        name: "Leo",
        profileVersion: HUMAN_BOT_PROFILE_VERSION,
        levelId: "advanced-2200",
        samplingStyleId: "focused-narrow",
        timingId: "deep",
        repertoireId: "leo-flexible-mainlines",
        decisionStyle: { aggression: "medium", complexity: "medium" },
        openingStyle: { sharpness: "medium", theory: "high" },
        styleEvidence: "editorial",
    },
    {
        id: "tomas",
        name: "Tomás",
        profileVersion: HUMAN_BOT_PROFILE_VERSION,
        levelId: "advanced-2300",
        samplingStyleId: "focused-narrow",
        timingId: "deep",
        repertoireId: "tomas-kings-indian",
        decisionStyle: { aggression: "medium", complexity: "high" },
        openingStyle: { sharpness: "medium", theory: "high" },
        styleEvidence: "editorial",
    },
    {
        id: "atlas",
        name: "Atlas",
        profileVersion: HUMAN_BOT_PROFILE_VERSION,
        levelId: "master-2400",
        samplingStyleId: "focused-narrow",
        timingId: "deep",
        repertoireId: "atlas-mainline",
        decisionStyle: { aggression: "medium", complexity: "medium" },
        openingStyle: { sharpness: "high", theory: "high" },
        styleEvidence: "editorial",
    },
] as const satisfies readonly {
    id: string;
    name: string;
    profileVersion: number;
    levelId: HumanBotLevelId;
    samplingStyleId: HumanBotSamplingStyleId;
    timingId: HumanBotTimingId;
    repertoireId: HumanBotRepertoireId;
    decisionStyle: HumanBotDecisionStyle | null;
    openingStyle: HumanBotOpeningStyle | null;
    styleEvidence: HumanBotStyleEvidence;
}[];

export type HumanBotProfileId = string;

function resolveHumanBotProfile(
    definition: (typeof HUMAN_BOT_PROFILE_DEFINITIONS)[number],
): HumanBotProfile {
    const level = ORIGINAL_HUMAN_BOT_LEVELS.find(
        (candidate) => candidate.id === definition.levelId,
    )!;
    const style = HUMAN_BOT_SAMPLING_STYLES.find(
        (candidate) => candidate.id === definition.samplingStyleId,
    )!;
    const repertoire = ORIGINAL_HUMAN_BOT_REPERTOIRES.find(
        (candidate) => candidate.id === definition.repertoireId,
    )!;
    const timing = HUMAN_BOT_TIMINGS.find((candidate) => candidate.id === definition.timingId)!;

    return {
        ...definition,
        elo: level.elo,
        style: style.style,
        temperature: style.temperature,
        topP: style.topP,
        repertoire,
        timing,
    };
}

const PLAY_STYLE_AXES: Record<BotPlayStyleId, HumanBotDecisionStyle> = {
    rematador: { aggression: "high", complexity: "low" },
    salvaje: { aggression: "high", complexity: "high" },
    guardian: { aggression: "low", complexity: "low" },
    acechador: { aggression: "low", complexity: "high" },
    equilibrista: { aggression: "medium", complexity: "medium" },
};

const OPENING_STYLE_AXES: Record<BotOpeningStyleId, HumanBotOpeningStyle> = {
    aventurero: { sharpness: "high", theory: "low" },
    esgrimista: { sharpness: "high", theory: "high" },
    practico: { sharpness: "low", theory: "low" },
    clasico: { sharpness: "low", theory: "high" },
};

/** The play personality of any profile: its own for catalog bots, from its axes otherwise. */
export function humanBotPlayStyle(profile: HumanBotProfile): BotPlayStyleId {
    if (profile.catalog) return profile.catalog.play;
    const style = profile.decisionStyle;
    if (!style || style.aggression === "medium") return "equilibrista";
    const complicates = style.complexity === "high";
    if (style.aggression === "high") return complicates ? "salvaje" : "rematador";
    return complicates ? "acechador" : "guardian";
}

/** The opening personality of any profile. */
export function humanBotOpeningStyle(profile: HumanBotProfile): BotOpeningStyleId {
    if (profile.catalog) return profile.catalog.opening;
    const style = profile.openingStyle;
    const sharp = style?.sharpness === "high";
    const theoretical = style?.theory === "high";
    if (sharp) return theoretical ? "esgrimista" : "aventurero";
    return theoretical ? "clasico" : "practico";
}

function catalogSampling(elo: number) {
    const id =
        elo <= 1200
            ? "adventurous"
            : elo <= 1800
              ? "balanced"
              : elo <= 2100
                ? "balanced-selective"
                : elo <= 2300
                  ? "focused"
                  : "focused-narrow";
    return HUMAN_BOT_SAMPLING_STYLES.find((style) => style.id === id)!;
}

function catalogTiming(elo: number) {
    const id =
        elo <= 1000
            ? "casual-fast"
            : elo <= 1400
              ? "casual"
              : elo <= 1700
                ? "steady"
                : elo <= 2000
                  ? "deliberate"
                  : elo <= 2300
                    ? "patient"
                    : "deep";
    return HUMAN_BOT_TIMINGS.find((timing) => timing.id === id)!;
}

/** How deep a bot follows its repertoire: weaker and less theoretical bots leave it sooner. */
function catalogMaxPly(spec: BotCatalogSpec): number {
    const theory = OPENING_STYLE_AXES[spec.opening].theory === "high";
    if (spec.elo < 1200) return 8;
    if (spec.elo < 1600) return theory ? 12 : 10;
    return theory ? 18 : 12;
}

function resolveCatalogProfile(spec: BotCatalogSpec): HumanBotProfile {
    const sampling = catalogSampling(spec.elo);
    const timing = catalogTiming(spec.elo);
    const families: BotOpeningFamilyId[] = [spec.white, spec.vsE4, spec.vsD4, spec.vsFlank];
    const repertoire: HumanBotRepertoire = {
        id: `${spec.id}-repertoire`,
        version: HUMAN_BOT_REPERTOIRE_SCHEMA_VERSION,
        mode: "weighted",
        maxPly: catalogMaxPly(spec),
        lines: families.flatMap(botFamilyLines),
    };
    return {
        id: spec.id,
        name: spec.name,
        profileVersion: HUMAN_BOT_PROFILE_VERSION,
        levelId: `elo-${spec.elo}`,
        samplingStyleId: sampling.id,
        timingId: timing.id,
        repertoireId: repertoire.id,
        elo: spec.elo,
        style: sampling.style,
        temperature: sampling.temperature,
        topP: sampling.topP,
        repertoire,
        timing,
        decisionStyle: PLAY_STYLE_AXES[spec.play],
        openingStyle: OPENING_STYLE_AXES[spec.opening],
        styleEvidence: "editorial",
        catalog: {
            play: spec.play,
            opening: spec.opening,
            families: {
                white: spec.white,
                vsE4: spec.vsE4,
                vsD4: spec.vsD4,
                vsFlank: spec.vsFlank,
            },
        },
    };
}

export const HUMAN_BOT_PROFILES: readonly HumanBotProfile[] = [
    ...HUMAN_BOT_PROFILE_DEFINITIONS.map(resolveHumanBotProfile),
    ...BOT_CATALOG_SPECS.map(resolveCatalogProfile),
].sort((left, right) => left.elo - right.elo || left.name.localeCompare(right.name));

export const HUMAN_BOT_LEVELS: readonly HumanBotLevel[] = [
    ...ORIGINAL_HUMAN_BOT_LEVELS,
    ...BOT_CATALOG_SPECS.map((spec) => ({ id: `elo-${spec.elo}`, elo: spec.elo })).filter(
        (level, index, all) => all.findIndex((other) => other.id === level.id) === index,
    ),
];

export const HUMAN_BOT_REPERTOIRES: readonly HumanBotRepertoire[] = HUMAN_BOT_PROFILES.map(
    (profile) => profile.repertoire,
).filter(
    (repertoire, index, all) => all.findIndex((other) => other.id === repertoire.id) === index,
);

export const DEFAULT_HUMAN_BOT_PROFILE_ID: HumanBotProfileId = "vera";

export const MAIA_ELO_MIN = 600;
export const MAIA_ELO_MAX = 2600;
export const DEFAULT_MAIA_ELO = 1500;

export function clampMaiaElo(value: number): number {
    return Math.max(MAIA_ELO_MIN, Math.min(MAIA_ELO_MAX, Math.trunc(value)));
}

export function buildMaiaEngineSettings(
    elo: number,
    baseSettings: EngineSettings = [],
): EngineSettings {
    const maiaOptionNames = new Set([
        "Elo",
        "SelfElo",
        "OppoElo",
        "Temperature",
        "TopP",
        "MultiPV",
    ]);
    const preservedSettings = baseSettings.filter((setting) => maiaOptionNames.has(setting.name));

    return [
        ...preservedSettings.filter(
            (setting) => setting.name !== "Elo" && setting.name !== "MultiPV",
        ),
        { name: "Elo", value: clampMaiaElo(elo) },
        { name: "MultiPV", value: 1 },
    ];
}

/** A generated player (I-49), rebuilt from the seed and rating in its id. */
export function generatedHumanBotProfile(seed: number, elo: number): HumanBotProfile {
    return resolveCatalogProfile(generatedPlayerSpec(seed, elo));
}

export function getHumanBotProfile(profileId: string | null | undefined): HumanBotProfile {
    const generated = profileId ? parseGeneratedPlayerId(profileId) : null;
    if (generated) return generatedHumanBotProfile(generated.seed, generated.elo);
    return (
        HUMAN_BOT_PROFILES.find((profile) => profile.id === profileId) ??
        HUMAN_BOT_PROFILES.find((profile) => profile.id === DEFAULT_HUMAN_BOT_PROFILE_ID)!
    );
}

export function buildHumanBotOpeningRepertoire(
    profile: HumanBotProfile,
): HumanBotOpeningRepertoireConfig {
    return {
        id: profile.repertoire.id,
        version: profile.repertoire.version,
        mode: profile.repertoire.mode,
        maxPly: profile.repertoire.maxPly,
        lines: profile.repertoire.lines.map((line) => ({
            moves: [...line.moves],
            weight: line.weight,
            side: line.side,
        })),
    };
}

export function buildHumanBotTiming(profile: HumanBotProfile): HumanBotTimingConfig {
    return {
        minThinkTimeMs: profile.timing.minThinkTimeMs,
        averageThinkTimeMs: profile.timing.averageThinkTimeMs,
        maxThinkTimeMs: profile.timing.maxThinkTimeMs,
        repertoireTimePercent: profile.timing.repertoireTimePercent,
    };
}

const STYLE_AXIS_WEIGHT: Record<HumanBotStyleAxisLevel, number> = { low: -1, medium: 0, high: 1 };

/** Weights of the play style (Phase 9.1): aggression, and simplification as the inverse of
 *  complexity. A profile without a decision style plays as Maia. */
export function humanBotStyleWeights(profile: HumanBotProfile): {
    aggression: number;
    simplification: number;
} {
    const style = profile.decisionStyle;
    return {
        aggression: style ? STYLE_AXIS_WEIGHT[style.aggression] : 0,
        simplification: style ? -STYLE_AXIS_WEIGHT[style.complexity] : 0,
    };
}

/** How the bot picks among Maia's candidates. Without a verifier (no Stockfish installed) the
 *  style is not applied and the bot samples Maia's own policy. */
export function buildHumanBotPlay(
    profile: HumanBotProfile,
    verifier: LocalEngine | null,
): BotPlayConfig {
    return {
        ...humanBotStyleWeights(profile),
        elo: profile.elo,
        temperature: profile.temperature,
        topP: profile.topP,
        verifierPath: verifier?.path ?? null,
        verifierArgs: verifier?.args ?? [],
    };
}

export function buildHumanBotTraceHeaders(
    profile: HumanBotProfile,
    color: "White" | "Black",
    humanTiming = true,
    modelVersion = "",
): Record<string, string> {
    return {
        [`${color}BotProfile`]: profile.id,
        [`${color}BotProfileVersion`]: profile.profileVersion.toString(),
        [`${color}BotCatalogVersion`]: HUMAN_BOT_CATALOG_VERSION,
        [`${color}BotLevel`]: profile.levelId,
        [`${color}BotStyle`]: profile.style,
        [`${color}BotStyleEvidence`]: profile.styleEvidence,
        [`${color}BotAggression`]: profile.decisionStyle?.aggression ?? "unclassified",
        [`${color}BotComplexity`]: profile.decisionStyle?.complexity ?? "unclassified",
        [`${color}BotOpeningSharpness`]: profile.openingStyle?.sharpness ?? "unclassified",
        [`${color}BotOpeningTheory`]: profile.openingStyle?.theory ?? "unclassified",
        [`${color}BotSampling`]: profile.samplingStyleId,
        [`${color}BotTiming`]: humanTiming ? profile.timingId : "disabled",
        [`${color}BotRepertoire`]: profile.repertoireId,
        [`${color}BotRepertoireVersion`]: profile.repertoire.version.toString(),
        [`${color}BotRepertoireMode`]: profile.repertoire.mode,
        [`${color}BotModel`]: HUMAN_BOT_MODEL_ID,
        [`${color}BotModelVersion`]: modelVersion || "unknown",
        [`${color}BotTemperature`]: profile.temperature.toString(),
        [`${color}BotTopP`]: profile.topP.toString(),
    };
}

export function isMaiaEngine(engine: LocalEngine): boolean {
    const identity = `${engine.name} ${engine.path}`.toLowerCase();
    return (
        identity.includes("maia3") ||
        identity.includes("maia 3") ||
        (engine.args ?? []).some(
            (arg) => arg === "--use-uci-history" || arg === "--use_uci_history",
        )
    );
}

export function buildHumanBotEngineArgs(args: readonly string[]): string[] {
    const result = [...args];
    const usesHistory = result.some(
        (arg) => arg === "--use-uci-history" || arg === "--use_uci_history",
    );
    const hasSeed = result.some((arg) => arg === "--seed" || arg.startsWith("--seed="));

    if (!usesHistory) {
        result.push("--use-uci-history");
    }
    if (!hasSeed) {
        result.push("--seed", RANDOM_SEED_PLACEHOLDER);
    }

    return result;
}

export function buildHumanBotEngineSettings(
    profile: HumanBotProfile,
    opponentElo: number,
    baseSettings: EngineSettings = [],
): EngineSettings {
    const controlledOptions = new Set([
        "Elo",
        "SelfElo",
        "OppoElo",
        "Temperature",
        "TopP",
        "MultiPV",
    ]);
    const preservedSettings = baseSettings.filter(
        (setting) => !controlledOptions.has(setting.name),
    );

    return [
        ...preservedSettings,
        { name: "Elo", value: profile.elo },
        { name: "SelfElo", value: profile.elo },
        { name: "OppoElo", value: opponentElo },
        { name: "Temperature", value: profile.temperature },
        { name: "TopP", value: profile.topP },
        { name: "MultiPV", value: 1 },
    ];
}
