import { useCallback, useEffect, useRef, useState } from "react";
import { commands } from "@/bindings";
import type { LocalEngine } from "@/utils/engines";
import { EngineEvaluator, MaiaSampler } from "@/utils/repertoireGenerator/engines";
import { generateRepertoire } from "@/utils/repertoireGenerator/generate";
import { loadSource } from "@/utils/repertoireGenerator/sources";
import {
    findSurprises,
    type SurpriseConfig,
    type SurpriseResult,
} from "@/utils/repertoireGenerator/surprises";
import type {
    GeneratedRepertoire,
    GeneratorConfig,
    GeneratorProgress,
    StatsSourceConfig,
} from "@/utils/repertoireGenerator/types";

export type RunState =
    | { status: "idle" }
    | { status: "running"; progress: GeneratorProgress | null; startedAt: number }
    | { status: "error"; message: string }
    | { status: "repertoire"; result: GeneratedRepertoire; elapsedMs: number }
    | { status: "surprises"; result: SurpriseResult; elapsedMs: number };

type Engines = { engine: LocalEngine; maia?: LocalEngine; maiaElo: number; token?: string };

/** One generator or surprise run at a time, with its engines closed whatever happens. */
export function useGeneratorRun() {
    const [state, setState] = useState<RunState>({ status: "idle" });
    const controller = useRef<{
        abort: AbortController;
        evaluator?: EngineEvaluator;
        maia?: MaiaSampler;
        id: string;
    } | null>(null);

    const stop = useCallback(() => {
        const current = controller.current;
        if (!current) return;
        current.abort.abort();
        current.evaluator?.cancel();
        current.maia?.cancel();
        void commands.cancelAnalysis(current.id);
        void commands.cancelPositionSearch(current.id);
    }, []);

    useEffect(() => stop, [stop]);

    const prepare = useCallback(
        async (
            source: StatsSourceConfig,
            rootFen: string,
            depth: number,
            minGames: number,
            engines: Engines & { engineMs: number },
        ) => {
            stop();
            const id = `generator-${Date.now()}`;
            const abort = new AbortController();
            const evaluator = new EngineEvaluator(engines.engine, engines.engineMs, `${id}-engine`);
            const maia = engines.maia
                ? new MaiaSampler(engines.maia, engines.maiaElo, `${id}-maia`)
                : undefined;
            controller.current = { abort, evaluator, maia, id };
            const startedAt = Date.now();
            setState({ status: "running", progress: { phase: "source", positions: 0 }, startedAt });
            const loaded = await loadSource(source, rootFen, depth, minGames, {
                id,
                token: engines.token,
                signal: abort.signal,
            });
            return { abort, evaluator, maia, startedAt, source: loaded };
        },
        [stop],
    );

    const finish = useCallback((maia?: MaiaSampler) => {
        maia?.close();
        controller.current = null;
    }, []);

    const fail = useCallback((error: unknown) => {
        const aborted =
            (error instanceof DOMException && error.name === "AbortError") ||
            String(error).toLowerCase().includes("cancel");
        setState(
            aborted
                ? { status: "idle" }
                : {
                      status: "error",
                      message: error instanceof Error ? error.message : String(error),
                  },
        );
    }, []);

    const runRepertoire = useCallback(
        async (config: GeneratorConfig, engines: Engines) => {
            let maia: MaiaSampler | undefined;
            try {
                const prepared = await prepare(
                    config.source,
                    config.rootFen,
                    config.depth,
                    config.minGames,
                    {
                        ...engines,
                        engineMs: config.engineMs,
                    },
                );
                maia = prepared.maia;
                const result = await generateRepertoire(config, {
                    source: prepared.source,
                    evaluator: prepared.evaluator,
                    maia,
                    signal: prepared.abort.signal,
                    onProgress: (progress) =>
                        setState((previous) =>
                            previous.status === "running" ? { ...previous, progress } : previous,
                        ),
                });
                setState({
                    status: "repertoire",
                    result,
                    elapsedMs: Date.now() - prepared.startedAt,
                });
            } catch (error) {
                fail(error);
            } finally {
                finish(maia);
            }
        },
        [fail, finish, prepare],
    );

    const runSurprises = useCallback(
        async (
            config: SurpriseConfig,
            source: StatsSourceConfig,
            engines: Engines & { engineMs: number },
        ) => {
            let maia: MaiaSampler | undefined;
            try {
                const rootFen = config.line[0]?.fen;
                if (!rootFen) throw new Error("Empty line");
                const prepared = await prepare(
                    source,
                    rootFen,
                    Math.min(24, config.line.length + 2),
                    1,
                    engines,
                );
                maia = prepared.maia;
                const result = await findSurprises(config, {
                    source: prepared.source,
                    evaluator: prepared.evaluator,
                    maia,
                    signal: prepared.abort.signal,
                    onProgress: (done) =>
                        setState((previous) =>
                            previous.status === "running"
                                ? { ...previous, progress: { phase: "engine", positions: done } }
                                : previous,
                        ),
                });
                setState({
                    status: "surprises",
                    result,
                    elapsedMs: Date.now() - prepared.startedAt,
                });
            } catch (error) {
                fail(error);
            } finally {
                finish(maia);
            }
        },
        [fail, finish, prepare],
    );

    return { state, setState, runRepertoire, runSurprises, stop };
}
