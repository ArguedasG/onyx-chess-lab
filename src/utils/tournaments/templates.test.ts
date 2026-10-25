import { describe, expect, it } from "vitest";
import { getHumanBotProfile, humanBotPlayStyle } from "@/utils/humanBots";
import { calendarEvents } from "./calendar";
import { buildField, DEFAULT_LEVEL_RANGE, engineEloFor, templateFilters } from "./templates";
import { botRatingAt } from "@/utils/botRating";

describe("templates", () => {
    it("everyone at my level means ±100 by default, and can be changed", () => {
        expect(templateFilters("myLevel", 1500).range).toEqual([1400, 1600]);
        expect(DEFAULT_LEVEL_RANGE).toBe(100);
        expect(templateFilters("myLevel", 1500, { levelRange: 200 }).range).toEqual([1300, 1700]);
    });

    it("fills a field inside the range, catalog bots first, without repeats", () => {
        const filters = templateFilters("myLevel", 1500);
        const field = buildField({
            template: "myLevel",
            opponents: 29,
            userRating: 1500,
            rhythm: "blitz",
            filters,
            seed: 3,
        });
        expect(field).toHaveLength(29);
        expect(new Set(field.map((p) => p.id)).size).toBe(29);
        for (const entrant of field) {
            expect(entrant.rating).toBeGreaterThanOrEqual(1400 - 25);
            expect(entrant.rating).toBeLessThanOrEqual(1600 + 25);
        }
        expect(field.filter((p) => p.kind === "catalog").length).toBeGreaterThan(5);
        // The same seed gives the same field.
        expect(
            buildField({
                template: "myLevel",
                opponents: 29,
                userRating: 1500,
                rhythm: "blitz",
                filters,
                seed: 3,
            }),
        ).toEqual(field);
    });

    it("keeps the favourite above and the underdog below", () => {
        const below = buildField({
            template: "favorite",
            opponents: 9,
            userRating: 1800,
            rhythm: "rapid",
            filters: templateFilters("favorite", 1800),
            seed: 1,
        });
        expect(below.every((p) => p.rating < 1800)).toBe(true);
        const above = buildField({
            template: "allStronger",
            opponents: 9,
            userRating: 1800,
            rhythm: "rapid",
            filters: templateFilters("allStronger", 1800),
            seed: 1,
        });
        expect(above.every((p) => p.rating > 1800)).toBe(true);
    });

    it("gives every opponent the chosen style, generated players included", () => {
        const field = buildField({
            template: "sameStyle",
            opponents: 15,
            userRating: 1500,
            rhythm: "blitz",
            filters: templateFilters("sameStyle", 1500, { play: "guardian" }),
            seed: 9,
        });
        expect(field).toHaveLength(15);
        for (const entrant of field) {
            expect(humanBotPlayStyle(getHumanBotProfile(entrant.id))).toBe("guardian");
        }
    });

    it("puts one giant in the field", () => {
        const field = buildField({
            template: "bigFavorite",
            opponents: 7,
            userRating: 1500,
            rhythm: "blitz",
            filters: templateFilters("bigFavorite", 1500),
            seed: 2,
        });
        const sorted = [...field].sort((a, b) => b.rating - a.rating);
        expect(sorted[0].rating).toBeGreaterThan(1850);
        expect(sorted[1].rating).toBeLessThanOrEqual(1700);
    });

    it("inverts the rhythm formula", () => {
        expect(botRatingAt(engineEloFor(1830, "rapid"), "rapid")).toBeCloseTo(1830, -2);
        expect(engineEloFor(1500, "blitz")).toBe(1500);
    });
});

describe("calendar", () => {
    it("is the same for the same day and changes with the period", () => {
        const day = new Date(2026, 9, 18, 10);
        const later = new Date(2026, 9, 18, 22);
        expect(calendarEvents(day).map((e) => e.slot)).toEqual(
            calendarEvents(later).map((e) => e.slot),
        );
        const [daily, weekly, monthly] = calendarEvents(day);
        expect(daily.slot).toBe("daily-2026-10-18");
        expect(weekly.slot).toBe("weekly-2026-W42");
        expect(monthly.slot).toBe("monthly-2026-10");
        expect(calendarEvents(new Date(2026, 9, 19))[0].slot).not.toBe(daily.slot);
    });
});
