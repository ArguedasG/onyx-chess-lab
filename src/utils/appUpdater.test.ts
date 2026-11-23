import { describe, expect, it } from "vitest";
import {
    EMPTY_UPDATE_PROGRESS,
    GITHUB_RELEASES_URL,
    parseManualReleaseUpdate,
    reduceUpdateProgress,
} from "./appUpdater";

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

describe("manual release update check (macOS / Linux)", () => {
    it("returns release info when a newer stable GitHub release exists", () => {
        const result = parseManualReleaseUpdate(
            {
                tag_name: "v0.29.0",
                body: "New features",
                html_url: `${GITHUB_RELEASES_URL}/tag/v0.29.0`,
                draft: false,
                prerelease: false,
            },
            "0.28.1",
        );

        expect(result).toEqual({
            version: "0.29.0",
            body: "New features",
            downloadUrl: `${GITHUB_RELEASES_URL}/tag/v0.29.0`,
        });
    });

    it("returns null for the current version, older versions, drafts and prereleases", () => {
        expect(parseManualReleaseUpdate({ tag_name: "v0.28.1" }, "0.28.1")).toBeNull();
        expect(parseManualReleaseUpdate({ tag_name: "v0.27.3" }, "0.28.1")).toBeNull();
        expect(parseManualReleaseUpdate({ tag_name: "v0.29.0", draft: true }, "0.28.1")).toBeNull();
        expect(
            parseManualReleaseUpdate({ tag_name: "v0.29.0", prerelease: true }, "0.28.1"),
        ).toBeNull();
    });

    it("falls back to the official releases URL if html_url points elsewhere", () => {
        const result = parseManualReleaseUpdate(
            {
                tag_name: "v0.29.0",
                body: "",
                html_url: "https://example.com/fake-release",
            },
            "0.28.1",
        );

        expect(result?.downloadUrl).toBe(GITHUB_RELEASES_URL);
    });
});
