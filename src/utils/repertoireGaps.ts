import {
    canonicalUci,
    playUci,
    positionKey,
    sideToMove,
} from "@/utils/repertoireGenerator/positions";
import type { SourcePosition } from "@/utils/repertoireGenerator/types";

/**
 * Gaps of a repertoire by real frequency (I-34): replies of the opponent that the repertoire does
 * not answer, ordered by how often the student will actually meet them.
 *
 * Only positions where the repertoire already answers something count: where a line simply ends,
 * the preparation ends on purpose and nothing is reported. The weight of a gap is the chance of
 * reaching its position (the product of the opponent's shares along the way; the student's own
 * moves count as certain) times the share of the missing reply.
 */

export type GapSourceLine = { fen: string; moves: string[] };

export type RepertoireNode = {
    key: string;
    fen: string;
    /** First route found from a line start, as canonical UCI and SAN. */
    startFen: string;
    path: string[];
    sans: string[];
    /** Canonical UCI of the moves the repertoire plays or prepares here. */
    covered: Map<string, string>;
};

export type RepertoireGap = {
    /** Position where the reply is missing (opponent to move). */
    fen: string;
    startFen: string;
    path: string[];
    sans: string[];
    move: { uci: string; san: string };
    games: number;
    /** Share of the position's games that play the reply (0–1). */
    share: number;
    /** Chance of reaching the position (0–1). */
    reach: number;
    /** `reach × share`: how often the gap shows up in the student's games. */
    weight: number;
    /** Score of the opponent's reply, from the opponent's side (0–1), when known. */
    opponentScore: number | null;
};

export type GapOptions = {
    color: "white" | "black";
    /** Replies below this share of the position's games are ignored (0–1). */
    minShare: number;
    /** Replies with fewer games are ignored. */
    minGames: number;
    /** Positions asked to the source at most, the most likely first. */
    maxPositions: number;
};

export function buildRepertoireTree(lines: readonly GapSourceLine[]): Map<string, RepertoireNode> {
    const nodes = new Map<string, RepertoireNode>();
    const nodeAt = (fen: string, startFen: string, path: string[], sans: string[]) => {
        const key = positionKey(fen);
        let node = nodes.get(key);
        if (!node) {
            node = { key, fen, startFen, path, sans, covered: new Map() };
            nodes.set(key, node);
        }
        return node;
    };
    for (const line of lines) {
        let fen = line.fen;
        const path: string[] = [];
        const sans: string[] = [];
        let node = nodeAt(fen, line.fen, [], []);
        for (const uci of line.moves) {
            const played = playUci(fen, uci);
            if (!played) break;
            node.covered.set(played.uci, played.san);
            path.push(played.uci);
            sans.push(played.san);
            fen = played.fen;
            node = nodeAt(fen, line.fen, [...path], [...sans]);
        }
    }
    return nodes;
}

function scoreFor(color: "white" | "black", move: SourcePosition["moves"][number]) {
    const total = move.white + move.draws + move.black;
    if (total === 0) return null;
    const wins = color === "white" ? move.white : move.black;
    return (wins + move.draws / 2) / total;
}

/**
 * Walks the repertoire from its roots, most likely positions first, asking the source about each
 * opponent turn. `onGap` receives results as they appear, so a long search shows them early.
 */
export async function findRepertoireGaps(
    lines: readonly GapSourceLine[],
    position: (fen: string) => Promise<SourcePosition | null>,
    options: GapOptions,
    hooks: {
        signal?: AbortSignal;
        onProgress?: (done: number, total: number) => void;
        onGap?: (gap: RepertoireGap) => void;
    } = {},
): Promise<RepertoireGap[]> {
    const nodes = buildRepertoireTree(lines);
    const roots = [...new Set(lines.map((line) => positionKey(line.fen)))];
    const reach = new Map<string, number>(roots.map((key) => [key, 1]));
    const visited = new Set<string>();
    const frontier = [...roots];
    const gaps: RepertoireGap[] = [];
    const opponentNodes = [...nodes.values()].filter(
        (node) => sideToMove(node.fen) !== options.color && node.covered.size > 0,
    ).length;
    const total = Math.min(opponentNodes, options.maxPositions);
    let asked = 0;

    while (frontier.length > 0 && asked < options.maxPositions) {
        if (hooks.signal?.aborted) break;
        // Most likely position first.
        frontier.sort((left, right) => (reach.get(right) ?? 0) - (reach.get(left) ?? 0));
        const key = frontier.shift()!;
        if (visited.has(key)) continue;
        visited.add(key);
        const node = nodes.get(key);
        if (!node || node.covered.size === 0) continue;
        const here = reach.get(key) ?? 0;
        const opponentTurn = sideToMove(node.fen) !== options.color;
        let stats: SourcePosition | null = null;
        if (opponentTurn) {
            stats = await position(node.fen).catch(() => null);
            asked += 1;
            hooks.onProgress?.(asked, total);
        }
        const totalGames = stats?.games ?? 0;
        for (const uci of node.covered.keys()) {
            const played = playUci(node.fen, uci);
            if (!played) continue;
            const childKey = positionKey(played.fen);
            const move = stats?.moves.find((candidate) => candidate.uci === uci);
            // An unknown share keeps the branch visible, but well below the known ones.
            const share = opponentTurn
                ? totalGames > 0 && move
                    ? move.games / totalGames
                    : totalGames > 0
                      ? 0
                      : 0.05
                : 1;
            const childReach = here * share;
            if (childReach > (reach.get(childKey) ?? -1)) reach.set(childKey, childReach);
            if (!visited.has(childKey)) frontier.push(childKey);
        }
        if (!opponentTurn || !stats || totalGames === 0) continue;
        for (const move of stats.moves) {
            const uci = canonicalUci(node.fen, move.uci) ?? move.uci;
            if (node.covered.has(uci)) continue;
            const share = move.games / totalGames;
            if (share < options.minShare || move.games < options.minGames) continue;
            const gap: RepertoireGap = {
                fen: node.fen,
                startFen: node.startFen,
                path: node.path,
                sans: node.sans,
                move: { uci, san: move.san },
                games: move.games,
                share,
                reach: here,
                weight: here * share,
                opponentScore: scoreFor(sideToMove(node.fen), move),
            };
            gaps.push(gap);
            hooks.onGap?.(gap);
        }
    }
    return gaps.sort((left, right) => right.weight - left.weight);
}

/** «1.e4 c5 2.Nf3 d6» from a start position and SAN moves. */
export function formatMoveList(startFen: string, sans: readonly string[], extra?: string) {
    const parts = startFen.split(" ");
    let fullmove = Number(parts[5]) || 1;
    let white = parts[1] !== "b";
    const tokens: string[] = [];
    const all = extra ? [...sans, extra] : sans;
    all.forEach((san, index) => {
        if (white) tokens.push(`${fullmove}.${san}`);
        else {
            tokens.push(index === 0 ? `${fullmove}...${san}` : san);
            fullmove += 1;
        }
        white = !white;
    });
    return tokens.join(" ");
}
