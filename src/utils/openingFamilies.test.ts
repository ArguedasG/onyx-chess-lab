import { describe, expect, it } from "vitest";
import { buildOpeningFamilies, openingNameLevels, visibleOpeningRows } from "./openingFamilies";

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
