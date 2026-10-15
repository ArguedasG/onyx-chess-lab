import type { DrawShape } from "@lichess-org/chessground/draw";
import type { Color } from "chessops";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useContext, useMemo } from "react";
import { useStore } from "zustand";
import { TreeStateContext } from "@/components/common/TreeStateContext";
import { currentTabAtom, enableAllAtom, enginesAtom, retroFamily } from "@/state/atoms";
import {
    collectRetroMistakes,
    findRetroBest,
    findRetroRefutation,
    judgeRetroMove,
    newRetroState,
    pickReferenceEngine,
    type RetroState,
    retroShapes,
    samePath,
} from "@/utils/retro";
import { playCorrectSound } from "@/utils/sound";

export function useCurrentRetro() {
    const tab = useAtomValue(currentTabAtom);
    return useAtom(retroFamily(tab?.value ?? ""));
}

const parentPath = (retro: RetroState) => retro.items[retro.index]?.path.slice(0, -1) ?? [];

/**
 * Board side of "learn from your mistakes": while the board shows the current exercise,
 * moves are judged by the engine instead of being added to the game.
 */
/**
 * Once an exercise is answered, looks up how the original mistake is punished so the panel can
 * explain it and the board can show it. Failures only leave the explanation shorter.
 */
function useRetroRefutation() {
    const [, setRetro] = useCurrentRetro();
    const storedEngines = useAtomValue(enginesAtom);
    return useCallback(
        async (state: RetroState, index: number) => {
            const item = state.items[index];
            const engine = pickReferenceEngine(storedEngines ?? []);
            if (!item || item.refutation || !engine) return;
            try {
                const refutation = await findRetroRefutation(engine, item);
                if (!refutation) return;
                setRetro((current) => {
                    if (!current || !samePath(current.items[index]?.path ?? [], item.path))
                        return current;
                    const items = [...current.items];
                    items[index] = { ...items[index], refutation };
                    return { ...current, items };
                });
            } catch {
                // The explanation simply leaves out what the mistake allowed.
            }
        },
        [setRetro, storedEngines],
    );
}

export function useRetroBoard() {
    const store = useContext(TreeStateContext)!;
    const position = useStore(store, (s) => s.position);
    const fen = useStore(store, (s) => s.currentNode().fen);
    const [retro, setRetro] = useCurrentRetro();
    const storedEngines = useAtomValue(enginesAtom);
    const item = retro && retro.phase !== "done" ? retro.items[retro.index] : undefined;
    const active = !!retro && !!item && item.fen === fen && samePath(position, parentPath(retro));
    const shapes: DrawShape[] | null = useMemo(
        () => (active && retro ? retroShapes(retro) : null),
        [active, retro],
    );
    const loadRefutation = useRetroRefutation();

    const submit = useCallback(
        async (uci: string, san: string) => {
            if (!retro || !item) return;
            if (
                retro.phase === "evaluating" ||
                retro.phase === "correct" ||
                retro.phase === "solution"
            )
                return;
            const index = retro.index;
            const engine = pickReferenceEngine(storedEngines ?? []);
            setRetro((current) =>
                current && current.index === index
                    ? { ...current, phase: "evaluating", attempt: { uci, san }, feedback: null }
                    : current,
            );
            if (!engine) {
                setRetro((current) =>
                    current && current.index === index
                        ? { ...current, phase: "wrong", feedback: "no-engine" }
                        : current,
                );
                return;
            }
            try {
                const verdict = await judgeRetroMove(engine, {
                    fen: item.fen,
                    item,
                    color: retro.color,
                    uci,
                });
                if (verdict.correct) {
                    playCorrectSound();
                    void loadRefutation(retro, index);
                }
                setRetro((current) => {
                    if (!current || current.index !== index) return current;
                    const items = [...current.items];
                    items[index] = { ...items[index], best: verdict.best };
                    const results = [...current.results];
                    if (verdict.correct) results[index] ??= "solved";
                    return {
                        ...current,
                        items,
                        results,
                        phase: verdict.correct ? "correct" : "wrong",
                        feedback: verdict.feedback,
                    };
                });
            } catch {
                setRetro((current) =>
                    current && current.index === index
                        ? { ...current, phase: "wrong", feedback: "engine-error" }
                        : current,
                );
            }
        },
        [item, loadRefutation, retro, setRetro, storedEngines],
    );

    return { active, shapes, submit };
}

/** Panel side: starting, advancing and closing a session. */
export function useRetroActions() {
    const store = useContext(TreeStateContext)!;
    const goToMove = useStore(store, (s) => s.goToMove);
    const [retro, setRetro] = useCurrentRetro();
    const storedEngines = useAtomValue(enginesAtom);
    const enableAll = useSetAtom(enableAllAtom);
    const loadRefutation = useRetroRefutation();

    const goToExercise = useCallback(
        (state: RetroState) => {
            if (state.phase !== "done") goToMove(parentPath(state));
        },
        [goToMove],
    );

    const start = useCallback(
        (color: Color) => {
            const state = newRetroState(color, collectRetroMistakes(store.getState().root, color));
            // Like Lichess, the live engine is switched off so its arrows do not give the answer away.
            enableAll(false);
            setRetro(state);
            goToExercise(state);
        },
        [enableAll, goToExercise, setRetro, store],
    );

    const advance = useCallback(
        (result: "skipped" | null) => {
            if (!retro) return;
            const results = [...retro.results];
            if (result) results[retro.index] ??= result;
            const index = retro.index + 1;
            const next: RetroState = {
                ...retro,
                results,
                index,
                phase: index < retro.items.length ? "find" : "done",
                attempt: null,
                feedback: null,
            };
            setRetro(next);
            goToExercise(next);
        },
        [goToExercise, retro, setRetro],
    );

    const showSolution = useCallback(async () => {
        if (!retro) return;
        const index = retro.index;
        const item = retro.items[index];
        if (!item) return;
        const reveal = (best = item.best) =>
            setRetro((current) => {
                if (!current || current.index !== index) return current;
                const items = [...current.items];
                items[index] = { ...items[index], best };
                const results = [...current.results];
                results[index] ??= "failed";
                return { ...current, items, results, phase: "solution", feedback: null };
            });
        void loadRefutation(retro, index);
        if (item.best) {
            reveal();
            goToExercise(retro);
            return;
        }
        const engine = pickReferenceEngine(storedEngines ?? []);
        if (!engine) {
            setRetro({ ...retro, phase: "wrong", attempt: null, feedback: "no-engine" });
            return;
        }
        setRetro({ ...retro, phase: "evaluating", attempt: null, feedback: null });
        goToExercise(retro);
        try {
            reveal(await findRetroBest(engine, item.fen));
        } catch {
            setRetro((current) =>
                current && current.index === index
                    ? { ...current, phase: "wrong", attempt: null, feedback: "engine-error" }
                    : current,
            );
        }
    }, [goToExercise, loadRefutation, retro, setRetro, storedEngines]);

    return {
        retro,
        start,
        next: () => advance(null),
        skip: () => advance("skipped"),
        showSolution,
        goToExercise: () => retro && goToExercise(retro),
        close: () => setRetro(null),
    };
}
