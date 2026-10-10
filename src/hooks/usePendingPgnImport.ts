import { open } from "@tauri-apps/plugin-dialog";
import { useAtom } from "jotai";
import { useCallback } from "react";
import { pendingPgnImportAtom, type PendingPgnImportTarget } from "@/state/pendingPgnImport";

/** Resolves the PGN to import: the one sent from Files when present, otherwise the file picker. */
export function usePendingPgnImport(target: PendingPgnImportTarget) {
    const [pending, setPending] = useAtom(pendingPgnImportAtom);
    const path = pending?.target === target ? pending.path : null;

    const clear = useCallback(() => setPending(null), [setPending]);

    const choosePath = useCallback(
        async (filters: { name: string; extensions: string[] }[]): Promise<string | null> => {
            if (path) {
                setPending(null);
                return path;
            }
            const selected = await open({ multiple: false, filters });
            return typeof selected === "string" ? selected : null;
        },
        [path, setPending],
    );

    return { path, clear, choosePath };
}
