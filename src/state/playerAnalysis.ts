import { notifications } from "@mantine/notifications";
import { warn } from "@tauri-apps/plugin-log";
import i18n from "i18next";
import { atom } from "jotai";
import { atomFamily, atomWithStorage, createJSONStorage } from "jotai/utils";
import { createFileBackedStorage } from "./fileBackedStorage";
import { appDataFiles } from "./appDataFiles";
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
    artifactId?: string;
};

export type PlayerAnalysisState = {
    schemaVersion: typeof PLAYER_ANALYSIS_SCHEMA_VERSION;
    enabled: boolean;
    profiles: Record<string, StoredPlayerAnalysis>;
};

export const PLAYER_ANALYSIS_KEY = "player-analysis-v1";

let lastErrorNotice = 0;

/**
 * Player analyses used to live in localStorage, whose ~5 MB quota a few engine analyses could
 * fill ("exceeded the quota"). They now live in `player-analysis-v1.json` in the app data folder;
 * the first start migrates the old value and keeps a backup copy.
 */
export const playerAnalysisStorage = createFileBackedStorage({
    fs: appDataFiles,
    legacy: typeof localStorage === "undefined" ? undefined : localStorage,
    onError(key, error) {
        warn(`Player analysis storage error for ${key}: ${String(error)}`);
        if (Date.now() - lastErrorNotice < 30_000) return;
        lastErrorNotice = Date.now();
        notifications.show({
            color: "red",
            title: i18n.t("PlayerAnalysis.StorageError", "The player analysis could not be saved"),
            message: String(error),
        });
    },
});

export function preloadPlayerAnalysis(): Promise<void> {
    return playerAnalysisStorage.preload(PLAYER_ANALYSIS_KEY);
}

export const playerAnalysisAtom = atomWithStorage<PlayerAnalysisState>(
    PLAYER_ANALYSIS_KEY,
    {
        schemaVersion: PLAYER_ANALYSIS_SCHEMA_VERSION,
        enabled: true,
        profiles: {},
    },
    createJSONStorage(() => playerAnalysisStorage),
);

export type PlayerAnalysisReturnTarget = {
    profileId: string;
    playerName: string;
};

export const playerAnalysisReturnTargetAtom = atom<PlayerAnalysisReturnTarget | null>(null);

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
