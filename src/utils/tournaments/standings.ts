import { expectedScore } from "./simulation";
import {
    resultPoints,
    type Tournament,
    type TournamentGame,
    type TournamentParticipant,
} from "./types";

export type StandingRow = {
    participant: TournamentParticipant;
    /** Shared ranks are written once: 3 for "3–4". */
    rank: number;
    points: number;
    games: number;
    wins: number;
    buchholz: number;
    buchholzCut1: number;
    sonnebornBerger: number;
    /** Knockout formats: the round where the player was eliminated, `null` if still in. */
    eliminatedInRound: number | null;
};

export type PlayerRecord = {
    points: number;
    games: number;
    wins: number;
    whites: number;
    blacks: number;
    lastColor: "white" | "black" | null;
    opponents: Set<string>;
    hadBye: boolean;
    /** Opponents faced on the board and the score against each. */
    results: { opponent: string; score: number }[];
};

function emptyRecord(): PlayerRecord {
    return {
        points: 0,
        games: 0,
        wins: 0,
        whites: 0,
        blacks: 0,
        lastColor: null,
        opponents: new Set(),
        hadBye: false,
        results: [],
    };
}

/** Points, colors and opponents of every participant from the finished games. */
export function playerRecords(tournament: Tournament): Map<string, PlayerRecord> {
    const records = new Map(
        tournament.participants.map((participant) => [participant.id, emptyRecord()]),
    );
    const games = [...tournament.games].sort((left, right) => left.round - right.round);
    for (const game of games) {
        if (game.result === null) continue;
        const white = records.get(game.white);
        if (game.black === null) {
            if (white) {
                white.hadBye = true;
                white.points += 1;
            }
            continue;
        }
        const black = records.get(game.black);
        if (!white || !black) continue;
        const [whitePoints, blackPoints] = resultPoints(game.result);
        white.points += whitePoints;
        black.points += blackPoints;
        white.games += 1;
        black.games += 1;
        if (whitePoints === 1) white.wins += 1;
        if (blackPoints === 1) black.wins += 1;
        white.whites += 1;
        black.blacks += 1;
        white.lastColor = "white";
        black.lastColor = "black";
        white.opponents.add(game.black);
        black.opponents.add(game.white);
        white.results.push({ opponent: game.black, score: whitePoints });
        black.results.push({ opponent: game.white, score: blackPoints });
    }
    return records;
}

function sum(values: number[]): number {
    return values.reduce((total, value) => total + value, 0);
}

/** Standings with the tiebreaks of each format. */
export function computeStandings(tournament: Tournament): StandingRow[] {
    const records = playerRecords(tournament);
    const pointsOf = (id: string) => records.get(id)?.points ?? 0;
    const knockout = tournament.format === "knockout" || tournament.format === "doubleElimination";
    const eliminated = knockout ? eliminationRounds(tournament) : new Map<string, number>();

    const rows: StandingRow[] = tournament.participants.map((participant) => {
        const record = records.get(participant.id) ?? emptyRecord();
        const opponentPoints = record.results.map((result) => pointsOf(result.opponent));
        const sorted = [...opponentPoints].sort((left, right) => left - right);
        return {
            participant,
            rank: 0,
            points: record.points,
            games: record.games,
            wins: record.wins,
            buchholz: sum(opponentPoints),
            buchholzCut1: sum(sorted.slice(1)),
            sonnebornBerger: sum(
                record.results.map((result) => result.score * pointsOf(result.opponent)),
            ),
            eliminatedInRound: eliminated.get(participant.id) ?? null,
        };
    });

    const compare = (left: StandingRow, right: StandingRow): number => {
        if (knockout) {
            const leftOut = left.eliminatedInRound ?? Number.POSITIVE_INFINITY;
            const rightOut = right.eliminatedInRound ?? Number.POSITIVE_INFINITY;
            if (leftOut !== rightOut) return rightOut - leftOut;
            return left.participant.seed - right.participant.seed;
        }
        if (left.points !== right.points) return right.points - left.points;
        if (tournament.format === "swiss") {
            if (left.buchholzCut1 !== right.buchholzCut1)
                return right.buchholzCut1 - left.buchholzCut1;
            if (left.buchholz !== right.buchholz) return right.buchholz - left.buchholz;
        }
        if (left.sonnebornBerger !== right.sonnebornBerger)
            return right.sonnebornBerger - left.sonnebornBerger;
        if (left.wins !== right.wins) return right.wins - left.wins;
        return left.participant.seed - right.participant.seed;
    };
    rows.sort(compare);

    // Knockouts share the rank of everyone eliminated in the same round.
    rows.forEach((row, index) => {
        if (
            knockout &&
            index > 0 &&
            row.eliminatedInRound !== null &&
            row.eliminatedInRound === rows[index - 1].eliminatedInRound
        ) {
            row.rank = rows[index - 1].rank;
        } else {
            row.rank = index + 1;
        }
    });
    return rows;
}

/**
 * Round where each player left a knockout: single elimination after one lost match, double
 * elimination after the second. The champion is never in the map.
 */
export function eliminationRounds(tournament: Tournament): Map<string, number> {
    const losses = new Map<string, number>();
    const out = new Map<string, number>();
    const limit = tournament.format === "doubleElimination" ? 2 : 1;
    const matches = [...tournament.matches].sort((left, right) => left.round - right.round);
    for (const match of matches) {
        if (!match.winner || match.b === null) continue;
        const loser = match.winner === match.a ? match.b : match.a;
        const count = (losses.get(loser) ?? 0) + 1;
        losses.set(loser, count);
        if (count >= limit && !out.has(loser)) out.set(loser, match.round);
    }
    return out;
}

/** The user's games, in round order. */
export function userGames(tournament: Tournament, userId = "user"): TournamentGame[] {
    return tournament.games
        .filter((game) => game.white === userId || game.black === userId)
        .sort((left, right) => left.round - right.round || left.board - right.board);
}

export type UserPerformance = {
    games: number;
    points: number;
    /** What the ratings predicted before the games. */
    expected: number;
    averageOpponent: number | null;
    /** Tournament performance rating; `null` without games. */
    performance: number | null;
};

/** The user's result against what their rating predicted, and their performance rating. */
export function userPerformance(tournament: Tournament, userId = "user"): UserPerformance {
    const ratings = new Map(tournament.participants.map((p) => [p.id, p.rating]));
    const own = ratings.get(userId) ?? 1500;
    let points = 0;
    let expected = 0;
    const opponents: number[] = [];
    for (const game of userGames(tournament, userId)) {
        if (game.result === null || game.black === null) continue;
        const asWhite = game.white === userId;
        const opponentRating = ratings.get(asWhite ? game.black : game.white) ?? own;
        const [whitePoints, blackPoints] = resultPoints(game.result);
        points += asWhite ? whitePoints : blackPoints;
        expected += expectedScore(own, opponentRating);
        opponents.push(opponentRating);
    }
    if (opponents.length === 0) {
        return { games: 0, points: 0, expected: 0, averageOpponent: null, performance: null };
    }
    const average = sum(opponents) / opponents.length;
    const fraction = Math.min(0.99, Math.max(0.01, points / opponents.length));
    const difference = Math.max(-800, Math.min(800, 400 * Math.log10(fraction / (1 - fraction))));
    return {
        games: opponents.length,
        points,
        expected,
        averageOpponent: Math.round(average),
        performance: Math.round(average + difference),
    };
}
