import { fetch } from "@tauri-apps/plugin-http";
import { beforeEach, expect, it, vi } from "vitest";
import {
    clearLichessRequestCache,
    lichessNdjsonRequest,
    lichessRequest,
    readLatestNdjson,
} from "./request";

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));

beforeEach(() => {
    vi.resetAllMocks();
    clearLichessRequestCache();
});

it("returns the latest complete NDJSON snapshot", async () => {
    const response = new Response('{"value":1}\n{"value":2}\n');
    await expect(readLatestNdjson<{ value: number }>(response)).resolves.toEqual({ value: 2 });
});

it("deduplicates queued requests after the first response enters the cache", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    const first = lichessRequest("https://example.test/a", {}, { cacheKey: "a" });
    const second = lichessRequest("https://example.test/a", {}, { cacheKey: "a" });

    await expect((await first).json()).resolves.toEqual({ ok: true });
    await expect((await second).json()).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledOnce();
});

it("parses streamed NDJSON incrementally and exposes each complete snapshot", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(encoder.encode('{"value":1}\n{"val'));
            controller.enqueue(encoder.encode('ue":2}\n'));
            controller.close();
        },
    });
    vi.mocked(fetch).mockResolvedValue(new Response(body, { status: 200 }));
    const seen: number[] = [];

    const latest = await lichessNdjsonRequest<{ value: number }>(
        "https://example.test/stream",
        {},
        undefined,
        (item) => seen.push(item.value),
    );

    expect(seen).toEqual([1, 2]);
    expect(latest).toEqual({ value: 2 });
});
