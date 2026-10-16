/**
 * Repertoire generator (I-40): expands the position level by level, choosing one move of the user
 * by the focus and the opponent's likely replies, every user move checked with the engine.
 */
import type { EngineEvaluator, MaiaSampler } from "./engines";
import { isGameOver, playUci, positionKey, sideToMove } from "./positions";
import { difficulty, engineLoss, focusValue, popularReplies, repliesToCover } from "./scoring";
import type { LoadedSource } from "./sources";
import type {
    Difficulty,
    EngineView,
    GeneratedNode,
    GeneratedRepertoire,
    GeneratorConfig,
    GeneratorProgress,
    SourceMove,
    SourcePosition,
} from "./types";

/** Below this many games the move frequencies of a position come from Maia, not from the games. */
export const MIN_GAMES_FOR_FREQUENCIES = 50;
/** User moves compared by an expensive focus (difficulty, theory), the soundest first. */
const MAX_COMPARED = 4;

export type GeneratorDeps = {
    source: LoadedSource;
    evaluator: EngineEvaluator;
    maia?: MaiaSampler;
    signal?: AbortSignal;
    onProgress?: (progress: GeneratorProgress) => void;
};

type Candidate = {
    uci: string;
    san: string;
    fen: string;
    stats?: SourceMove;
    share: number;
    loss: number;
    /** From the user's side. */
    evalCp: number;
};

function abortIfNeeded(signal?: AbortSignal) {
    if (signal?.aborted) throw new DOMException("Generation cancelled", "AbortError");
}

function shareOf(position: SourcePosition | null, uci: string): number {
    if (!position || position.games === 0) return 0;
    const move = position.moves.find((candidate) => candidate.uci === uci);
    const total = position.moves.reduce((sum, candidate) => sum + candidate.games, 0) || 1;
    return move ? (move.games / total) * 100 : 0;
}

/** Difficulty of each position (opponent to move) from the games or from Maia. */
async function difficulties(
    fens: string[],
    deps: GeneratorDeps,
): Promise<Array<Difficulty | null>> {
    if (fens.length === 0) return [];
    const views = await deps.evaluator.evaluate(fens);
    const positions = await Promise.all(fens.map((fen) => deps.source.position(fen, deps.signal)));
    const needMaia = fens.filter(
        (_, index) => (positions[index]?.games ?? 0) < MIN_GAMES_FOR_FREQUENCIES,
    );
    const maiaFrequencies =
        deps.maia && needMaia.length ? await deps.maia.frequencies(needMaia) : [];
    return fens.map((fen, index) => {
        const view = views[index];
        if (!view) return null;
        const position = positions[index];
        if (position && position.games >= MIN_GAMES_FOR_FREQUENCIES) {
            return difficulty(
                view,
                position.moves.map((move) => ({ uci: move.uci, count: move.games })),
                "games",
            );
        }
        const sampled = maiaFrequencies[needMaia.indexOf(fen)];
        return sampled?.length ? difficulty(view, sampled, "maia") : null;
    });
}

/** Sound candidates of a user position with their evaluation from the user's side. */
async function candidates(
    fen: string,
    view: EngineView,
    position: SourcePosition | null,
    config: GeneratorConfig,
    deps: GeneratorDeps,
): Promise<Candidate[]> {
    const known = (position?.moves ?? []).filter((move) => move.games >= config.minGames);
    const engineMoves = view.lines.map((line) => line.uci);
    const ucis = [...new Set([...known.map((move) => move.uci), ...engineMoves])];
    const played = ucis.flatMap((uci) => {
        const next = playUci(fen, uci);
        return next ? [next] : [];
    });
    // Moves the engine did not list are evaluated in the position after them.
    const unlisted = played.filter((move) => engineLoss(view, move.uci) === null);
    const unlistedViews = await deps.evaluator.evaluate(
        unlisted.map((move) => move.fen),
        1,
    );
    return played.flatMap((move) => {
        const listed = view.lines.find((line) => line.uci === move.uci);
        const after = unlistedViews[unlisted.indexOf(move)];
        const evalCp = listed ? listed.cp : after ? -after.bestCp : null;
        if (evalCp === null) return [];
        const loss = Math.max(0, view.bestCp - evalCp);
        if (loss > config.maxLoss) return [];
        return [
            {
                uci: move.uci,
                san: move.san,
                fen: move.fen,
                stats: position?.moves.find((candidate) => candidate.uci === move.uci),
                share: shareOf(position, move.uci),
                loss,
                evalCp,
            },
        ];
    });
}

type Choice = Candidate & {
    reason: "focus" | "engineFallback";
    surprise?: boolean;
    difficulty?: Difficulty;
};

async function chooseUserMove(
    fen: string,
    view: EngineView,
    position: SourcePosition | null,
    config: GeneratorConfig,
    deps: GeneratorDeps,
): Promise<Choice | null> {
    const sound = await candidates(fen, view, position, config, deps);
    if (sound.length === 0) return null;
    const byEngine = [...sound].sort((a, b) => b.evalCp - a.evalCp);
    const engineBest: Choice = { ...byEngine[0], reason: "engineFallback" };
    const known = sound.filter((move) => (move.stats?.games ?? 0) >= config.minGames);
    const color = config.color;

    switch (config.focus) {
        case "engine":
            return known.length
                ? { ...[...known].sort((a, b) => b.evalCp - a.evalCp)[0], reason: "focus" }
                : engineBest;
        case "practical":
        case "score":
        case "solid": {
            if (known.length === 0) return engineBest;
            const best = [...known].sort(
                (a, b) =>
                    focusValue(config.focus, b.stats!, color) -
                        focusValue(config.focus, a.stats!, color) || a.loss - b.loss,
            )[0];
            return { ...best, reason: "focus" };
        }
        case "lowTheory": {
            if (known.length === 0) return engineBest;
            const compared = [...known].sort((a, b) => a.loss - b.loss).slice(0, MAX_COMPARED);
            const after = await Promise.all(
                compared.map((move) => deps.source.position(move.fen, deps.signal)),
            );
            const ranked = compared
                .map((move, index) => ({
                    move,
                    replies: after[index] ? repliesToCover(after[index]!) : 0,
                    score: focusValue("score", move.stats!, color),
                }))
                .sort((a, b) => a.replies - b.replies || b.score - a.score);
            return { ...ranked[0].move, reason: "focus" };
        }
        case "tricky":
        case "surprise": {
            const total = position?.moves.reduce((sum, move) => sum + move.games, 0) ?? 0;
            const pool =
                config.focus === "surprise"
                    ? sound.filter((move) => move.share <= config.surpriseShare)
                    : sound;
            // Out of the source's book a surprise means nothing: play the engine's best.
            if (config.focus === "surprise" && total < config.minGames) return engineBest;
            if (pool.length === 0) {
                if (known.length === 0) return engineBest;
                const best = [...known].sort(
                    (a, b) =>
                        focusValue("practical", b.stats!, color) -
                        focusValue("practical", a.stats!, color),
                )[0];
                return { ...best, reason: "focus" };
            }
            const compared = [...pool].sort((a, b) => a.loss - b.loss).slice(0, MAX_COMPARED);
            deps.onProgress?.({ phase: "maia", positions: 0 });
            const found = await difficulties(
                compared.map((move) => move.fen),
                deps,
            );
            const ranked = compared
                .map((move, index) => ({ move, difficulty: found[index] }))
                .sort(
                    (a, b) =>
                        (a.difficulty?.keepProbability ?? 1) -
                            (b.difficulty?.keepProbability ?? 1) || a.move.loss - b.move.loss,
                );
            const chosen = ranked[0];
            return {
                ...chosen.move,
                reason: "focus",
                surprise: config.focus === "surprise",
                difficulty: chosen.difficulty ?? undefined,
            };
        }
    }
}

/** Opponent replies: the source's most played, or Maia's when the source has too few games. */
async function opponentReplies(
    fen: string,
    position: SourcePosition | null,
    config: GeneratorConfig,
    deps: GeneratorDeps,
): Promise<Array<{ uci: string; share: number; stats?: SourceMove }>> {
    const usePopular =
        config.opponent.mode === "popular" && position && position.games >= config.minGames;
    if (usePopular) {
        return popularReplies(position!, config.opponent, config.minGames).map((move) => ({
            uci: move.uci,
            share: move.share,
            stats: move,
        }));
    }
    if (!deps.maia) return [];
    const [frequencies] = await deps.maia.frequencies([fen]);
    const total = frequencies.reduce((sum, move) => sum + move.count, 0);
    if (total === 0) return [];
    return frequencies
        .map((move) => ({
            uci: move.uci,
            share: (move.count / total) * 100,
            stats: position?.moves.find((candidate) => candidate.uci === move.uci),
        }))
        .filter((move) => move.share >= config.opponent.minShare)
        .slice(0, Math.max(1, config.opponent.maxReplies));
}

function countLeaves(node: GeneratedNode): number {
    return node.children.length === 0
        ? 1
        : node.children.reduce((sum, child) => sum + countLeaves(child), 0);
}

export async function generateRepertoire(
    config: GeneratorConfig,
    deps: GeneratorDeps,
): Promise<GeneratedRepertoire> {
    const root: GeneratedNode = { fen: config.rootFen, uci: "", san: "", by: "root", children: [] };
    const expanded = new Map<string, GeneratedNode>([[positionKey(config.rootFen), root]]);
    let frontier: GeneratedNode[] = [root];
    let positions = 0;

    for (let ply = 0; ply < config.depth && frontier.length > 0; ply += 1) {
        abortIfNeeded(deps.signal);
        const next: GeneratedNode[] = [];
        const open = frontier.filter((node) => !isGameOver(node.fen));
        const userNodes = open.filter((node) => sideToMove(node.fen) === config.color);
        const opponentNodes = open.filter((node) => sideToMove(node.fen) !== config.color);

        deps.onProgress?.({ phase: "engine", positions });
        const views = await deps.evaluator.evaluate(userNodes.map((node) => node.fen));
        for (const [index, node] of userNodes.entries()) {
            abortIfNeeded(deps.signal);
            if (positions >= config.maxPositions) break;
            const view = views[index];
            if (!view) continue;
            const position = await deps.source.position(node.fen, deps.signal);
            const choice = await chooseUserMove(node.fen, view, position, config, deps);
            positions += 1;
            deps.onProgress?.({ phase: "tree", positions });
            if (!choice) continue;
            const child: GeneratedNode = {
                fen: choice.fen,
                uci: choice.uci,
                san: choice.san,
                by: "user",
                stats: choice.stats,
                share: choice.share,
                evalCp: choice.evalCp,
                loss: choice.loss,
                reason: choice.reason,
                surprise: choice.surprise,
                difficulty: choice.difficulty,
                modelGame:
                    choice.stats?.modelGame ??
                    (deps.source.modelGame
                        ? await deps.source.modelGame(choice.fen, deps.signal)
                        : undefined),
                children: [],
            };
            node.children.push(child);
            const key = positionKey(child.fen);
            if (expanded.has(key)) child.transposition = true;
            else {
                expanded.set(key, child);
                next.push(child);
            }
        }

        for (const node of opponentNodes) {
            abortIfNeeded(deps.signal);
            if (positions >= config.maxPositions) break;
            deps.onProgress?.({ phase: "source", positions });
            const position = await deps.source.position(node.fen, deps.signal);
            const replies = await opponentReplies(node.fen, position, config, deps);
            positions += 1;
            for (const reply of replies) {
                const played = playUci(node.fen, reply.uci);
                if (!played) continue;
                const child: GeneratedNode = {
                    fen: played.fen,
                    uci: played.uci,
                    san: played.san,
                    by: "opponent",
                    stats: reply.stats,
                    share: reply.share,
                    children: [],
                };
                node.children.push(child);
                const key = positionKey(child.fen);
                if (expanded.has(key)) child.transposition = true;
                else {
                    expanded.set(key, child);
                    next.push(child);
                }
            }
        }
        frontier = next;
    }

    // An evaluation at the end of every line, for its symbol.
    const leaves: GeneratedNode[] = [];
    const collect = (node: GeneratedNode) => {
        if (node.children.length === 0 && node !== root) leaves.push(node);
        node.children.forEach(collect);
    };
    collect(root);
    const unevaluated = leaves.filter((leaf) => leaf.evalCp === undefined && !isGameOver(leaf.fen));
    if (unevaluated.length) {
        deps.onProgress?.({ phase: "engine", positions });
        const leafViews = await deps.evaluator.evaluate(
            unevaluated.map((leaf) => leaf.fen),
            1,
        );
        unevaluated.forEach((leaf, index) => {
            const view = leafViews[index];
            if (!view) return;
            leaf.evalCp = sideToMove(leaf.fen) === config.color ? view.bestCp : -view.bestCp;
        });
    }
    deps.onProgress?.({ phase: "done", positions });
    return {
        root,
        config,
        generatedAt: new Date().toISOString(),
        positions,
        lines: root.children.length ? countLeaves(root) : 0,
        engineName: deps.evaluator.engine.name,
        maiaName: deps.maia?.engine.name,
        sourceSummary: deps.source.summary
            ? `${deps.source.label} · ${deps.source.summary}`
            : deps.source.label,
    };
}
