import { describe, expect, it } from "vitest";
import {
    createTournament,
    nextUserGame,
    type NewTournament,
    recordUserGame,
    withdrawUser,
} from "./engine";
import { bracketOrder, roundRobinRounds, swissPairings, type SwissPlayer } from "./pairing";
import { resultProbabilities, simulateResult } from "./simulation";
import { computeStandings, eliminationRounds, playerRecords, userPerformance } from "./standings";
import { type Tournament, USER_PARTICIPANT_ID } from "./types";

const NOW = "2026-10-18T12:00:00.000Z";

function field(count: number): NewTournament["participants"] {
    const bots = Array.from({ length: count - 1 }, (_, index) => ({
        id: `gen-${index + 1}-${1300 + index * 25}`,
        name: `Bot ${index + 1}`,
        rating: 1300 + index * 25,
        kind: "generated" as const,
    }));
    return [{ id: USER_PARTICIPANT_ID, name: "Tú", rating: 1500, kind: "user" }, ...bots];
}

function create(overrides: Partial<NewTournament> & Pick<NewTournament, "format">, players = 8) {
    return createTournament({
        id: "t1",
        name: "Test",
        template: "custom",
        clock: { seconds: 180_000, increment: 2000 },
        rated: false,
        seed: 7,
        participants: field(players),
        now: NOW,
        ...overrides,
    });
}

/** Plays every user game with the same result until the tournament ends. */
function playOut(tournament: Tournament, result: "win" | "loss" | "draw"): Tournament {
    let current = tournament;
    for (let guard = 0; guard < 200; guard++) {
        const game = nextUserGame(current);
        if (!game) break;
        const userWhite = game.white === USER_PARTICIPANT_ID;
        const outcome =
            result === "draw" ? "1/2-1/2" : (result === "win") === userWhite ? "1-0" : "0-1";
        current = recordUserGame(current, game.id, outcome, null, NOW);
    }
    return current;
}

describe("round robin", () => {
    it("pairs everyone once with balanced colors", () => {
        const ids = ["a", "b", "c", "d", "e", "f"];
        const rounds = roundRobinRounds(ids, false);
        expect(rounds).toHaveLength(5);
        const met = new Set<string>();
        const whites = new Map<string, number>();
        for (const boards of rounds) {
            expect(new Set(boards.flatMap((b) => [b.white, b.black])).size).toBe(6);
            for (const { white, black } of boards) {
                met.add([white, black].sort().join("-"));
                whites.set(white, (whites.get(white) ?? 0) + 1);
            }
        }
        expect(met.size).toBe(15);
        for (const id of ids)
            expect(Math.abs((whites.get(id) ?? 0) * 2 - 5)).toBeLessThanOrEqual(3);
    });

    it("gives a bye each round with an odd number of players", () => {
        const rounds = roundRobinRounds(["a", "b", "c", "d", "e"], false);
        expect(rounds).toHaveLength(5);
        expect(rounds.every((boards) => boards.filter((b) => b.black === null).length === 1)).toBe(
            true,
        );
    });

    it("waits only for the user and finishes after the last round", () => {
        const tournament = create({ format: "roundRobin" }, 6);
        expect(tournament.currentRound).toBe(1);
        expect(nextUserGame(tournament)).not.toBeNull();
        // The other boards wait for the user's game, as if played at the same time.
        expect(tournament.games.some((g) => g.round === 1 && g.mode === "simulated")).toBe(false);
        const first = recordUserGame(tournament, nextUserGame(tournament)!.id, "1-0", null, NOW);
        expect(first.games.some((g) => g.round === 1 && g.mode === "pending")).toBe(false);
        const done = playOut(tournament, "win");
        expect(done.status).toBe("finished");
        const standings = computeStandings(done);
        expect(standings[0].participant.id).toBe(USER_PARTICIPANT_ID);
        expect(standings[0].points).toBe(5);
        expect(done.games.filter((g) => g.mode === "played")).toHaveLength(5);
    });
});

describe("swiss", () => {
    it("avoids rematches and pairs the leaders together", () => {
        let tournament = create({ format: "swiss", swissRounds: 5 }, 20);
        tournament = playOut(tournament, "win");
        expect(tournament.status).toBe("finished");
        const pairs = new Set<string>();
        for (const game of tournament.games) {
            if (game.black === null) continue;
            const key = [game.white, game.black].sort().join("-");
            expect(pairs.has(key)).toBe(false);
            pairs.add(key);
        }
        // Each round everyone plays (20 players, no byes).
        for (let round = 1; round <= 5; round++) {
            expect(tournament.games.filter((g) => g.round === round)).toHaveLength(10);
        }
        expect(computeStandings(tournament)[0].participant.id).toBe(USER_PARTICIPANT_ID);
    });

    it("never gives the bye to the user when someone else can take it", () => {
        const players: SwissPlayer[] = ["user", "a", "b"].map((id, index) => ({
            id,
            score: 0,
            seed: index === 0 ? 3 : index,
            opponents: new Set(),
            colorBalance: 0,
            lastColor: null,
            hadBye: false,
        }));
        const pairs = swissPairings(players, "user");
        const bye = pairs.find((pair) => pair.black === null);
        expect(bye?.white).not.toBe("user");
    });

    it("handles a large open quickly", () => {
        const start = Date.now();
        const tournament = playOut(create({ format: "swiss", swissRounds: 9 }, 100), "draw");
        expect(tournament.status).toBe("finished");
        expect(Date.now() - start).toBeLessThan(3000);
        const records = playerRecords(tournament);
        for (const record of records.values()) {
            expect(Math.abs(record.whites - record.blacks)).toBeLessThanOrEqual(3);
        }
    });

    it("stops pairing a withdrawn user", () => {
        let tournament = create({ format: "swiss", swissRounds: 5 }, 10);
        tournament = withdrawUser(tournament, NOW);
        expect(tournament.status).toBe("finished");
        const userGames = tournament.games.filter(
            (g) => g.white === USER_PARTICIPANT_ID || g.black === USER_PARTICIPANT_ID,
        );
        expect(userGames).toHaveLength(1);
        expect(userGames[0].mode).toBe("forfeit");
    });
});

describe("knockout", () => {
    it("seeds the bracket as usual", () => {
        expect(bracketOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    });

    it("eliminates the user and simulates the rest", () => {
        const tournament = playOut(create({ format: "knockout" }, 8), "loss");
        expect(tournament.status).toBe("finished");
        expect(eliminationRounds(tournament).get(USER_PARTICIPANT_ID)).toBe(1);
        const standings = computeStandings(tournament);
        expect(standings[0].rank).toBe(1);
        expect(standings.filter((row) => row.rank === 5)).toHaveLength(4);
    });

    it("gives byes to the top seeds and crowns a winning user", () => {
        const tournament = playOut(create({ format: "knockout" }, 6), "win");
        expect(tournament.status).toBe("finished");
        const champion = computeStandings(tournament)[0];
        expect(champion.participant.id).toBe(USER_PARTICIPANT_ID);
        expect(tournament.matches.filter((m) => m.round === 1 && m.b === null)).toHaveLength(2);
    });

    it("breaks a tie with an Armageddon game", () => {
        let tournament = create({ format: "knockout", gamesPerMatch: 2 }, 4);
        tournament = recordUserGame(tournament, nextUserGame(tournament)!.id, "1/2-1/2", null, NOW);
        tournament = recordUserGame(tournament, nextUserGame(tournament)!.id, "1/2-1/2", null, NOW);
        const tiebreak = nextUserGame(tournament);
        expect(tiebreak?.armageddon).toBe(true);
        // A draw sends Black through.
        tournament = recordUserGame(tournament, tiebreak!.id, "1/2-1/2", null, NOW);
        const userMatch = tournament.matches.find(
            (m) => m.round === 1 && (m.a === USER_PARTICIPANT_ID || m.b === USER_PARTICIPANT_ID),
        )!;
        expect(userMatch.winner).toBe(tiebreak!.black);
    });
});

describe("double elimination", () => {
    for (const players of [8, 16, 6, 3]) {
        it(`ends with every player but one out after two losses (${players} players)`, () => {
            for (const result of ["win", "loss"] as const) {
                const tournament = playOut(
                    create({ format: "doubleElimination" }, players),
                    result,
                );
                expect(tournament.status).toBe("finished");
                const out = eliminationRounds(tournament);
                expect(out.size).toBe(players - 1);
                const losses = new Map<string, number>();
                for (const match of tournament.matches) {
                    if (!match.winner || match.b === null) continue;
                    const loser = match.winner === match.a ? match.b : match.a;
                    losses.set(loser, (losses.get(loser) ?? 0) + 1);
                }
                for (const count of losses.values()) expect(count).toBeLessThanOrEqual(2);
            }
        });
    }

    it("follows the usual bracket length for 8 players", () => {
        const tournament = playOut(create({ format: "doubleElimination" }, 8), "win");
        // 4 + 2 + 1 winners' matches, 4 + 2 + 1 losers' rounds of 2, 2, 2, 1, 1 and the final.
        expect(tournament.matches.filter((m) => m.bracket === "winners")).toHaveLength(7);
        expect(tournament.matches.filter((m) => m.bracket === "losers")).toHaveLength(6);
        expect(tournament.matches.filter((m) => m.bracket === "final")).toHaveLength(1);
    });
});

describe("model", () => {
    it("favours the stronger player and is reproducible", () => {
        const strong = { id: "gen-1-2000", rating: 2000 };
        const weak = { id: "gen-2-1500", rating: 1500 };
        const probabilities = resultProbabilities(strong, weak);
        expect(probabilities.white).toBeGreaterThan(0.8);
        expect(probabilities.white + probabilities.draw + probabilities.black).toBeCloseTo(1);
        expect(simulateResult(strong, weak, 1, "g")).toBe(simulateResult(strong, weak, 1, "g"));
    });

    it("measures the user's performance", () => {
        const tournament = playOut(create({ format: "roundRobin" }, 6), "draw");
        const performance = userPerformance(tournament);
        expect(performance.games).toBe(5);
        expect(performance.points).toBe(2.5);
        expect(performance.performance).toBe(performance.averageOpponent);
    });
});
