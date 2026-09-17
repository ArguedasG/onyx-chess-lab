import { fetch } from "@tauri-apps/plugin-http";

const DEFAULT_CACHE_TTL_MS = 5 * 60_000;
const DEFAULT_RATE_LIMIT_DELAY_MS = 60_000;
const MAX_CACHE_ENTRIES = 128;

type CachedResponse = {
    body: Uint8Array;
    headers: Array<[string, string]>;
    status: number;
    statusText: string;
    expiresAt: number;
};

type QueuedRequest = {
    signal?: AbortSignal;
    run: () => Promise<void>;
    reject: (reason: unknown) => void;
};

const queue: QueuedRequest[] = [];
const cache = new Map<string, CachedResponse>();
let running = false;

function abortError(): DOMException {
    return new DOMException("The request was cancelled.", "AbortError");
}

function responseFromCache(value: CachedResponse): Response {
    return new Response(value.body.slice(), {
        headers: value.headers,
        status: value.status,
        statusText: value.statusText,
    });
}

function readCache(key: string): Response | null {
    const value = cache.get(key);
    if (!value) return null;
    if (value.expiresAt <= Date.now()) {
        cache.delete(key);
        return null;
    }
    cache.delete(key);
    cache.set(key, value);
    return responseFromCache(value);
}

function writeCache(key: string, value: CachedResponse) {
    cache.delete(key);
    cache.set(key, value);
    while (cache.size > MAX_CACHE_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
        else break;
    }
}

function retryDelay(response: Response): number {
    const raw = response.headers.get("retry-after");
    if (!raw) return DEFAULT_RATE_LIMIT_DELAY_MS;
    const seconds = Number(raw);
    if (Number.isFinite(seconds)) return Math.max(DEFAULT_RATE_LIMIT_DELAY_MS, seconds * 1000);
    const date = Date.parse(raw);
    return Number.isNaN(date)
        ? DEFAULT_RATE_LIMIT_DELAY_MS
        : Math.max(DEFAULT_RATE_LIMIT_DELAY_MS, date - Date.now());
}

function waitFor(delayMs: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
        const onAbort = () => {
            window.clearTimeout(timeout);
            reject(abortError());
        };
        const timeout = window.setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, delayMs);
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

async function drainQueue() {
    if (running) return;
    running = true;
    try {
        while (queue.length > 0) {
            const task = queue.shift()!;
            if (task.signal?.aborted) {
                task.reject(abortError());
                continue;
            }
            await task.run();
        }
    } finally {
        running = false;
    }
}

function enqueue<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(abortError());
    return new Promise<T>((resolve, reject) => {
        const task: QueuedRequest = {
            signal,
            reject,
            run: async () => {
                signal?.removeEventListener("abort", removeQueued);
                try {
                    resolve(await operation());
                } catch (error) {
                    reject(error);
                }
            },
        };
        const removeQueued = () => {
            const index = queue.indexOf(task);
            if (index >= 0) queue.splice(index, 1);
            reject(abortError());
        };
        signal?.addEventListener("abort", removeQueued, { once: true });
        queue.push(task);
        void drainQueue();
    });
}

export type LichessRequestOptions = {
    cacheKey?: string;
    cacheTtlMs?: number;
    signal?: AbortSignal;
};

/** Serialize Lichess traffic and keep the lane occupied until the body is consumed. */
export async function lichessRequest(
    url: string,
    init: RequestInit = {},
    options: LichessRequestOptions = {},
): Promise<Response> {
    const cached = options.cacheKey ? readCache(options.cacheKey) : null;
    if (cached) return cached;

    return enqueue(async () => {
        const queuedCacheHit = options.cacheKey ? readCache(options.cacheKey) : null;
        if (queuedCacheHit) return queuedCacheHit;
        let response = await fetch(url, { ...init, signal: options.signal });
        if (response.status === 429) {
            const delay = retryDelay(response);
            await response.body?.cancel();
            await waitFor(delay, options.signal);
            response = await fetch(url, { ...init, signal: options.signal });
        }

        const body = new Uint8Array(await response.arrayBuffer());
        const value: CachedResponse = {
            body,
            headers: [...response.headers.entries()],
            status: response.status,
            statusText: response.statusText,
            expiresAt: Date.now() + (options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS),
        };
        if (options.cacheKey && response.ok) writeCache(options.cacheKey, value);
        return responseFromCache(value);
    }, options.signal);
}

/** Consume Lichess NDJSON incrementally while retaining only the latest item. */
export async function lichessNdjsonRequest<T>(
    url: string,
    init: RequestInit = {},
    signal?: AbortSignal,
    onItem?: (item: T) => void,
): Promise<T> {
    return enqueue(async () => {
        let response = await fetch(url, { ...init, signal });
        if (response.status === 429) {
            const delay = retryDelay(response);
            await response.body?.cancel();
            await waitFor(delay, signal);
            response = await fetch(url, { ...init, signal });
        }
        if (!response.ok) {
            throw new Error(`Lichess request failed: ${response.status} ${response.statusText}`);
        }

        if (!response.body) return readLatestNdjson<T>(response);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let latest: T | undefined;
        const consume = (line: string) => {
            if (!line.trim()) return;
            latest = JSON.parse(line) as T;
            onItem?.(latest);
        };

        while (true) {
            if (signal?.aborted) {
                await reader.cancel();
                throw abortError();
            }
            const { done, value } = await reader.read();
            buffer += decoder.decode(value, { stream: !done });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() ?? "";
            for (const line of lines) consume(line);
            if (done) break;
        }
        consume(buffer);
        if (latest === undefined) throw new Error("Lichess returned an empty streamed response.");
        return latest;
    }, signal);
}

/** Return the latest complete snapshot from an NDJSON explorer response. */
export async function readLatestNdjson<T>(response: Response): Promise<T> {
    const lines = (await response.text()).split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length === 0) throw new Error("Lichess returned an empty streamed response.");
    return JSON.parse(lines.at(-1)!) as T;
}

export function clearLichessRequestCache() {
    cache.clear();
}
