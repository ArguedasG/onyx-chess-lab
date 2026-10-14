import { describe, expect, it } from "vitest";
import {
    appendGameLink,
    buildGameLinkUrl,
    gameLinkLabel,
    gameLinkMarkdown,
    parseGameLink,
} from "@/utils/gameLinks";

describe("game links", () => {
    it("round-trips a link and keeps only the database file name", () => {
        const url = buildGameLinkUrl({
            database: String.raw`C:\Users\me\databases\Masters (2024).db3`,
            gameId: 42,
            ply: 24,
        });
        expect(url).not.toMatch(/[()\s]/);
        expect(parseGameLink(url)).toEqual({ database: "Masters (2024).db3", gameId: 42, ply: 24 });
    });

    it("rejects other links and malformed ids", () => {
        expect(parseGameLink("https://lichess.org")).toBeNull();
        expect(parseGameLink("onyx://game?db=a.db3&id=abc")).toBeNull();
        expect(parseGameLink(undefined)).toBeNull();
    });

    it("writes Markdown that is safe inside a PGN comment", () => {
        const markdown = gameLinkMarkdown("Carlsen {x} - [Nakamura]", {
            database: "masters.db3",
            gameId: 7,
            ply: 0,
        });
        expect(markdown).toBe("[Carlsen x - Nakamura](onyx://game?db=masters.db3&id=7&ply=0)");
        expect(appendGameLink("Compare with", markdown)).toBe(`Compare with\n\n${markdown}`);
        expect(appendGameLink("", markdown)).toBe(markdown);
        expect(gameLinkLabel({ white: "A", black: "B", date: "2023.05.01" })).toBe("A - B (2023)");
    });
});
