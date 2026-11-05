import { useAtomValue } from "jotai";
import useSWR from "swr";
import { referenceDbAtom, sessionsAtom, enginesAtom } from "@/state/atoms";
import type { LocalEngine } from "@/utils/engines";
import { usePlatform } from "@/utils/files";
import { isMaiaEngine } from "@/utils/humanBots";
import { getPuzzleDatabases } from "@/utils/puzzles";

/**
 * What the installation has of what the sections rely on: engines, a reference database,
 * puzzles and an online account. Shared by the home screen's section cards.
 */
export function useSetupStatus() {
    const engines = useAtomValue(enginesAtom);
    const referenceDb = useAtomValue(referenceDbAtom);
    const sessions = useAtomValue(sessionsAtom);
    const { os } = usePlatform();
    const { data: puzzleDbs } = useSWR("setup-status-puzzle-dbs", () => getPuzzleDatabases());
    const local = (engines ?? []).filter(
        (engine): engine is LocalEngine => engine.type === "local" && Boolean(engine.path),
    );
    return {
        /** Any local engine that is not Maia: what analysis, endgames and bot styles use. */
        hasReferenceEngine: local.some((engine) => !isMaiaEngine(engine)),
        hasMaia: local.some((engine) => isMaiaEngine(engine)),
        /** Maia is installed from Onyx only on Windows; elsewhere it is not asked for. */
        maiaInstallable: os === "windows",
        hasReferenceDb: Boolean(referenceDb),
        hasAccount: sessions.length > 0,
        /** `undefined` while the puzzle databases are being read. */
        hasPuzzles: puzzleDbs === undefined ? undefined : puzzleDbs.length > 0,
    };
}
