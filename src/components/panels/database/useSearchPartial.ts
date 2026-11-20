import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import type { Opening } from "@/utils/db";

type SearchEvent = { id: string; requestId: number };
type PartialPayload = SearchEvent & { matches: number; openings: Opening[] };

export type SearchPartial = { matches: number; openings: Opening[] };

const games = (opening: Opening) =>
    opening.white + opening.draw + opening.black + (opening.unknown ?? 0);

/**
 * The running statistics of a long position search of `tab` (matches so far and their most
 * played moves), sent by the backend at most every 250 ms. Null outside a search, before its
 * first update and for searches too quick to send one. A new `queryKey` only accepts updates
 * from requests newer than any seen before it, so a superseded search never shows.
 */
export function useSearchPartial(tab: string | null, queryKey: string, active: boolean) {
    const [partial, setPartial] = useState<SearchPartial | null>(null);
    const latest = useRef(0);
    const floor = useRef(0);

    useEffect(() => {
        floor.current = latest.current + 1;
        setPartial(null);
    }, [queryKey]);

    useEffect(() => {
        if (!active) setPartial(null);
    }, [active]);

    useEffect(() => {
        let disposed = false;
        const stops: Array<() => void> = [];
        const keep = (stop: () => void) => {
            if (disposed) stop();
            else stops.push(stop);
        };
        // Progress events reveal every request of the tab, also those that never send statistics.
        void listen<SearchEvent>("search_progress", ({ payload }) => {
            if (payload.id === tab) latest.current = Math.max(latest.current, payload.requestId);
        }).then(keep);
        void listen<PartialPayload>("search_partial", ({ payload }) => {
            if (payload.id !== tab || payload.requestId < floor.current) return;
            latest.current = Math.max(latest.current, payload.requestId);
            setPartial({
                matches: payload.matches,
                openings: [...payload.openings].sort(
                    (a, b) => games(b) - games(a) || a.move.localeCompare(b.move),
                ),
            });
        }).then(keep);
        return () => {
            disposed = true;
            for (const stop of stops) stop();
        };
    }, [tab]);

    return active ? partial : null;
}
