import { useAtom, useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";
import useSWR from "swr";
import { sessionsAtom } from "@/state/atoms";
import { playerAnalysisProfileId } from "@/state/playerAnalysis";
import {
    type PlayerCardKind,
    type PlayerCardSelection,
    type PlayerFideLink,
    playerCardsAtom,
    type SavedPlayerCard,
    uniqueSources,
} from "@/state/playerCards";
import type { PlayerAnalysisSource } from "@/utils/playerAnalysis";
import { type AccountPlayer, loadAccountPlayers } from "@/utils/players/accountSources";
import type { Session } from "@/utils/session";

/** A card ready to show, whatever it comes from. */
export type ResolvedPlayerCard = {
    /** Stable id for view state: `saved:…`, `account:…` or `search:…`. */
    id: string;
    origin: PlayerCardSelection["origin"];
    name: string;
    kind: PlayerCardKind;
    /** All the records of the card: the main ones and the manual aliases. */
    sources: PlayerAnalysisSource[];
    /** Records the card cannot lose (the connected accounts). */
    fixedSources: PlayerAnalysisSource[];
    analysisProfileId: string;
    fide?: PlayerFideLink;
    notes?: string;
    sessions?: Session[];
    savedId?: string;
    /** The aliases of its Player Analysis profile were already moved to the card. */
    aliasesMigrated: boolean;
};

export type PlayerCardChange = Partial<{
    name: string;
    kind: PlayerCardKind;
    notes: string;
    sources: PlayerAnalysisSource[];
    fide: PlayerFideLink | undefined;
}>;

export function useAccountPlayers() {
    const sessions = useAtomValue(sessionsAtom);
    return useSWR(
        [
            "account-players",
            sessions.map(
                (session) =>
                    `${session.lichess?.username ?? ""}|${session.chessCom?.username ?? ""}|${session.player ?? ""}|${session.updatedAt}`,
            ),
        ],
        () => loadAccountPlayers(sessions),
        { revalidateOnFocus: false },
    );
}

function newId() {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function usePlayerCards() {
    const [state, setState] = useAtom(playerCardsAtom);
    const {
        data: accountPlayers,
        isLoading: accountsLoading,
        mutate: reloadAccounts,
    } = useAccountPlayers();

    const accountCards = useMemo<ResolvedPlayerCard[]>(
        () =>
            (accountPlayers ?? []).map((player: AccountPlayer) => {
                const extras = state.accounts[player.name];
                return {
                    id: `account:${player.name}`,
                    origin: "account",
                    name: player.name,
                    kind: "self",
                    sources: uniqueSources([...player.sources, ...(extras?.aliases ?? [])]),
                    fixedSources: player.sources,
                    // The same id the Accounts page used, so existing profiles stay attached.
                    analysisProfileId: playerAnalysisProfileId(player.name, player.sources),
                    fide: extras?.fide,
                    notes: extras?.notes,
                    sessions: player.sessions,
                    aliasesMigrated: false,
                };
            }),
        [accountPlayers, state.accounts],
    );

    const savedCards = useMemo<ResolvedPlayerCard[]>(
        () =>
            state.order.flatMap((id) => {
                const card = state.cards[id];
                if (!card) return [];
                return [
                    {
                        id: `saved:${card.id}`,
                        origin: "saved",
                        name: card.name,
                        kind: card.kind,
                        sources: card.sources,
                        fixedSources: [],
                        analysisProfileId: card.analysisProfileId,
                        fide: card.fide,
                        notes: card.notes,
                        savedId: card.id,
                        aliasesMigrated: false,
                    } satisfies ResolvedPlayerCard,
                ];
            }),
        [state.cards, state.order],
    );

    const resolve = useCallback(
        (selection: PlayerCardSelection | null): ResolvedPlayerCard | null => {
            if (!selection) return null;
            if (selection.origin === "saved")
                return savedCards.find((card) => card.savedId === selection.id) ?? null;
            if (selection.origin === "account")
                return accountCards.find((card) => card.name === selection.name) ?? null;
            const source = selection.source;
            return {
                id: `search:${source.databasePath}:${source.playerId}`,
                origin: "search",
                name: source.playerName,
                kind: "other",
                sources: [source],
                fixedSources: [],
                // The id the database player card used, so its profile is found again.
                analysisProfileId: playerAnalysisProfileId(source.playerName, [source]),
                aliasesMigrated: true,
            };
        },
        [accountCards, savedCards],
    );
    const resolveCard = useCallback(
        (selection: PlayerCardSelection | null): ResolvedPlayerCard | null => {
            const card = resolve(selection);
            if (!card || card.origin === "search") return card;
            return {
                ...card,
                aliasesMigrated: state.aliasesMigrated?.[card.analysisProfileId] === true,
            };
        },
        [resolve, state.aliasesMigrated],
    );

    const markAliasesMigrated = useCallback(
        (profileId: string) =>
            setState((previous) =>
                previous.aliasesMigrated?.[profileId]
                    ? previous
                    : {
                          ...previous,
                          aliasesMigrated: { ...previous.aliasesMigrated, [profileId]: true },
                      },
            ),
        [setState],
    );

    /** Saves a search result (or a database player) as a card and returns its id. */
    const saveCard = useCallback(
        (
            sources: PlayerAnalysisSource[],
            value: { name: string; kind: PlayerCardKind; notes: string },
        ) => {
            const id = newId();
            const now = new Date().toISOString();
            const card: SavedPlayerCard = {
                id,
                name: value.name,
                kind: value.kind,
                notes: value.notes || undefined,
                sources,
                analysisProfileId: playerAnalysisProfileId(
                    sources[0]?.playerName ?? value.name,
                    sources,
                ),
                createdAt: now,
                updatedAt: now,
            };
            setState((previous) => ({
                ...previous,
                cards: { ...previous.cards, [id]: card },
                order: [...previous.order, id],
            }));
            return id;
        },
        [setState],
    );

    /** Changes a saved or an account card. */
    const updateCard = useCallback(
        (card: ResolvedPlayerCard, change: PlayerCardChange) => {
            setState((previous) => {
                if (card.origin === "saved" && card.savedId) {
                    const current = previous.cards[card.savedId];
                    if (!current) return previous;
                    const next: SavedPlayerCard = {
                        ...current,
                        updatedAt: new Date().toISOString(),
                    };
                    if (change.name !== undefined) next.name = change.name;
                    if (change.kind !== undefined) next.kind = change.kind;
                    if (change.notes !== undefined) next.notes = change.notes || undefined;
                    if (change.sources !== undefined) next.sources = uniqueSources(change.sources);
                    if ("fide" in change) next.fide = change.fide;
                    return { ...previous, cards: { ...previous.cards, [card.savedId]: next } };
                }
                if (card.origin === "account") {
                    const current = previous.accounts[card.name] ?? { aliases: [] };
                    const fixed = new Set(
                        card.fixedSources.map(
                            (source) => `${source.databasePath}:${source.playerId}`,
                        ),
                    );
                    const next = { ...current };
                    if (change.notes !== undefined) next.notes = change.notes || undefined;
                    if (change.sources !== undefined)
                        next.aliases = uniqueSources(change.sources).filter(
                            (source) => !fixed.has(`${source.databasePath}:${source.playerId}`),
                        );
                    if ("fide" in change) next.fide = change.fide;
                    return { ...previous, accounts: { ...previous.accounts, [card.name]: next } };
                }
                return previous;
            });
        },
        [setState],
    );

    const deleteCard = useCallback(
        (savedId: string) =>
            setState((previous) => {
                const cards = { ...previous.cards };
                delete cards[savedId];
                return { ...previous, cards, order: previous.order.filter((id) => id !== savedId) };
            }),
        [setState],
    );

    /** The user's own records: account cards and saved cards of kind "Me". */
    const selfSources = useMemo(
        () =>
            uniqueSources([
                ...accountCards.flatMap((card) => card.sources),
                ...savedCards
                    .filter((card) => card.kind === "self")
                    .flatMap((card) => card.sources),
            ]),
        [accountCards, savedCards],
    );

    return {
        accountCards,
        savedCards,
        accountsLoading,
        reloadAccounts,
        resolve: resolveCard,
        markAliasesMigrated,
        saveCard,
        updateCard,
        deleteCard,
        selfSources,
    };
}
