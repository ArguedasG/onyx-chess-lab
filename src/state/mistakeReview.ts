import { atom } from "jotai";
import { atomFamily } from "jotai/utils";
import type { MistakeFilter, MistakeItem, MistakeResult } from "@/utils/mistakes/queue";

export type MistakeReviewSession = {
    items: MistakeItem[];
    /** The item being solved; results.length items are already answered. */
    index: number;
    results: MistakeResult[];
};

/**
 * Where the student is in "My mistakes": the filter (also the one chosen from Priorities or
 * Leaks), the page of the list and the session in progress. Opening a game leaves the Players
 * page, so this lives outside the component: coming back restores the list and reopens the
 * session at the same position. In memory only; it does not survive a restart.
 */
export type MistakeReviewState = {
    filter: MistakeFilter;
    page: number;
    session: MistakeReviewSession | null;
};

export const EMPTY_MISTAKE_REVIEW: MistakeReviewState = { filter: {}, page: 1, session: null };

export const mistakeReviewFamily = atomFamily((_owner: string) =>
    atom<MistakeReviewState>(EMPTY_MISTAKE_REVIEW),
);
