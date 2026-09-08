import { describe, expect, it } from "vitest";
import { EMPTY_UPDATE_PROGRESS, reduceUpdateProgress } from "./appUpdater";

describe("app updater progress", () => {
    it("tracks the content length and downloaded chunks", () => {
        const started = reduceUpdateProgress(EMPTY_UPDATE_PROGRESS, {
            event: "Started",
            data: { contentLength: 1_000 },
        });
        const downloading = reduceUpdateProgress(started, {
            event: "Progress",
            data: { chunkLength: 250 },
        });
        const finished = reduceUpdateProgress(downloading, { event: "Finished" });

        expect(downloading).toEqual({ downloaded: 250, total: 1_000, finished: false });
        expect(finished).toEqual({ downloaded: 1_000, total: 1_000, finished: true });
    });

    it("supports servers that do not report a content length", () => {
        const started = reduceUpdateProgress(EMPTY_UPDATE_PROGRESS, {
            event: "Started",
            data: {},
        });
        const downloading = reduceUpdateProgress(started, {
            event: "Progress",
            data: { chunkLength: 128 },
        });

        expect(reduceUpdateProgress(downloading, { event: "Finished" })).toEqual({
            downloaded: 128,
            total: undefined,
            finished: true,
        });
    });
});
