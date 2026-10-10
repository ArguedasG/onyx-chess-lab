import { atom } from "jotai";

export type PendingPgnImportTarget = "openings" | "tactics" | "endgames";

/**
 * A PGN chosen in Files to start a training import. The destination page uses it instead of
 * opening the file picker, so the user still reviews names and settings before anything is added.
 */
export const pendingPgnImportAtom = atom<{ target: PendingPgnImportTarget; path: string } | null>(
    null,
);
