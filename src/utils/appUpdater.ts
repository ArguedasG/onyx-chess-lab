import type { DownloadEvent } from "@tauri-apps/plugin-updater";
import { compareVersions } from "./changelog";

export const APP_UPDATE_CHECK_EVENT = "onyx:check-for-updates";
export const GITHUB_RELEASES_URL = "https://github.com/ArguedasG/onyx-chess-lab/releases";
export const GITHUB_LATEST_RELEASE_API_URL =
    "https://api.github.com/repos/ArguedasG/onyx-chess-lab/releases/latest";

export type AppUpdateProgress = {
    downloaded: number;
    total?: number;
    finished: boolean;
};

export type ManualUpdateInfo = {
    version: string;
    body: string;
    downloadUrl: string;
};

export const EMPTY_UPDATE_PROGRESS: AppUpdateProgress = {
    downloaded: 0,
    finished: false,
};

export function reduceUpdateProgress(
    progress: AppUpdateProgress,
    event: DownloadEvent,
): AppUpdateProgress {
    if (event.event === "Started") {
        return {
            downloaded: 0,
            total: event.data.contentLength,
            finished: false,
        };
    }
    if (event.event === "Progress") {
        return {
            ...progress,
            downloaded: progress.downloaded + event.data.chunkLength,
        };
    }
    return {
        ...progress,
        downloaded: progress.total ?? progress.downloaded,
        finished: true,
    };
}

/**
 * Parses a GitHub `releases/latest` payload for platforms without signed in-app auto-install
 * (macOS and Linux). Only official stable releases newer than `currentVersion` are offered.
 */
export function parseManualReleaseUpdate(
    payload: unknown,
    currentVersion: string,
): ManualUpdateInfo | null {
    if (!payload || typeof payload !== "object") return null;
    const record = payload as Record<string, unknown>;
    if (record.draft === true || record.prerelease === true) return null;

    const rawTag = typeof record.tag_name === "string" ? record.tag_name.trim() : "";
    const version = rawTag.replace(/^v/i, "");
    if (!/^\d+\.\d+\.\d+/.test(version)) return null;
    if (compareVersions(version, currentVersion) <= 0) return null;

    const rawUrl = typeof record.html_url === "string" ? record.html_url.trim() : "";
    const downloadUrl = rawUrl.startsWith(`${GITHUB_RELEASES_URL}/`) ? rawUrl : GITHUB_RELEASES_URL;
    const body = typeof record.body === "string" ? record.body : "";

    return { version, body, downloadUrl };
}

export function requestAppUpdateCheck() {
    window.dispatchEvent(new Event(APP_UPDATE_CHECK_EVENT));
}
