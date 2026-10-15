import { describe, expect, it, vi } from "vitest";

vi.mock("./http", () => ({
    fetchCatalog: async () => {
        throw new Error("offline");
    },
}));

import bundledDatabases from "@/data/catalog/databases.json";
import { loadDatabaseCatalog, mergeCatalogs } from "./catalog";

describe("download catalog", () => {
    it("keeps live entries first and adds bundled ones the live catalog lacks", () => {
        const live = [{ downloadLink: "https://a", title: "A (live)" }];
        const bundled = [
            { downloadLink: "https://b", title: "B" },
            { downloadLink: "https://a", title: "A (bundled)" },
        ];
        expect(mergeCatalogs(live, bundled).map((entry) => entry.title)).toEqual(["A (live)", "B"]);
    });

    it("tells engine builds of the same archive apart by their path", () => {
        const bundled = [
            { downloadLink: "https://sf.zip", path: "sf-avx2.exe" },
            { downloadLink: "https://sf.zip", path: "sf.exe" },
        ];
        expect(mergeCatalogs([bundled[0]], bundled)).toHaveLength(2);
    });

    it("still lists every En Croissant base when its server cannot be reached", async () => {
        const catalog = await loadDatabaseCatalog();
        expect(catalog.map((entry) => entry.downloadLink)).toEqual(
            bundledDatabases.map((entry) => entry.downloadLink),
        );
        expect(catalog.length).toBeGreaterThanOrEqual(5);
    });
});
