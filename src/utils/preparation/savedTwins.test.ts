import { describe, expect, it } from "vitest";
import type { PlayerGameRow } from "@/bindings";
import { twinEntrant } from "@/components/tournaments/creation";
import type { PlayerAnalysisSource } from "@/utils/playerAnalysis";
import { type ProfileGame, toProfileGame } from "@/utils/players/profileGames";
import { resultProbabilities } from "@/utils/tournaments/simulation";
import type { PlayerBooks } from "./book";
import {
    autotuneElos,
    buildProfile,
    fromStoredLines,
    gamesOfProfile,
    latestRating,
    profileKeysOf,
    refreshProfile,
    resolveTwinProfile,
    type SavedTwin,
    savedTwinsFileSchema,
    toStoredLines,
    TWIN_PROFILE_MIN_GAMES,
    twinIdOfParticipant,
    twinParticipantId,
} from "./savedTwins";
import { bookGames } from "./twinBuilder";

const source: PlayerAnalysisSource = {
    databasePath: "rival.db3",
    databaseTitle: "Rival",
    playerId: 1,
    playerName: "Rival",
};

let nextId = 1;
function game(input: Partial<PlayerGameRow> = {}): ProfileGame {
    return toProfileGame(
        {
            id: nextId++,
            playerId: 1,
            isWhite: true,
            opponent: "Opponent",
            opponentId: 2,
            playerElo: 1600,
            opponentElo: 1600,
            date: "2026.01.10",
            time: null,
            event: "Event",
            site: "Site",
            timeControl: "600+5",
            eco: null,
            opening: null,
            plies: 60,
            customStart: false,
            ending: "open",
            playerToMoveAtEnd: false,
            playerLastClock: null,
            opponentLastClock: null,
            structures: [],
            playerThink: null,
            queensOffPly: null,
            endgamePly: null,
            result: "1-0",
            ...input,
        },
        source,
    );
}

function games(count: number, input: Partial<PlayerGameRow>): ProfileGame[] {
    return Array.from({ length: count }, () => game(input));
}

const emptyBooks: PlayerBooks = {
    white: { color: "white", games: 0, positions: new Map(), lines: [] },
    black: { color: "black", games: 0, positions: new Map(), lines: [] },
};

function twinWith(keys: Array<"general" | "bullet" | "blitz" | "rapid" | "classical">): SavedTwin {
    const profiles: SavedTwin["profiles"] = {};
    for (const [index, key] of keys.entries())
        profiles[key] = buildProfile(key, [], emptyBooks, 1500 + index * 100);
    return {
        id: "twin-1",
        cardId: "card",
        playerName: "Rival",
        name: "Rival",
        createdAt: "2026-10-30T00:00:00.000Z",
        updatedAt: "2026-10-30T00:00:00.000Z",
        gamesUsed: 0,
        lastDay: null,
        bookPlies: 20,
        bookRecent: null,
        timing: "player",
        thinking: {},
        profiles,
    };
}

describe("saved twin profiles", () => {
    it("gives a rhythm its own profile only with enough games", () => {
        const blitz = games(TWIN_PROFILE_MIN_GAMES, { timeControl: "180+2" });
        const bullet = games(TWIN_PROFILE_MIN_GAMES - 1, { timeControl: "60+0" });
        const otb = games(30, { timeControl: null });
        expect(profileKeysOf([...blitz, ...bullet, ...otb])).toEqual(["general", "blitz"]);
        // Over-the-board games without a time control only count for the general profile.
        expect(gamesOfProfile([...blitz, ...otb], "general")).toHaveLength(50);
        expect(gamesOfProfile([...blitz, ...otb], "blitz")).toHaveLength(TWIN_PROFILE_MIN_GAMES);
    });

    it("takes the latest rating of the profile's games", () => {
        const older = game({ date: "2025.01.01", playerElo: 1400 });
        const newer = game({ date: "2026.06.01", playerElo: 1750 });
        expect(latestRating([newer, older])).toBe(1750);
        expect(latestRating([game({ playerElo: null })])).toBeNull();
        expect(buildProfile("blitz", [older, newer], emptyBooks, 1500).play).toEqual({
            elo: 1750,
            aggression: 0,
            simplification: 0,
            temperature: 1,
        });
    });

    it("uses the clock's profile, then the nearest rhythm, then every game", () => {
        const twin = twinWith(["general", "blitz", "classical"]);
        expect(resolveTwinProfile(twin, "blitz")).toMatchObject({
            kind: "exact",
            profile: { key: "blitz" },
        });
        // Bullet is nearer blitz; rapid is nearer classical than blitz in think time.
        expect(resolveTwinProfile(twin, "bullet")?.profile.key).toBe("blitz");
        expect(resolveTwinProfile(twin, "bullet")?.kind).toBe("nearest");
        expect(resolveTwinProfile(twin, "rapid")?.profile.key).toBe("classical");
        expect(resolveTwinProfile(twin, null)?.kind).toBe("general");
        expect(resolveTwinProfile(twin, "blitz", "classical")).toMatchObject({
            kind: "chosen",
            profile: { key: "classical" },
        });
        expect(resolveTwinProfile(twinWith(["general"]), "rapid")?.kind).toBe("general");
    });

    it("keeps the user's decisions when a profile is rebuilt", () => {
        const before = buildProfile("blitz", [game({ playerElo: 1500 })], emptyBooks, 1500);
        const after = buildProfile("blitz", [game({ playerElo: 1650 })], emptyBooks, 1500);
        expect(refreshProfile(before, after).play.elo).toBe(1650);
        const edited = {
            ...before,
            play: { ...before.play, aggression: 0.5 },
            origin: "manual" as const,
        };
        const refreshed = refreshProfile(edited, after);
        expect(refreshed.play).toEqual(edited.play);
        expect(refreshed.origin).toBe("manual");
        expect(refreshed.games).toBe(1);
    });

    it("stores the book compactly and reads it back", () => {
        const lines = [
            { moves: ["e2e4", "e7e5"], games: 3 },
            { moves: [], games: 1 },
        ];
        expect(fromStoredLines(toStoredLines(lines))).toEqual(lines);
    });

    it("validates the saved file", () => {
        const file = { version: 1, twins: [twinWith(["general", "blitz"])] };
        expect(savedTwinsFileSchema.safeParse(JSON.parse(JSON.stringify(file))).success).toBe(true);
        const broken = { version: 1, twins: [{ ...file.twins[0], bookPlies: 99 }] };
        expect(savedTwinsFileSchema.safeParse(broken).success).toBe(false);
    });

    it("tries ratings around the profile's, within Maia's range", () => {
        expect(autotuneElos(1500)).toEqual({ base: 1500, extra: [1300, 1400, 1600, 1700] });
        expect(autotuneElos(650).extra).toEqual([600, 750, 850]);
        // Above Maia the strength filter plays: no rating to fit.
        expect(autotuneElos(2700).extra).toEqual([]);
    });

    it("builds the book from the most recent games of each color", () => {
        const white = [
            game({ date: "2026.01.01" }),
            game({ date: "2026.03.01" }),
            game({ date: "2026.02.01" }),
        ];
        const black = [game({ date: "2026.01.05", isWhite: false })];
        const picked = bookGames([...white, ...black], 2);
        expect(picked.map((entry) => entry.day)).toEqual([
            "2026-03-01",
            "2026-02-01",
            "2026-01-05",
        ]);
        expect(bookGames(white, null)).toHaveLength(3);
    });
});

describe("twins in tournaments", () => {
    it("enter with the rating of the tournament's rhythm and no personality", () => {
        const twin = twinWith(["general", "blitz", "classical"]);
        const entrant = twinEntrant(twin, "classical");
        expect(entrant).toEqual({
            id: twinParticipantId("twin-1"),
            name: "Rival",
            rating: 1700,
            kind: "twin",
        });
        expect(twinIdOfParticipant(entrant.id)).toBe("twin-1");
        expect(twinIdOfParticipant("rematador-1500")).toBeNull();
        const asUser = resultProbabilities(
            { id: "user", rating: 1700 },
            { id: "user", rating: 1700 },
        );
        expect(
            resultProbabilities({ id: entrant.id, rating: 1700 }, { id: "user", rating: 1700 }),
        ).toEqual(asUser);
    });
});
