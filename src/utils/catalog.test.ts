import { describe, expect, it, vi } from "vitest";

const liveCatalog = vi.hoisted(() => ({ data: null as unknown }));

vi.mock("./http", () => ({
    fetchCatalog: async () => {
        if (liveCatalog.data === null) throw new Error("offline");
        return liveCatalog.data;
    },
}));

import bundledDatabases from "@/data/catalog/databases.json";
import bundledPuzzleDatabases from "@/data/catalog/puzzle_databases.json";
import publishedDatabases from "../../catalog/databases.json";
import publishedEngines from "../../catalog/engines.json";
import publishedPuzzleDatabases from "../../catalog/puzzle_databases.json";
import {
    type CatalogEntry,
    chooseCatalog,
    isReadableDatabase,
    loadDatabaseCatalog,
    loadPuzzleDatabaseCatalog,
} from "./catalog";

/** The lists published in `catalog/`, which installed copies read from GitHub. */
type PublishedEntry = CatalogEntry & Record<string, unknown>;

describe("download catalog", () => {
    it("offers exactly what the live catalog lists, so an entry can be fixed without a release", () => {
        const live = [{ downloadLink: "https://a-fixed", title: "A" }];
        const bundled = [
            { downloadLink: "https://a-broken", title: "A" },
            { downloadLink: "https://b", title: "B" },
        ];
        expect(chooseCatalog(live, bundled).map((entry) => entry.downloadLink)).toEqual([
            "https://a-fixed",
        ]);
    });

    it("falls back to the bundled copy when the live catalog lists nothing usable", () => {
        const bundled = [{ downloadLink: "https://b.db3" }];
        expect(chooseCatalog(null, bundled)).toEqual(bundled);
        expect(chooseCatalog([], bundled)).toEqual(bundled);
        expect(
            chooseCatalog([{ downloadLink: "https://a.duckdb" }], bundled, isReadableDatabase),
        ).toEqual(bundled);
    });

    it("still lists every bundled base when the catalog cannot be reached", async () => {
        liveCatalog.data = null;
        const catalog = await loadDatabaseCatalog();
        expect(catalog.map((entry) => entry.downloadLink)).toEqual(
            bundledDatabases.map((entry) => entry.downloadLink),
        );
        expect(catalog.length).toBeGreaterThanOrEqual(5);
    });

    it("only offers databases Onyx can open (SQLite .db3)", () => {
        expect(isReadableDatabase({ downloadLink: "https://x/Lichess Puzzles 2026.db3" })).toBe(
            true,
        );
        expect(isReadableDatabase({ downloadLink: "https://x/a.DB3?v=2" })).toBe(true);
        expect(isReadableDatabase({ downloadLink: "https://x/Lichess Puzzles 2026.duckdb" })).toBe(
            false,
        );
    });

    it("ignores a list of DuckDB files and keeps the bundled bases", async () => {
        liveCatalog.data = [
            {
                title: "Lichess Puzzles 2026",
                downloadLink: "https://db.encroissant.org/Lichess Puzzles 2026.duckdb",
            },
        ];
        const puzzles = await loadPuzzleDatabaseCatalog();
        expect(puzzles.map((entry) => entry.downloadLink)).toEqual(
            bundledPuzzleDatabases.map((entry) => entry.downloadLink),
        );
    });

    it("publishes valid lists in catalog/", () => {
        for (const entries of [
            publishedDatabases,
            publishedPuzzleDatabases,
        ] as PublishedEntry[][]) {
            expect(entries.length).toBeGreaterThan(0);
            for (const entry of entries) {
                expect(isReadableDatabase(entry), entry.downloadLink).toBe(true);
                expect(typeof entry.title).toBe("string");
            }
        }
        const engines = publishedEngines as PublishedEntry[];
        for (const os of ["windows", "macos", "linux"]) {
            for (const bmi2 of [true, false]) {
                expect(
                    engines.some(
                        (e) => e.os === os && e.bmi2 === bmi2 && /^stockfish/i.test(String(e.name)),
                    ),
                    `${os} bmi2=${bmi2}`,
                ).toBe(true);
            }
        }
        for (const engine of engines) {
            expect(engine.downloadLink).toMatch(/^https:\/\//);
            expect(typeof engine.path).toBe("string");
        }
    });
});
