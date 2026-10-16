/** Engine and Maia access for the generator: batched, cached by position and cancellable. */
import type { EngineOption, MoveAnalysis } from "@/bindings";
import { commands } from "@/bindings";
import type { LocalEngine } from "@/utils/engines";
import { clampMaiaElo } from "@/utils/humanBots";
import { normalizeScore } from "@/utils/score";
import { unwrap } from "@/utils/unwrap";
import { canonicalUci, positionKey, sideToMove } from "./positions";
import type { EngineView } from "./types";

/** Engine lines per position: enough to judge the moves a human is likely to play. */
export const ENGINE_LINES = 5;
/** Maia samples per position: about 1.6 s each with Maia 3 5M on a laptop CPU. */
export const MAIA_SAMPLES = 16;

function settings(engine: LocalEngine): EngineOption[] {
    return (engine.settings ?? [])
        .filter((setting) => setting.value != null)
        .map((setting) => ({ name: setting.name, value: String(setting.value) }));
}

export function engineView(fen: string, analysis: MoveAnalysis | undefined): EngineView | null {
    const turn = sideToMove(fen);
    const lines = (analysis?.best ?? []).flatMap((line) => {
        const first = line.uciMoves[0];
        const uci = first ? canonicalUci(fen, first) : null;
        return uci ? [{ uci, cp: normalizeScore(line.score.value, turn) }] : [];
    });
    if (lines.length === 0) return null;
    return { lines, bestCp: Math.max(...lines.map((line) => line.cp)) };
}

export class EngineEvaluator {
    private views = new Map<string, EngineView | null>();
    constructor(
        readonly engine: LocalEngine,
        private ms: number,
        private id: string,
    ) {}

    /** Views of the positions, from the side to move; only unknown positions reach the engine. */
    async evaluate(fens: string[], lines = ENGINE_LINES): Promise<Array<EngineView | null>> {
        const missing = [
            ...new Set(fens.filter((fen) => !this.views.has(`${lines}|${positionKey(fen)}`))),
        ];
        if (missing.length > 0) {
            const analysis = unwrap(
                await commands.evaluatePositions(
                    this.id,
                    this.engine.path,
                    this.engine.args ?? [],
                    { t: "Time", c: this.ms },
                    missing,
                    lines,
                    settings(this.engine),
                ),
            );
            missing.forEach((fen, index) =>
                this.views.set(`${lines}|${positionKey(fen)}`, engineView(fen, analysis[index])),
            );
        }
        return fens.map((fen) => this.views.get(`${lines}|${positionKey(fen)}`) ?? null);
    }

    cancel() {
        void commands.cancelAnalysis(this.id);
    }
}

/**
 * How often Maia plays each move at an Elo, estimated by sampling (Maia hides its policy). Its
 * process lives until `close`.
 */
export class MaiaSampler {
    private cache = new Map<string, Array<{ uci: string; count: number }>>();
    constructor(
        readonly engine: LocalEngine,
        private elo: number,
        private id: string,
        private samples = MAIA_SAMPLES,
    ) {}

    async frequencies(fens: string[]): Promise<Array<Array<{ uci: string; count: number }>>> {
        const missing = [...new Set(fens.filter((fen) => !this.cache.has(positionKey(fen))))];
        if (missing.length > 0) {
            const elo = String(clampMaiaElo(this.elo));
            const sampled = unwrap(
                await commands.sampleEngineMoves(
                    this.id,
                    this.engine.path,
                    this.engine.args ?? [],
                    missing,
                    this.samples,
                    [
                        { name: "Elo", value: elo },
                        { name: "SelfElo", value: elo },
                        { name: "OppoElo", value: elo },
                    ],
                ),
            );
            missing.forEach((fen, index) =>
                this.cache.set(
                    positionKey(fen),
                    (sampled[index] ?? []).flatMap((move) => {
                        const uci = canonicalUci(fen, move.uci);
                        return uci ? [{ uci, count: move.count }] : [];
                    }),
                ),
            );
        }
        return fens.map((fen) => this.cache.get(positionKey(fen)) ?? []);
    }

    cancel() {
        void commands.cancelAnalysis(this.id);
    }

    /** Ends Maia's process, which stays alive between requests of the same run. */
    close() {
        void commands.closeEngineSampler(this.id);
    }
}
