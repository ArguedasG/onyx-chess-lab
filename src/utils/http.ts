import { getVersion } from "@tauri-apps/api/app";
import { fetch } from "@tauri-apps/plugin-http";

const APP_NAME = "OnyxChessLab";
const APP_REPO = "https://github.com/ArguedasG/onyx-chess-lab";

let userAgent = APP_NAME;

export async function initUserAgent(): Promise<void> {
    try {
        const version = await getVersion();
        userAgent = `${APP_NAME}/${version} (${APP_REPO})`;
    } catch {
        userAgent = `${APP_NAME} (${APP_REPO})`;
    }
}

export function apiHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
        "User-Agent": userAgent,
        ...extra,
    };
}

const CATALOG_URL = "https://encroissant.org";
const CATALOG_ATTEMPTS = 3;
const CATALOG_CACHE_PREFIX = "catalog-cache:";

function readCachedCatalog<T>(path: string): T | null {
    try {
        const stored = localStorage.getItem(CATALOG_CACHE_PREFIX + path);
        return stored ? (JSON.parse(stored) as T) : null;
    } catch {
        return null;
    }
}

function writeCachedCatalog(path: string, data: unknown) {
    try {
        localStorage.setItem(CATALOG_CACHE_PREFIX + path, JSON.stringify(data));
    } catch {
        // The cache only softens server outages; failing to write it is harmless.
    }
}

/**
 * Fetch a download catalog (engines, databases, puzzles) from the En Croissant server. The server
 * sits behind Cloudflare and occasionally drops a request, so transient failures are retried and,
 * as a last resort, the last catalog received is returned.
 */
export async function fetchCatalog<T>(path: string): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < CATALOG_ATTEMPTS; attempt++) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
        try {
            const response = await fetch(`${CATALOG_URL}${path}`, {
                method: "GET",
                headers: apiHeaders({ Accept: "application/json" }),
                connectTimeout: 10_000,
            });
            if (!response.ok) {
                throw new Error(
                    `Catalog request failed: ${response.status} ${response.statusText}`,
                );
            }
            const data = (await response.json()) as T;
            writeCachedCatalog(path, data);
            return data;
        } catch (error) {
            lastError = error;
        }
    }
    const cached = readCachedCatalog<T>(path);
    if (cached !== null) return cached;
    throw lastError;
}

/** `fetchCatalog` already retries, so SWR should not keep re-requesting and flashing errors. */
export const CATALOG_SWR_OPTIONS = {
    shouldRetryOnError: false,
    revalidateOnFocus: false,
} as const;
