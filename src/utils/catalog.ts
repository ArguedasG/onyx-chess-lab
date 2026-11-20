import bundledDatabases from "@/data/catalog/databases.json";
import bundledEngines from "@/data/catalog/engines.json";
import bundledPuzzleDatabases from "@/data/catalog/puzzle_databases.json";
import { fetchCatalog } from "./http";

/**
 * Onyx's own download catalog. The files in `src/data/catalog` ship with the app: they mirror the
 * En Croissant catalog (bases and engines hosted by En Croissant or their authors) and can add
 * entries of Onyx's own. The live En Croissant catalog is still fetched and merged on top, so its
 * updates keep appearing; if its server is down or disappears, the bundled copy still lists every
 * download.
 */
export type CatalogEntry = { downloadLink: string; path?: string };

function entryKey(entry: CatalogEntry) {
    return `${entry.downloadLink}|${entry.path ?? ""}`;
}

/** Live entries first, in their order, then bundled entries the live catalog does not have. */
export function mergeCatalogs<T extends CatalogEntry>(
    live: readonly T[] | null,
    bundled: readonly T[],
) {
    const merged = [...(live ?? [])];
    const known = new Set(merged.map(entryKey));
    for (const entry of bundled) {
        if (!known.has(entryKey(entry))) {
            known.add(entryKey(entry));
            merged.push(entry);
        }
    }
    return merged;
}

/**
 * Onyx reads game and puzzle databases as SQLite (`.db3`). En Croissant's live catalog has moved
 * to DuckDB (`.duckdb`) files with the same content; offering them would show each base twice and
 * the second copy would fail after downloading, so those entries are left out.
 */
export function isReadableDatabase(entry: CatalogEntry) {
    const file = entry.downloadLink.split(/[?#]/)[0];
    return file.toLowerCase().endsWith(".db3");
}

async function loadCatalog<T extends CatalogEntry>(
    path: string,
    bundled: readonly T[],
    keep: (entry: T) => boolean = () => true,
) {
    let live: T[] | null = null;
    try {
        const data = await fetchCatalog<unknown>(path);
        if (Array.isArray(data)) live = data as T[];
    } catch {
        // The bundled catalog is enough to offer every download.
    }
    return mergeCatalogs(live, bundled).filter(keep);
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
export function loadEngineCatalog<T extends CatalogEntry>(query: string) {
    return loadCatalog<T>(`/engines.json${query}`, bundledEngines as unknown as T[]);
}
