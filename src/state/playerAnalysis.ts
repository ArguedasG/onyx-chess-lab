import { atom } from "jotai";
import { atomFamily, atomWithStorage } from "jotai/utils";
import {
    PLAYER_ANALYSIS_SCHEMA_VERSION,
    type PlayerEngineAnalysis,
    type PlayerMetadataAnalysis,
} from "@/utils/playerAnalysis";

export type StoredPlayerAnalysis = {
    schemaVersion: typeof PLAYER_ANALYSIS_SCHEMA_VERSION;
    profileId: string;
    playerName: string;
    updatedAt: string;
    metadata: PlayerMetadataAnalysis;
    engine: PlayerEngineAnalysis | null;
};

export type PlayerAnalysisState = {
    schemaVersion: typeof PLAYER_ANALYSIS_SCHEMA_VERSION;
    enabled: boolean;
    profiles: Record<string, StoredPlayerAnalysis>;
};

export const playerAnalysisAtom = atomWithStorage<PlayerAnalysisState>("player-analysis-v1", {
    schemaVersion: PLAYER_ANALYSIS_SCHEMA_VERSION,
    enabled: true,
    profiles: {},
});

export type PlayerAnalysisSection = "summary" | "openings" | "findings" | "engine";

export type PlayerAnalysisViewState = {
    section: PlayerAnalysisSection;
    scrollY: Record<PlayerAnalysisSection, number>;
};

const defaultViewState = (): PlayerAnalysisViewState => ({
    section: "summary",
    scrollY: { summary: 0, openings: 0, findings: 0, engine: 0 },
});

// Session-only UI state. Keeping it outside the persisted analytical profile avoids
// changing the profile schema while allowing evidence tabs to return to the exact view.
export const playerAnalysisViewFamily = atomFamily((_profileId: string) =>
    atom<PlayerAnalysisViewState>(defaultViewState()),
);

export function playerAnalysisProfileId(
    playerName: string,
    sources: Array<{ databasePath: string; playerId: number }>,
): string {
    const sourceKey = sources
        .map((source) => `${source.databasePath}:${source.playerId}`)
        .sort()
        .join("|");
    let hash = 2166136261;
    for (const character of `${playerName}|${sourceKey}`) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return `player-${(hash >>> 0).toString(16)}`;
}
