import bundledDatabases from "@/data/catalog/databases.json";
import bundledEngines from "@/data/catalog/engines.json";
import bundledPuzzleDatabases from "@/data/catalog/puzzle_databases.json";
import { fetchCatalog } from "./http";

/**
 * Onyx's own download catalog. The live lists are the `catalog/` folder of this repository (see
 * `CATALOG_URL`): whatever they list is what the app offers, so a link can be fixed, replaced or
 * removed there without a release. The files in `src/data/catalog` ship with the app and are used
 * only when the live lists cannot be reached (and nothing was received before) or list nothing
 * usable. The files themselves are hosted by their authors or by En Croissant.
 */
export type CatalogEntry = { downloadLink: string; path?: string };

/** The live catalog when it lists anything usable, otherwise the copy shipped with the app. */
export function chooseCatalog<T extends CatalogEntry>(
    live: readonly T[] | null,
    bundled: readonly T[],
    keep: (entry: T) => boolean = () => true,
): T[] {
    const usable = (live ?? []).filter(keep);
    return usable.length > 0 ? usable : bundled.filter(keep);
}

/**
 * Onyx reads game and puzzle databases as SQLite (`.db3`). En Croissant's catalog has moved to
 * DuckDB (`.duckdb`) files with the same content, which Onyx cannot open, so only `.db3` entries
 * are offered, wherever a list comes from.
 */
export function isReadableDatabase(entry: CatalogEntry) {
    const file = entry.downloadLink.split(/[?#]/)[0];
    return file.toLowerCase().endsWith(".db3");
}

async function loadCatalog<T extends CatalogEntry>(
    path: string,
    bundled: readonly T[],
    keep?: (entry: T) => boolean,
) {
    let live: T[] | null = null;
    try {
        const data = await fetchCatalog<unknown>(path);
        if (Array.isArray(data)) live = data as T[];
    } catch {
        // The bundled catalog is enough to offer every download.
    }
    return chooseCatalog(live, bundled, keep);
}

export function loadDatabaseCatalog<T extends CatalogEntry>() {
    return loadCatalog<T>(
        "/databases.json",
        bundledDatabases as unknown as T[],
        isReadableDatabase,
    );
}

export function loadPuzzleDatabaseCatalog<T extends CatalogEntry>() {
    return loadCatalog<T>(
        "/puzzle_databases.json",
        bundledPuzzleDatabases as unknown as T[],
        isReadableDatabase,
    );
}

/** The engine catalog lists every platform; callers keep the entries of theirs. */
export function loadEngineCatalog<T extends CatalogEntry>() {
    return loadCatalog<T>("/engines.json", bundledEngines as unknown as T[]);
}
