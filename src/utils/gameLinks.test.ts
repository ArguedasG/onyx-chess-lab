import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/path", () => ({ resolve: vi.fn() }));
vi.mock("@/bindings", () => ({ commands: {} }));
vi.mock("./directories", () => ({ getDatabasesDir: vi.fn() }));

import {
    buildGameLinkUrl,
    gameLinkFor,
    gameLinkIdentity,
    gameLinkMarkdown,
    matchesGameIdentity,
    parseGameLink,
    pliesReachingPosition,
    replaceGameLink,
} from "./gameLinks";

const game = { id: 42, white: "Núñez, José", black: "Carlsen, Magnus", date: "2023.05.01" };

describe("game links", () => {
    it("keeps players and year in new links", () => {
        const link = gameLinkFor(game, "C:/db/masters.db3", 24);
        const parsed = parseGameLink(buildGameLinkUrl(link));
        expect(parsed).toEqual({
            database: "masters.db3",
            gameId: 42,
            ply: 24,
            white: "Núñez, José",
            black: "Carlsen, Magnus",
            year: "2023",
        });
    });

    it("reads the identity of older links from their label", () => {
        const old = parseGameLink("onyx://game?db=masters.db3&id=42&ply=24")!;
        expect(gameLinkIdentity(old, "Carlsen - Nakamura (2023)")).toEqual({
            white: "Carlsen",
            black: "Nakamura",
            year: "2023",
        });
        expect(gameLinkIdentity(old, "Carlsen - Nakamura")).toEqual({
            white: "Carlsen",
            black: "Nakamura",
            year: undefined,
        });
        expect(gameLinkIdentity(old, "Una partida modelo")).toBeNull();
    });

    it("recognises the same game regardless of accents and case", () => {
        const identity = { white: "Nunez, Jose", black: "carlsen, magnus", year: "2023" };
        expect(matchesGameIdentity(identity, game)).toBe(true);
        expect(matchesGameIdentity({ ...identity, year: "2019" }, game)).toBe(false);
        expect(matchesGameIdentity({ ...identity, black: "Caruana, Fabiano" }, game)).toBe(false);
    });

    it("finds the plies where a game reaches a position, nearest to the old ply first", () => {
        const afterE4E5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2";
        expect(pliesReachingPosition("1. e4 e5 2. Nf3 Nc6 *", null, afterE4E5)).toEqual([2]);
        expect(pliesReachingPosition("1. d4 d5 *", null, afterE4E5)).toEqual([]);
        // Knights out and back: the starting position (ignoring counters) appears at plies 0 and 4.
        const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        expect(pliesReachingPosition("1. Nf3 Nf6 2. Ng1 Ng8 *", null, start, 3)).toEqual([4, 0]);
    });

    it("rewrites only the restored link and keeps labels the user wrote", () => {
        const oldUrl = "onyx://game?db=old.db3&id=7&ply=10";
        const other = gameLinkMarkdown("Otra", { database: "x.db3", gameId: 1, ply: 0 });
        const comment = `Idea típica.\n\n[A - B (2001)](${oldUrl})\n\n${other}`;
        const link = gameLinkFor(game, "new.db3", 12);
        const oldLink = parseGameLink(oldUrl)!;
        const next = replaceGameLink(comment, oldLink, link, game);
        expect(next).toBe(
            `Idea típica.\n\n${gameLinkMarkdown("Núñez, José - Carlsen, Magnus (2023)", link)}\n\n${other}`,
        );
        const custom = `[Mi partida favorita](${oldUrl})`;
        expect(replaceGameLink(custom, oldLink, link, game)).toBe(
            gameLinkMarkdown("Mi partida favorita", link),
        );
        expect(replaceGameLink("sin enlace", oldLink, link, game)).toBe("sin enlace");
    });
});
