/**
 * Pairings for the four formats. Round robin uses the circle method (Berger tables); Swiss follows
 * the Dutch idea (score groups, top half against bottom half, no rematches, alternating colors)
 * with a bounded search; knockouts use the usual seeding, 1 against the lowest seed.
 */

export type Pair = { white: string; black: string | null };

/** Round robin, one list of boards per round; a `null` black is a bye (odd number of players). */
export function roundRobinRounds(ids: readonly string[], double: boolean): Pair[][] {
    const players: (string | null)[] = [...ids];
    if (players.length % 2 === 1) players.push(null);
    const size = players.length;
    const rounds: Pair[][] = [];
    for (let round = 0; round < size - 1; round++) {
        const order = [
            ...Array.from({ length: size - 1 }, (_, i) => players[(i + round) % (size - 1)]),
            players[size - 1],
        ];
        const boards: Pair[] = [];
        for (let i = 0; i < size / 2; i++) {
            let white = order[i];
            let black = order[size - 1 - i];
            // The fixed player alternates colors; the rest swap on every other board.
            const swap = i === 0 ? round % 2 === 1 : i % 2 === 1;
            if (swap) [white, black] = [black, white];
            if (white === null) [white, black] = [black, white];
            if (white === null) continue;
            boards.push({ white, black });
        }
        // Real boards first, the bye last.
        boards.sort((left, right) => Number(left.black === null) - Number(right.black === null));
        rounds.push(boards);
    }
    if (!double) return rounds;
    return [
        ...rounds,
        ...rounds.map((boards) =>
            boards.map((pair) =>
                pair.black === null ? pair : { white: pair.black, black: pair.white },
            ),
        ),
    ];
}

export type SwissPlayer = {
    id: string;
    score: number;
    /** Starting rank, 1 = best. */
    seed: number;
    opponents: ReadonlySet<string>;
    /** Games with White minus games with Black. */
    colorBalance: number;
    lastColor: "white" | "black" | null;
    hadBye: boolean;
};

/** Search budget before rematches are allowed; plenty for a few hundred players. */
const SEARCH_LIMIT = 50_000;

function rank(players: readonly SwissPlayer[]): SwissPlayer[] {
    return [...players].sort((left, right) => right.score - left.score || left.seed - right.seed);
}

/** Who gets White: the one who had it less, then the one who had Black last, then the higher seed on odd boards. */
function colorPair(a: SwissPlayer, b: SwissPlayer, board: number): Pair {
    if (a.colorBalance !== b.colorBalance) {
        return a.colorBalance < b.colorBalance
            ? { white: a.id, black: b.id }
            : { white: b.id, black: a.id };
    }
    if (a.lastColor !== b.lastColor && a.lastColor !== null && b.lastColor !== null) {
        return a.lastColor === "black"
            ? { white: a.id, black: b.id }
            : { white: b.id, black: a.id };
    }
    return board % 2 === 1 ? { white: a.id, black: b.id } : { white: b.id, black: a.id };
}

/**
 * Candidates for the first player of the list, best first: same score group and the ideal Dutch
 * opponent (half a group below), then the nearest scores.
 */
function candidates(first: SwissPlayer, rest: readonly SwissPlayer[]): SwissPlayer[] {
    const group = rest.filter((player) => player.score === first.score);
    const ideal = Math.floor((group.length + 1) / 2) - 1;
    const groupIndex = new Map(group.map((player, index) => [player.id, index]));
    return [...rest].sort((left, right) => {
        const scoreGap = Math.abs(left.score - first.score) - Math.abs(right.score - first.score);
        if (scoreGap !== 0) return scoreGap;
        const leftIndex = groupIndex.get(left.id);
        const rightIndex = groupIndex.get(right.id);
        if (leftIndex !== undefined && rightIndex !== undefined) {
            return Math.abs(leftIndex - ideal) - Math.abs(rightIndex - ideal);
        }
        return right.score - left.score || left.seed - right.seed;
    });
}

function searchPairs(
    list: readonly SwissPlayer[],
    allowRematch: boolean,
    budget: { left: number },
): [SwissPlayer, SwissPlayer][] | null {
    if (list.length === 0) return [];
    if (budget.left-- <= 0) return null;
    const [first, ...rest] = list;
    for (const opponent of candidates(first, rest)) {
        if (!allowRematch && first.opponents.has(opponent.id)) continue;
        const remaining = rest.filter((player) => player.id !== opponent.id);
        const tail = searchPairs(remaining, allowRematch, budget);
        if (tail) return [[first, opponent], ...tail];
        if (budget.left <= 0) return null;
    }
    return null;
}

/**
 * Pairings of a Swiss round. With an odd number of players the lowest-ranked one without a bye
 * gets it, never the user if anyone else can take it: the user came to play.
 */
export function swissPairings(players: readonly SwissPlayer[], userId: string): Pair[] {
    let pool = rank(players);
    const pairs: Pair[] = [];
    let bye: SwissPlayer | null = null;
    if (pool.length % 2 === 1) {
        const byOrder = [...pool].reverse();
        bye =
            byOrder.find((player) => !player.hadBye && player.id !== userId) ??
            byOrder.find((player) => player.id !== userId) ??
            byOrder[0];
        pool = pool.filter((player) => player.id !== bye!.id);
    }
    const found =
        searchPairs(pool, false, { left: SEARCH_LIMIT }) ??
        searchPairs(pool, true, { left: SEARCH_LIMIT }) ??
        // Last resort: neighbours in the ranking.
        Array.from({ length: pool.length / 2 }, (_, i): [SwissPlayer, SwissPlayer] => [
            pool[2 * i],
            pool[2 * i + 1],
        ]);
    found.forEach(([a, b], index) => pairs.push(colorPair(a, b, index + 1)));
    if (bye) pairs.push({ white: bye.id, black: null });
    return pairs;
}

/** Seed numbers in bracket order: 1, 16, 8, 9, 4, 13… for 16. */
export function bracketOrder(size: number): number[] {
    let order = [1];
    while (order.length < size) {
        const next = order.length * 2 + 1;
        order = order.flatMap((seed) => [seed, next - seed]);
    }
    return order;
}

/** Smallest power of two that holds `count` players. */
export function bracketSize(count: number): number {
    let size = 1;
    while (size < count) size *= 2;
    return size;
}
