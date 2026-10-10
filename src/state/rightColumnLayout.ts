import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { useCallback, useMemo } from "react";

/** The two zones of the right column. Screens portal into `#panel-<zone>` and its header. */
export type PanelZone = "tools" | "notation";

/** Each kind of screen keeps its own arrangement; what matters most differs between them. */
export type RightColumnLayoutKey = "analysis" | "repertoire" | "play" | "generator" | "puzzles";

export type RightColumnLayout = {
    /** Zone shown on top. */
    first: PanelZone;
    /** A collapsed zone only shows its header; the other one takes the space. */
    collapsed: PanelZone | null;
    /** Height of the top zone, in percent, while both zones are open. */
    split: number;
};

export const MIN_SPLIT = 15;
export const MAX_SPLIT = 85;

// Analysis reads the game first; in the other screens the panel drives what happens on the board.
export const DEFAULT_RIGHT_COLUMN_LAYOUTS: Record<RightColumnLayoutKey, RightColumnLayout> = {
    analysis: { first: "notation", collapsed: null, split: 45 },
    repertoire: { first: "tools", collapsed: null, split: 55 },
    play: { first: "tools", collapsed: null, split: 50 },
    generator: { first: "tools", collapsed: null, split: 50 },
    puzzles: { first: "tools", collapsed: null, split: 50 },
};

export function otherZone(zone: PanelZone): PanelZone {
    return zone === "tools" ? "notation" : "tools";
}

export function clampSplit(split: number): number {
    if (!Number.isFinite(split)) return 50;
    return Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, split));
}

/** Chevron: folds the zone, or unfolds it when it was folded. */
export function toggleZoneCollapsed(layout: RightColumnLayout, zone: PanelZone): RightColumnLayout {
    return { ...layout, collapsed: layout.collapsed === zone ? null : zone };
}

/** Maximize: folds the other zone, or restores both when this one was already maximized. */
export function toggleZoneMaximized(layout: RightColumnLayout, zone: PanelZone): RightColumnLayout {
    const other = otherZone(zone);
    return { ...layout, collapsed: layout.collapsed === other ? null : other };
}

/** Swaps the zones while each keeps the height it had. */
export function swapZones(layout: RightColumnLayout): RightColumnLayout {
    return { ...layout, first: otherZone(layout.first), split: clampSplit(100 - layout.split) };
}

export function rightColumnLayoutKey(
    tabType: "analysis" | "play" | "generator" | "puzzles",
    isRepertoire: boolean,
): RightColumnLayoutKey {
    if (tabType === "analysis") return isRepertoire ? "repertoire" : "analysis";
    return tabType;
}

/** Fills gaps and repairs values from older or hand-edited storage. */
export function resolveRightColumnLayout(
    key: RightColumnLayoutKey,
    stored: Partial<RightColumnLayout> | undefined,
): RightColumnLayout {
    const fallback = DEFAULT_RIGHT_COLUMN_LAYOUTS[key];
    const isZone = (value: unknown): value is PanelZone =>
        value === "tools" || value === "notation";
    return {
        first: isZone(stored?.first) ? stored.first : fallback.first,
        collapsed: isZone(stored?.collapsed) ? stored.collapsed : null,
        split: typeof stored?.split === "number" ? clampSplit(stored.split) : fallback.split,
    };
}

const rightColumnLayoutsAtom = atomWithStorage<
    Partial<Record<RightColumnLayoutKey, Partial<RightColumnLayout>>>
>("rightColumnLayouts", {});

export function useRightColumnLayout(key: RightColumnLayoutKey) {
    const [layouts, setLayouts] = useAtom(rightColumnLayoutsAtom);
    const layout = useMemo(() => resolveRightColumnLayout(key, layouts[key]), [key, layouts]);
    const update = useCallback(
        (change: (layout: RightColumnLayout) => RightColumnLayout) =>
            setLayouts((current) => ({
                ...current,
                [key]: change(resolveRightColumnLayout(key, current[key])),
            })),
        [key, setLayouts],
    );
    return [layout, update] as const;
}
