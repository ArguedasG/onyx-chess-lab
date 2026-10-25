import {
    bracketOrder,
    bracketSize,
    type Pair,
    roundRobinRounds,
    type SwissPlayer,
    swissPairings,
} from "./pairing";
import { hashText, seededRandom } from "./random";
import { simulateResult } from "./simulation";
import { playerRecords } from "./standings";
import {
    resultPoints,
    type Tournament,
    type TournamentBracket,
    type TournamentFormat,
    type TournamentGame,
    type TournamentMatch,
    type TournamentParticipant,
    type TournamentResult,
    type TournamentTemplate,
    USER_PARTICIPANT_ID,
} from "./types";

/**
 * The life of a tournament. Only the user's games wait for the board; every other board is
 * resolved by the model as soon as nothing else depends on it, so a round ends the moment the
 * user's game ends.
 */

export type NewTournament = {
    id: string;
    name: string;
    format: TournamentFormat;
    template: TournamentTemplate;
    clock: { seconds: number; increment: number };
    rated: boolean;
    seed: number;
    /** All the players, the user included; seeds are given by rating. */
    participants: Omit<TournamentParticipant, "seed">[];
    doubleRoundRobin?: boolean;
    /** Swiss only. */
    swissRounds?: number;
    /** Knockout formats only. */
    gamesPerMatch?: number;
    calendarSlot?: string | null;
    now: string;
};

export function isKnockout(format: TournamentFormat): boolean {
    return format === "knockout" || format === "doubleElimination";
}

/** Rounds a round robin or a single knockout will have; Swiss uses its planned rounds. */
export function plannedRoundsFor(
    format: TournamentFormat,
    players: number,
    options: { doubleRoundRobin?: boolean; swissRounds?: number } = {},
): number {
    switch (format) {
        case "roundRobin":
            return (players % 2 === 0 ? players - 1 : players) * (options.doubleRoundRobin ? 2 : 1);
        case "swiss":
            return Math.max(1, Math.min(options.swissRounds ?? 5, players - 1));
        case "knockout":
            return Math.max(1, Math.log2(bracketSize(players)));
        case "doubleElimination":
            // Usual length: the winners' rounds, twice as many in the losers' bracket and the final.
            return Math.max(1, 2 * Math.log2(bracketSize(players)) + 1);
    }
}

export function createTournament(input: NewTournament): Tournament {
    const participants: TournamentParticipant[] = [...input.participants]
        .sort((left, right) => right.rating - left.rating || left.name.localeCompare(right.name))
        .map((participant, index) => ({ ...participant, seed: index + 1 }));
    const tournament: Tournament = {
        schemaVersion: 1,
        id: input.id,
        name: input.name,
        createdAt: input.now,
        updatedAt: input.now,
        format: input.format,
        template: input.template,
        doubleRoundRobin: input.format === "roundRobin" && Boolean(input.doubleRoundRobin),
        plannedRounds: plannedRoundsFor(input.format, participants.length, {
            doubleRoundRobin: input.doubleRoundRobin,
            swissRounds: input.swissRounds,
        }),
        gamesPerMatch: isKnockout(input.format)
            ? Math.min(2, Math.max(1, input.gamesPerMatch ?? 1))
            : 1,
        clock: input.clock,
        rated: input.rated,
        seed: input.seed >>> 0,
        calendarSlot: input.calendarSlot ?? null,
        participants,
        games: [],
        matches: [],
        currentRound: 0,
        status: "active",
        userWithdrawn: false,
    };
    if (input.format === "roundRobin") {
        // Drawing of lots for the Berger numbers, reproducible from the seed.
        const next = seededRandom(hashText(`${tournament.seed}:lots`));
        const order = participants
            .map((participant) => ({ id: participant.id, key: next() }))
            .sort((left, right) => left.key - right.key)
            .map((entry) => entry.id);
        roundRobinRounds(order, tournament.doubleRoundRobin).forEach((boards, index) => {
            tournament.games.push(...boardsToGames(boards, index + 1));
        });
        tournament.currentRound = 1;
        return advance(tournament, input.now);
    }
    return advance(startNextRound(tournament), input.now);
}

function boardsToGames(
    boards: Pair[],
    round: number,
    matchId: string | null = null,
): TournamentGame[] {
    return boards.map((pair, index) => ({
        id: `r${round}-b${index + 1}`,
        round,
        board: index + 1,
        white: pair.white,
        black: pair.black,
        result: pair.black === null ? "1-0" : null,
        mode: pair.black === null ? "bye" : "pending",
        matchId,
        armageddon: false,
        pgn: null,
        playedAt: null,
    }));
}

const involvesUser = (game: TournamentGame) =>
    game.white === USER_PARTICIPANT_ID || game.black === USER_PARTICIPANT_ID;

/** The user's next game to play, if the tournament is waiting for one. */
export function nextUserGame(tournament: Tournament): TournamentGame | null {
    if (tournament.status !== "active" || tournament.userWithdrawn) return null;
    return (
        tournament.games
            .filter(
                (game) =>
                    game.round === tournament.currentRound &&
                    game.mode === "pending" &&
                    involvesUser(game),
            )
            .sort((left, right) => left.board - right.board)[0] ?? null
    );
}

function participantMap(tournament: Tournament) {
    return new Map(tournament.participants.map((participant) => [participant.id, participant]));
}

/** Records the user's game played on the board and moves the tournament on. */
export function recordUserGame(
    tournament: Tournament,
    gameId: string,
    result: TournamentResult,
    pgn: string | null,
    now: string,
): Tournament {
    const game = tournament.games.find((candidate) => candidate.id === gameId);
    if (!game || game.mode !== "pending" || !involvesUser(game)) return tournament;
    const next: Tournament = {
        ...tournament,
        games: tournament.games.map((candidate) =>
            candidate.id === gameId
                ? { ...candidate, result, mode: "played" as const, pgn, playedAt: now }
                : candidate,
        ),
    };
    return advance(next, now);
}

/**
 * The user leaves the tournament: their pending games are lost by forfeit, they are not paired
 * again, and the rest is simulated to the end.
 */
export function withdrawUser(tournament: Tournament, now: string): Tournament {
    if (tournament.status !== "active") return tournament;
    return advance({ ...tournament, userWithdrawn: true }, now);
}

function forfeit(game: TournamentGame): TournamentGame {
    const userIsWhite = game.white === USER_PARTICIPANT_ID;
    return { ...game, result: userIsWhite ? "0-1" : "1-0", mode: "forfeit" };
}

/**
 * Resolves everything that does not wait for the user, round after round: the model plays the
 * other boards, knockout matches get their tiebreaks and winners, and the next round is paired.
 */
export function advance(input: Tournament, now: string): Tournament {
    let tournament: Tournament = { ...input, games: [...input.games], matches: [...input.matches] };
    const participants = participantMap(tournament);
    for (let guard = 0; guard < 1000 && tournament.status === "active"; guard++) {
        const round = tournament.currentRound;
        // The other boards are revealed when the user's game ends, as if played at the same time.
        const userWaits =
            !tournament.userWithdrawn &&
            tournament.games.some(
                (game) => game.round === round && game.mode === "pending" && involvesUser(game),
            );
        if (userWaits) break;
        tournament.games = tournament.games.map((game) => {
            if (game.round !== round || game.mode !== "pending") return game;
            if (involvesUser(game)) return tournament.userWithdrawn ? forfeit(game) : game;
            return {
                ...game,
                result: simulateResult(
                    participants.get(game.white)!,
                    participants.get(game.black!)!,
                    tournament.seed,
                    game.id,
                ),
                mode: "simulated",
            };
        });
        if (tournament.games.some((game) => game.round === round && game.mode === "pending")) break;
        if (isKnockout(tournament.format)) {
            const settled = settleMatches(tournament);
            tournament = settled.tournament;
            if (settled.addedGames) continue;
        }
        tournament = startNextRound(tournament);
    }
    return { ...tournament, updatedAt: now };
}

/** Pairs the next round, or finishes the tournament when there is none. */
function startNextRound(tournament: Tournament): Tournament {
    const round = tournament.currentRound + 1;
    const finished = { ...tournament, status: "finished" as const };
    switch (tournament.format) {
        case "roundRobin":
            return round > tournament.plannedRounds
                ? finished
                : { ...tournament, currentRound: round };
        case "swiss": {
            if (round > tournament.plannedRounds) return finished;
            const records = playerRecords(tournament);
            const players: SwissPlayer[] = tournament.participants
                .filter(
                    (participant) =>
                        !(tournament.userWithdrawn && participant.id === USER_PARTICIPANT_ID),
                )
                .map((participant) => {
                    const record = records.get(participant.id)!;
                    return {
                        id: participant.id,
                        score: record.points,
                        seed: participant.seed,
                        opponents: record.opponents,
                        colorBalance: record.whites - record.blacks,
                        lastColor: record.lastColor,
                        hadBye: record.hadBye,
                    };
                });
            const pairs = swissPairings(players, USER_PARTICIPANT_ID);
            return {
                ...tournament,
                currentRound: round,
                games: [...tournament.games, ...boardsToGames(pairs, round)],
            };
        }
        case "knockout":
            return knockoutRound(tournament, round) ?? finished;
        case "doubleElimination":
            return doubleEliminationRound(tournament, round) ?? finished;
    }
}

// --- Knockout formats ---

function matchGames(tournament: Tournament, match: TournamentMatch): TournamentGame[] {
    if (match.b === null) return [];
    const next = seededRandom(hashText(`${tournament.seed}:${match.id}:colors`));
    const aWhite = next() < 0.5;
    return Array.from({ length: tournament.gamesPerMatch }, (_, index) => {
        const white = (index % 2 === 0) === aWhite ? match.a : match.b!;
        return {
            id: `${match.id}-g${index + 1}`,
            round: match.round,
            board: index + 1,
            white,
            black: white === match.a ? match.b : match.a,
            result: null,
            mode: "pending" as const,
            matchId: match.id,
            armageddon: false,
            pgn: null,
            playedAt: null,
        };
    });
}

function addMatches(
    tournament: Tournament,
    round: number,
    entries: { bracket: TournamentBracket; a: string; b: string | null }[],
): Tournament {
    const matches: TournamentMatch[] = entries.map((entry, index) => ({
        id: `r${round}-${entry.bracket}-m${index + 1}`,
        round,
        bracket: entry.bracket,
        a: entry.a,
        b: entry.b,
        winner: entry.b === null ? entry.a : null,
    }));
    // Boards are numbered in order across the whole round.
    const games = matches
        .flatMap((match) => matchGames(tournament, match))
        .map((game, index) => ({ ...game, board: index + 1 }));
    return {
        ...tournament,
        currentRound: round,
        matches: [...tournament.matches, ...matches],
        games: [...tournament.games, ...games],
    };
}

/**
 * Winners of the finished matches of the round. A tied match gets one Armageddon game: White
 * must win, a draw sends Black through. Returns whether games were added.
 */
function settleMatches(tournament: Tournament): { tournament: Tournament; addedGames: boolean } {
    const round = tournament.currentRound;
    const games = [...tournament.games];
    let addedGames = false;
    const matches = tournament.matches.map((match) => {
        if (match.round !== round || match.winner !== null || match.b === null) return match;
        const played = games.filter((game) => game.matchId === match.id);
        const armageddon = played.find((game) => game.armageddon);
        if (armageddon?.result) {
            return {
                ...match,
                winner: armageddon.result === "1-0" ? armageddon.white : armageddon.black!,
            };
        }
        let aPoints = 0;
        let bPoints = 0;
        for (const game of played) {
            if (!game.result) continue;
            const [whitePoints, blackPoints] = resultPoints(game.result);
            aPoints += game.white === match.a ? whitePoints : blackPoints;
            bPoints += game.white === match.b ? whitePoints : blackPoints;
        }
        if (aPoints !== bPoints) return { ...match, winner: aPoints > bPoints ? match.a : match.b };
        // Armageddon: the player who had Black in the first game takes White.
        const first = played[0];
        const white = first ? first.black! : match.a;
        games.push({
            id: `${match.id}-armageddon`,
            round,
            board: Math.max(0, ...games.filter((g) => g.round === round).map((g) => g.board)) + 1,
            white,
            black: white === match.a ? match.b : match.a,
            result: null,
            mode: "pending",
            matchId: match.id,
            armageddon: true,
            pgn: null,
            playedAt: null,
        });
        addedGames = true;
        return match;
    });
    return { tournament: { ...tournament, matches, games }, addedGames };
}

function seededBracket(tournament: Tournament): { a: string; b: string | null }[] {
    const bySeed = [...tournament.participants].sort((left, right) => left.seed - right.seed);
    const size = bracketSize(bySeed.length);
    const order = bracketOrder(size);
    const entries: { a: string; b: string | null }[] = [];
    for (let i = 0; i < order.length; i += 2) {
        const a = bySeed[order[i] - 1]?.id ?? null;
        const b = bySeed[order[i + 1] - 1]?.id ?? null;
        if (a === null && b === null) continue;
        entries.push(a === null ? { a: b!, b: null } : { a, b });
    }
    return entries;
}

function bracketMatches(tournament: Tournament, bracket: TournamentBracket): TournamentMatch[] {
    return tournament.matches.filter((match) => match.bracket === bracket);
}

/** Winners of the latest round of a bracket, in bracket order. */
function latestWinners(tournament: Tournament, bracket: TournamentBracket): string[] {
    const matches = bracketMatches(tournament, bracket);
    if (matches.length === 0) return [];
    const last = Math.max(...matches.map((match) => match.round));
    return matches
        .filter((match) => match.round === last)
        .map((match) => match.winner)
        .filter((winner): winner is string => winner !== null);
}

function pairInOrder(players: string[]): { a: string; b: string | null }[] {
    const entries: { a: string; b: string | null }[] = [];
    for (let i = 0; i < players.length; i += 2) {
        entries.push({ a: players[i], b: players[i + 1] ?? null });
    }
    return entries;
}

function knockoutRound(tournament: Tournament, round: number): Tournament | null {
    if (round === 1) {
        return addMatches(
            tournament,
            round,
            seededBracket(tournament).map((entry) => ({ bracket: "main" as const, ...entry })),
        );
    }
    const winners = latestWinners(tournament, "main");
    if (winners.length <= 1) return null;
    return addMatches(
        tournament,
        round,
        pairInOrder(winners).map((entry) => ({ bracket: "main" as const, ...entry })),
    );
}

/**
 * Double elimination, paired round by round from the results: the winners' bracket as in a
 * knockout; in the losers' bracket, players dropping from the winners' bracket meet the survivors
 * when there are as many of each, and otherwise the larger group plays among itself; the two
 * champions meet in the final, replayed once if the losers' champion wins it.
 */
function doubleEliminationRound(tournament: Tournament, round: number): Tournament | null {
    if (round === 1) {
        return addMatches(
            tournament,
            round,
            seededBracket(tournament).map((entry) => ({ bracket: "winners" as const, ...entry })),
        );
    }
    const final = bracketMatches(tournament, "final")[0];
    if (final) {
        if (bracketMatches(tournament, "reset").length > 0) return null;
        const winnersChampion = final.a;
        if (final.winner === winnersChampion) return null;
        return addMatches(tournament, round, [{ bracket: "reset", a: final.a, b: final.b }]);
    }

    const losses = new Map<string, number>();
    /** Round of the loss that sent each player to the losers' bracket. */
    const droppedIn = new Map<string, number>();
    const playedLosers = new Set<string>();
    for (const match of tournament.matches) {
        if (match.bracket === "losers") {
            playedLosers.add(match.a);
            if (match.b) playedLosers.add(match.b);
        }
        if (!match.winner || match.b === null) continue;
        const loser = match.winner === match.a ? match.b : match.a;
        losses.set(loser, (losses.get(loser) ?? 0) + 1);
        if (match.bracket === "winners") droppedIn.set(loser, match.round);
    }
    const seeds = new Map(tournament.participants.map((p) => [p.id, p.seed]));
    const bySeed = (left: string, right: string) =>
        (seeds.get(left) ?? 0) - (seeds.get(right) ?? 0);

    const winnersAlive = latestWinners(tournament, "winners");
    const oneLoss = tournament.participants
        .map((participant) => participant.id)
        .filter((id) => losses.get(id) === 1);
    const survivors = oneLoss.filter((id) => playedLosers.has(id)).sort(bySeed);
    // Players who dropped in earlier rounds go first; later ones wait, as in the usual bracket.
    const waiting = oneLoss.filter((id) => !playedLosers.has(id));
    const earliest = Math.min(...waiting.map((id) => droppedIn.get(id) ?? 0));
    const dropIns = waiting.filter((id) => (droppedIn.get(id) ?? 0) === earliest).sort(bySeed);

    if (winnersAlive.length <= 1 && oneLoss.length <= 1) {
        if (winnersAlive.length === 1 && oneLoss.length === 1) {
            return addMatches(tournament, round, [
                { bracket: "final", a: winnersAlive[0], b: oneLoss[0] },
            ]);
        }
        return null;
    }

    const entries: { bracket: TournamentBracket; a: string; b: string | null }[] = [];
    if (winnersAlive.length > 1) {
        entries.push(
            ...pairInOrder(winnersAlive).map((entry) => ({
                bracket: "winners" as const,
                ...entry,
            })),
        );
    }
    let losersPairs: { a: string; b: string | null }[] = [];
    if (survivors.length > 0 && survivors.length === dropIns.length) {
        // Survivors against the players who just dropped, crossed to avoid quick rematches.
        losersPairs = survivors.map((id, index) => ({
            a: id,
            b: dropIns[dropIns.length - 1 - index],
        }));
    } else if (survivors.length > dropIns.length) {
        losersPairs = topAgainstBottom(survivors);
    } else {
        const pool = [...survivors, ...dropIns].sort(bySeed);
        if (pool.length > 1 || (pool.length === 1 && winnersAlive.length > 1)) {
            losersPairs = topAgainstBottom(pool);
        }
    }
    entries.push(...losersPairs.map((entry) => ({ bracket: "losers" as const, ...entry })));
    if (entries.length === 0) return null;
    return addMatches(tournament, round, entries);
}

/** 1 against the last, 2 against the second to last…; the best seed gets the bye. */
function topAgainstBottom(players: string[]): { a: string; b: string | null }[] {
    const entries: { a: string; b: string | null }[] = [];
    const list = [...players];
    if (list.length % 2 === 1) entries.push({ a: list.shift()!, b: null });
    while (list.length > 0) entries.push({ a: list.shift()!, b: list.pop()! });
    return entries;
}

/** Name of a knockout round from the players still in it. */
export function knockoutStage(
    tournament: Tournament,
    round: number,
): "final" | "semifinal" | "quarterfinal" | "roundOf16" | null {
    if (tournament.format !== "knockout") return null;
    const matches = tournament.matches.filter((match) => match.round === round);
    const players = matches.length * 2;
    if (players === 2) return "final";
    if (players === 4) return "semifinal";
    if (players === 8) return "quarterfinal";
    if (players === 16) return "roundOf16";
    return null;
}
