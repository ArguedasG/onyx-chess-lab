import { notifications } from "@mantine/notifications";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import { enginesAtom } from "@/state/atoms";
import {
    downloadCatalogEngine,
    findCatalogStockfish,
    installManagedMaiaEngine,
    RECOMMENDED_STOCKFISH_PROGRESS_ID,
    withManagedMaia,
} from "@/utils/engineSetup";
import type { LocalEngine } from "@/utils/engines";
import { usePlatform } from "@/utils/files";
import { isMaiaEngine } from "@/utils/humanBots";
import { isManagedMaia, MANAGED_MAIA_PROGRESS_ID, supportsManagedMaia } from "@/utils/managedMaia";

export type RecommendedEngine = "stockfish" | "maia";
type Step = "idle" | "installing" | "error";

/** Kept outside the components so an installation survives closing the dialog or changing page. */
const setupStateAtom = atom<Record<RecommendedEngine, Step>>({
    stockfish: "idle",
    maia: "idle",
});

/** Why the last installation of each engine failed, shown under it until the next attempt. */
const setupErrorAtom = atom<Record<RecommendedEngine, string | null>>({
    stockfish: null,
    maia: null,
});

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** Stockfish and Maia 3, the two engines most of Onyx relies on, installed in one step. */
export function useRecommendedEngines() {
    const { t } = useTranslation();
    const { os } = usePlatform();
    const [engines, setEngines] = useAtom(enginesAtom);
    const [state, setState] = useAtom(setupStateAtom);
    const [errors, setErrors] = useAtom(setupErrorAtom);
    const local = (engines ?? []).filter(
        (e): e is LocalEngine => e.type === "local" && Boolean(e.path),
    );
    const hasStockfish = local.some((e) => /stockfish/i.test(e.name) && !isMaiaEngine(e));
    const hasMaia = local.some((e) => isMaiaEngine(e));
    // Elsewhere (for example Linux on ARM) Maia is set up by hand.
    const maiaAvailable = supportsManagedMaia(os);

    const setStep = useCallback(
        (engine: RecommendedEngine, step: Step, error: string | null = null) => {
            setState((current) => ({ ...current, [engine]: step }));
            setErrors((current) => ({ ...current, [engine]: error }));
        },
        [setErrors, setState],
    );

    const installStockfish = useCallback(async () => {
        if (!os) return;
        setStep("stockfish", "installing");
        try {
            const entry = await findCatalogStockfish(os);
            if (!entry) throw new Error(t("EngineSetup.StockfishMissing"));
            const installed = await downloadCatalogEngine(entry, RECOMMENDED_STOCKFISH_PROGRESS_ID);
            setEngines(async (prev) => [...(await prev), installed]);
            setStep("stockfish", "idle");
        } catch (error) {
            await commands.clearProgress(RECOMMENDED_STOCKFISH_PROGRESS_ID);
            setStep("stockfish", "error", errorMessage(error));
            notifications.show({
                color: "red",
                title: t("EngineSetup.StockfishFailed"),
                message: errorMessage(error),
            });
        }
    }, [os, setEngines, setStep, t]);

    const installMaia = useCallback(async () => {
        setStep("maia", "installing");
        try {
            const existing = (engines ?? []).find(
                (e): e is LocalEngine => e.type === "local" && isManagedMaia(e),
            );
            const { engine } = await installManagedMaiaEngine(existing?.id);
            setEngines(async (prev) => withManagedMaia(await prev, engine));
            setStep("maia", "idle");
        } catch (error) {
            await commands.clearProgress(MANAGED_MAIA_PROGRESS_ID);
            const message = errorMessage(error);
            setStep("maia", "error", message);
            notifications.show(
                message.toLowerCase().includes("cancelled")
                    ? { color: "yellow", message: t("Engines.ManagedMaia.Cancelled") }
                    : { color: "red", title: t("Engines.ManagedMaia.InstallFailed"), message },
            );
        }
    }, [engines, setEngines, setStep, t]);

    /** Installs what is missing: Stockfish first (one minute), then Maia (several minutes). */
    const installMissing = useCallback(async () => {
        if (!hasStockfish && state.stockfish !== "installing") await installStockfish();
        if (maiaAvailable && !hasMaia && state.maia !== "installing") await installMaia();
    }, [hasMaia, hasStockfish, installMaia, installStockfish, maiaAvailable, state]);

    return {
        os,
        hasStockfish,
        hasMaia,
        maiaAvailable,
        state,
        errors,
        installing: state.stockfish === "installing" || state.maia === "installing",
        installStockfish,
        installMaia,
        installMissing,
    };
}

/**
 * Whether the engine setup dialog is open, so any notice can open it without changing page; a
 * engine name opens it with that engine first.
 */
export const engineSetupOpenAtom = atom<boolean | RecommendedEngine>(false);

export function useOpenEngineSetup() {
    const setOpen = useSetAtom(engineSetupOpenAtom);
    return useCallback((focus?: RecommendedEngine) => setOpen(focus ?? true), [setOpen]);
}

/** Whether Stockfish and (where Onyx can install it) Maia 3 are both installed. */
export function useRecommendedEnginesReady() {
    const engines = useAtomValue(enginesAtom);
    const { os } = usePlatform();
    const local = (engines ?? []).filter(
        (e): e is LocalEngine => e.type === "local" && Boolean(e.path),
    );
    const hasStockfish = local.some((e) => /stockfish/i.test(e.name) && !isMaiaEngine(e));
    const hasMaia = local.some((e) => isMaiaEngine(e));
    return hasStockfish && (!supportsManagedMaia(os) || hasMaia);
}
