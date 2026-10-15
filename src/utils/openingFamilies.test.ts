import { describe, expect, it } from "vitest";
import {
    buildOpeningFamilies,
    buildOpeningTree,
    openingNameLevels,
    visibleOpeningRows,
    visibleOpeningTreeRows,
} from "./openingFamilies";

const result = (name: string, won: number, draw: number, lost: number) => ({
    name,
    games: won + draw + lost,
    won,
    draw,
    lost,
});

describe("opening families", () => {
    it("splits names into family, variation and subvariation", () => {
        expect(openingNameLevels("French Defense: Advance Variation, Milner-Barry Gambit")).toEqual(
            ["French Defense", "Advance Variation", "Milner-Barry Gambit"],
        );
        expect(
            openingNameLevels("Sicilian Defense: Najdorf Variation, English Attack, Anti-English"),
        ).toEqual(["Sicilian Defense", "Najdorf Variation", "English Attack, Anti-English"]);
        expect(openingNameLevels("English Opening")).toEqual(["English Opening"]);
        expect(openingNameLevels("Caro-Kann Defence: Advance Variation")).toEqual([
            "Caro-Kann Defense",
            "Advance Variation",
        ]);
        expect(openingNameLevels("  ")).toEqual([]);
    });

    it("aggregates results at every level and keeps games played with the bare name", () => {
        const families = buildOpeningFamilies([
            result("French Defense: Advance Variation, Milner-Barry Gambit", 1, 0, 1),
            result("French Defense: Advance Variation", 2, 1, 0),
            result("French Defence: Exchange Variation", 0, 1, 0),
            result("French Defense", 0, 0, 1),
            result("English Opening", 1, 0, 0),
        ]);
        expect(families.map((family) => [family.label, family.games])).toEqual([
            ["French Defense", 7],
            ["English Opening", 1],
        ]);
        const french = families[0];
        expect(french).toMatchObject({ won: 3, draw: 2, lost: 2, own: { games: 1, lost: 1 } });
        expect(french.fullName).toBe("French Defense");
        expect(french.children.map((child) => [child.label, child.games])).toEqual([
            ["Advance Variation", 5],
            ["Exchange Variation", 1],
        ]);
        expect(french.children[0].children[0]).toMatchObject({
            label: "Milner-Barry Gambit",
            fullName: "French Defense: Advance Variation, Milner-Barry Gambit",
            games: 2,
        });
    });

    it("lists only the rows of expanded nodes", () => {
        const families = buildOpeningFamilies([
            result("French Defense: Advance Variation, Milner-Barry Gambit", 1, 0, 0),
            result("French Defense", 1, 0, 0),
            result("English Opening", 1, 0, 0),
        ]);
        const labels = (expanded: string[]) =>
            visibleOpeningRows(families, new Set(expanded)).map(
                ({ node, depth, ownOnly }) => `${depth}:${node.label}${ownOnly ? " (own)" : ""}`,
            );
        expect(labels([])).toEqual(["0:French Defense", "0:English Opening"]);
        expect(labels(["french defense"])).toEqual([
            "0:French Defense",
            "1:French Defense (own)",
            "1:Advance Variation",
            "0:English Opening",
        ]);
        expect(labels(["french defense", "french defense › advance variation"])).toContain(
            "2:Milner-Barry Gambit",
        );
    });
});

describe("opening tree from exact groups", () => {
    const bucket = (key: string, games: number) => ({ key, games });

    it("nests full names under the exact family and variation results", () => {
        const leaves = [
            bucket("French Defense: Advance Variation, Milner-Barry Gambit", 2),
            bucket("French Defense: Advance Variation", 3),
            bucket("French Defence: Exchange Variation", 1),
            bucket("French Defense", 1),
            bucket("Unknown opening", 4),
        ];
        const groups = [
            bucket("French Defense", 7),
            bucket("French Defense: Advance Variation", 5),
            bucket("French Defense: Exchange Variation", 1),
        ];
        const tree = buildOpeningTree(leaves, groups);
        expect(tree.map((node) => [node.label, node.value.games])).toEqual([
            ["French Defense", 7],
            ["Unknown opening", 4],
        ]);
        const french = tree[0];
        expect(french.own?.games).toBe(1);
        expect(french.children.map((node) => [node.label, node.value.games])).toEqual([
            ["Advance Variation", 5],
            ["Exchange Variation", 1],
        ]);
        const advance = french.children[0];
        expect(advance.own?.games).toBe(3);
        expect(advance.children.map((node) => node.label)).toEqual(["Milner-Barry Gambit"]);

        const rows = visibleOpeningTreeRows(tree, new Set([french.key, advance.key]));
        expect(
            rows.map(({ node, depth, ownOnly }) => `${depth}:${node.label}${ownOnly ? "*" : ""}`),
        ).toEqual([
            "0:French Defense",
            "1:French Defense*",
            "1:Advance Variation",
            "2:Advance Variation*",
            "2:Milner-Barry Gambit",
            "1:Exchange Variation",
            "0:Unknown opening",
        ]);
    });
});
