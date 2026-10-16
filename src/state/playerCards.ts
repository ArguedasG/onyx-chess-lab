import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { PlayerAnalysisSource } from "@/utils/playerAnalysis";

export type PlayerCardKind = "self" | "rival" | "student" | "other";

/** FIDE profile the user confirmed for a card (I-03). Ratings are a snapshot of that lookup. */
export type PlayerFideLink = {
    id: string;
    name: string;
    title?: string | null;
    federation?: string | null;
    standard?: number | null;
    rapid?: number | null;
    blitz?: number | null;
    checkedAt: string;
};

export type SavedPlayerCard = {
    id: string;
    name: string;
    kind: PlayerCardKind;
    /** Player records in local databases; the first ones were chosen when the card was saved. */
    sources: PlayerAnalysisSource[];
    /** Player Analysis profile of the card; fixed at creation so adding aliases keeps it. */
    analysisProfileId: string;
    fide?: PlayerFideLink;
    notes?: string;
    createdAt: string;
    updatedAt: string;
};

/** Extra data of the cards built from the connected accounts (Accounts page). */
export type AccountCardExtras = {
    aliases: PlayerAnalysisSource[];
    fide?: PlayerFideLink;
    notes?: string;
};

export type PlayerCardsState = {
    schemaVersion: 1;
    cards: Record<string, SavedPlayerCard>;
    order: string[];
    /** By the player name of the accounts. */
    accounts: Record<string, AccountCardExtras>;
    /**
     * Player Analysis profiles whose manual aliases (added in the old panel) were already moved to
     * their card, so an alias removed from the card does not come back.
     */
    aliasesMigrated?: Record<string, true>;
};

export const playerCardsAtom = atomWithStorage<PlayerCardsState>("player-cards-v1", {
    schemaVersion: 1,
    cards: {},
    order: [],
    accounts: {},
});

/** Which card the Players page shows: a saved one, an account one or a search result. */
export type PlayerCardSelection =
    | { origin: "saved"; id: string }
    | { origin: "account"; name: string }
    | { origin: "search"; source: PlayerAnalysisSource };

export const playerCardSelectionAtom = atom<PlayerCardSelection | null>(null);

export type PlayerCardTab =
    | "summary"
    | "games"
    | "openings"
    | "rivals"
    | "analysis"
    | "preparation";

/** Session-only: the tab of each card, so coming back from a game keeps the view. */
export const playerCardTabAtom = atom<Record<string, PlayerCardTab>>({});

export function sourceKey(source: Pick<PlayerAnalysisSource, "databasePath" | "playerId">): string {
    return `${source.databasePath}:${source.playerId}`;
}

export function uniqueSources(sources: readonly PlayerAnalysisSource[]): PlayerAnalysisSource[] {
    return [...new Map(sources.map((source) => [sourceKey(source), source])).values()];
}
