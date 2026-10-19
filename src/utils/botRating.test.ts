import { describe, expect, it } from "vitest";
import {
    applyRatedGame,
    botRatingAt,
    EMPTY_BOT_RATINGS,
    INITIAL_PLAYER_RATING,
    isProvisional,
    ratedGameBlocker,
    rhythmOf,
    updateRating,
} from "./botRating";

describe("rhythms", () => {
    it("classifies games as Lichess does", () => {
        expect(rhythmOf(60, 0)).toBe("bullet");
        expect(rhythmOf(180, 2)).toBe("blitz");
        expect(rhythmOf(300, 0)).toBe("blitz");
        expect(rhythmOf(600, 5)).toBe("rapid");
        expect(rhythmOf(900, 10)).toBe("rapid");
        expect(rhythmOf(1800, 0)).toBe("classical");
        expect(rhythmOf(1800, 30)).toBe("classical");
    });

    it("lowers the bot rating more in slower rhythms and for stronger bots", () => {
        expect(botRatingAt(2000, "blitz")).toBe(2000);
        expect(botRatingAt(2000, "rapid")).toBe(1830);
        expect(botRatingAt(2000, "classical")).toBe(1675);
        expect(botRatingAt(2800, "rapid")).toBe(2574);
        expect(botRatingAt(2800, "classical")).toBe(2355);
        expect(botRatingAt(1000, "classical")).toBe(825);
    });
});

describe("Glicko-2", () => {
    it("raises the rating and narrows the deviation after beating a weaker opponent", () => {
        // Player 1500 (RD 200) beats a 1400: the rating rises and the deviation shrinks.
        const player = { ...INITIAL_PLAYER_RATING, deviation: 200 };
        const after = updateRating(player, 1400, 1, "2026-10-18T00:00:00Z");
        expect(after.rating).toBeGreaterThan(1550);
        expect(after.rating).toBeLessThan(1600);
        expect(after.deviation).toBeLessThan(200);
        expect(after.games).toBe(1);
    });

    it("is symmetric for wins and losses against an equal opponent", () => {
        const win = updateRating(INITIAL_PLAYER_RATING, 1500, 1, "t");
        const loss = updateRating(INITIAL_PLAYER_RATING, 1500, 0, "t");
        const draw = updateRating(INITIAL_PLAYER_RATING, 1500, 0.5, "t");
        expect(win.rating - 1500).toBeCloseTo(1500 - loss.rating, 6);
        expect(draw.rating).toBeCloseTo(1500, 6);
    });

    it("leaves the provisional state after several games", () => {
        let rating = INITIAL_PLAYER_RATING;
        expect(isProvisional(rating)).toBe(true);
        for (let i = 0; i < 15; i++) rating = updateRating(rating, 1600, i % 2, "t");
        expect(isProvisional(rating)).toBe(false);
    });

    it("records each rated game once, in its rhythm", () => {
        const game = {
            gameId: "g1",
            recordedAt: "t",
            rhythm: "rapid" as const,
            profileId: "vera",
            botRating: 1395,
            score: 1,
        };
        const first = applyRatedGame(EMPTY_BOT_RATINGS, game);
        expect(first.event?.before).toBe(1500);
        expect(first.state.ratings.rapid.games).toBe(1);
        expect(first.state.ratings.blitz.games).toBe(0);
        const again = applyRatedGame(first.state, game);
        expect(again.event).toBeNull();
        expect(again.state).toBe(first.state);
    });
});

describe("rated games", () => {
    const ok = {
        againstCatalogBot: true,
        fromStartPosition: true,
        playerClock: { seconds: 600_000, increment: 5_000 },
        botClock: { seconds: 600_000, increment: 5_000 },
        openingBook: false,
        verifier: true,
    };

    it("allows a standard game against a catalog bot", () => {
        expect(ratedGameBlocker(ok)).toBeNull();
    });

    it("explains why a game cannot be rated", () => {
        expect(ratedGameBlocker({ ...ok, againstCatalogBot: false })).toBe("notAgainstBot");
        expect(ratedGameBlocker({ ...ok, guided: true })).toBe("guided");
        expect(ratedGameBlocker({ ...ok, fromStartPosition: false })).toBe("customPosition");
        expect(ratedGameBlocker({ ...ok, botClock: undefined })).toBe("noClock");
        expect(ratedGameBlocker({ ...ok, botClock: { seconds: 300_000 } })).toBe("differentClocks");
        const bullet = { seconds: 60_000, increment: 0 };
        expect(ratedGameBlocker({ ...ok, playerClock: bullet, botClock: bullet })).toBe("bullet");
        expect(ratedGameBlocker({ ...ok, openingBook: true })).toBe("openingBook");
        expect(ratedGameBlocker({ ...ok, verifier: false })).toBe("noVerifier");
    });
});
