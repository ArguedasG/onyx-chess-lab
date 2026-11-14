import { atom } from "jotai";

/** Progress of an engine analysis of a Player Analysis profile while it runs. */
export type PlayerEngineRun = {
    /** Games done (analyzed or reused from the saved sample), out of `total`. */
    done: number;
    total: number;
    skipped: number;
};

/**
 * Running engine analyses by profile id. A run belongs to the app, not to the card that started
 * it: it keeps going when the user leaves the card, and whoever opens the card again sees its
 * progress and can cancel it.
 */
export const playerEngineRunsAtom = atom<Record<string, PlayerEngineRun>>({});

type RunControl = { cancelled: boolean; analysisIds: Set<string> };

const controls = new Map<string, RunControl>();

/** Registers a run for the profile; null when one is already running. */
export function startPlayerEngineRun(profileId: string): RunControl | null {
    if (controls.has(profileId)) return null;
    const control: RunControl = { cancelled: false, analysisIds: new Set() };
    controls.set(profileId, control);
    return control;
}

export function finishPlayerEngineRun(profileId: string, control: RunControl) {
    if (controls.get(profileId) === control) controls.delete(profileId);
}

/** Stops the run of the profile: no new games start and the ones in progress are cancelled. */
export function cancelPlayerEngineRun(profileId: string): string[] {
    const control = controls.get(profileId);
    if (!control) return [];
    control.cancelled = true;
    return [...control.analysisIds];
}
