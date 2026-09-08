import type { DownloadEvent } from "@tauri-apps/plugin-updater";

export const APP_UPDATE_CHECK_EVENT = "onyx:check-for-updates";

export type AppUpdateProgress = {
    downloaded: number;
    total?: number;
    finished: boolean;
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

export function requestAppUpdateCheck() {
    window.dispatchEvent(new Event(APP_UPDATE_CHECK_EVENT));
}
