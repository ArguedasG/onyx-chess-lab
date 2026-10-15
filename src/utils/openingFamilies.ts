/**
 * Opening names follow "Family: Variation, Subvariation" (the TSV files in `src-tauri/data`), so a
 * player's openings can be shown as three foldable levels instead of dozens of full names with one
 * or two games each.
 */

export type OpeningResultCounts = { games: number; won: number; draw: number; lost: number };

export type OpeningFamilyNode = OpeningResultCounts & {
    /** Stable key: the normalized path of the node. */
    key: string;
    /** Text shown for this level ("French Defense", "Advance Variation", "Milner-Barry Gambit"). */
    label: string;
    /** Full opening name when games were played with exactly this name. */
    fullName?: string;
    /** Games played with exactly this name, without a more specific level. */
    own: OpeningResultCounts;
    children: OpeningFamilyNode[];
};

/** Splits an opening name into at most three levels: family, variation and the rest. */
export function openingNameLevels(name: string): string[] {
    const normalized = name
        .replace(/\bDefence\b/g, "Defense")
        .replace(/\s+/g, " ")
        .trim();
    if (!normalized) return [];
    const colon = normalized.indexOf(":");
    if (colon < 0) return [normalized];
    const family = normalized.slice(0, colon).trim();
    const rest = normalized.slice(colon + 1).trim();
    if (!rest) return [family];
    const comma = rest.indexOf(",");
    if (comma < 0) return [family, rest];
    const variation = rest.slice(0, comma).trim();
    const subvariation = rest.slice(comma + 1).trim();
    return subvariation ? [family, variation, subvariation] : [family, variation];
}

/** Name of a level as a single string: "French Defense" or "French Defense: Advance Variation". */
export function openingLevelKey(levels: readonly string[]): string {
    if (levels.length <= 1) return levels[0] ?? "";
    return `${levels[0]}: ${levels.slice(1).join(", ")}`;
}

/**
 * Tree of a player's opening results: `groups` holds the exact results of each family and
 * family + variation (see `PlayerMetadataAnalysis.openingGroups`), `leaves` those of each full
 * name. Every node keeps its own result object, so no average is recomputed from other averages.
 */
export type OpeningTreeNode<T> = {
    key: string;
    label: string;
    /** Results of all the games under this node. */
    value: T;
    /** Results of the games with exactly this name, when it is also a full opening name. */
    own?: T;
    children: OpeningTreeNode<T>[];
};

export function buildOpeningTree<T extends { key: string; games: number }>(
    leaves: readonly T[],
    groups: readonly T[],
): OpeningTreeNode<T>[] {
    const byKey = new Map(groups.map((value) => [value.key, value]));
    const families = new Map<string, OpeningTreeNode<T>>();
    const node = (key: string, label: string, value: T): OpeningTreeNode<T> => ({
        key,
        label,
        value,
        children: [],
    });
    for (const leaf of leaves) {
        const levels = openingNameLevels(leaf.key);
        if (levels.length === 0) continue;
        const familyKey = openingLevelKey(levels.slice(0, 1));
        // Names that are not "Family: Variation" (an unknown opening) are their own family.
        const familyValue = byKey.get(familyKey) ?? (levels.length === 1 ? leaf : undefined);
        if (!familyValue) continue;
        let family = families.get(familyKey);
        if (!family) {
            family = node(familyKey, levels[0], familyValue);
            families.set(familyKey, family);
        }
        if (levels.length === 1) {
            family.own = leaf;
            continue;
        }
        const variationKey = openingLevelKey(levels.slice(0, 2));
        let variation = family.children.find((child) => child.key === variationKey);
        if (!variation) {
            variation = node(variationKey, levels[1], byKey.get(variationKey) ?? leaf);
            family.children.push(variation);
        }
        if (levels.length === 2) variation.own = leaf;
        else variation.children.push(node(leaf.key, levels[2], leaf));
    }
    const sort = (nodes: OpeningTreeNode<T>[]) => {
        nodes.sort((a, b) => b.value.games - a.value.games || a.label.localeCompare(b.label));
        for (const child of nodes) sort(child.children);
        return nodes;
    };
    return sort([...families.values()]);
}

export type OpeningTreeRow<T> = { node: OpeningTreeNode<T>; depth: number; ownOnly?: boolean };

/** Rows to show of the tree, descending only into expanded nodes (like `visibleOpeningRows`). */
export function visibleOpeningTreeRows<T extends { games: number }>(
    nodes: readonly OpeningTreeNode<T>[],
    expanded: ReadonlySet<string>,
): OpeningTreeRow<T>[] {
    const rows: OpeningTreeRow<T>[] = [];
    const visit = (level: readonly OpeningTreeNode<T>[], depth: number) => {
        for (const node of level) {
            rows.push({ node, depth });
            if (node.children.length === 0 || !expanded.has(node.key)) continue;
            if (node.own && node.own.games > 0)
                rows.push({ node, depth: depth + 1, ownOnly: true });
            visit(node.children, depth + 1);
        }
    };
    visit(nodes, 0);
    return rows;
}

type MutableNode = OpeningFamilyNode & { childMap: Map<string, MutableNode> };

function emptyNode(key: string, label: string): MutableNode {
    return {
        key,
        label,
        games: 0,
        won: 0,
        draw: 0,
        lost: 0,
        own: { games: 0, won: 0, draw: 0, lost: 0 },
        children: [],
        childMap: new Map(),
    };
}

function add(target: OpeningResultCounts, counts: OpeningResultCounts) {
    target.games += counts.games;
    target.won += counts.won;
    target.draw += counts.draw;
    target.lost += counts.lost;
}

function finish(node: MutableNode): OpeningFamilyNode {
    const children = [...node.childMap.values()]
        .map(finish)
        .sort((a, b) => b.games - a.games || a.label.localeCompare(b.label));
    const { childMap: _, ...rest } = node;
    return { ...rest, children };
}

/** Builds the family tree from per-name results, most played first at every level. */
export function buildOpeningFamilies(
    openings: readonly (OpeningResultCounts & { name: string })[],
): OpeningFamilyNode[] {
    const root = emptyNode("", "");
    for (const opening of openings) {
        const levels = openingNameLevels(opening.name);
        if (levels.length === 0 || opening.games <= 0) continue;
        let node = root;
        for (const [depth, label] of levels.entries()) {
            const key = levels
                .slice(0, depth + 1)
                .join(" › ")
                .toLowerCase();
            let child = node.childMap.get(key);
            if (!child) {
                child = emptyNode(key, label);
                node.childMap.set(key, child);
            }
            add(child, opening);
            node = child;
        }
        add(node.own, opening);
        node.fullName ??= opening.name;
    }
    return finish(root).children;
}

export type OpeningFamilyRow = {
    node: OpeningFamilyNode;
    depth: number;
    /**
     * The games of an expanded node played with exactly its name, shown below it so the children
     * still add up to the parent's total.
     */
    ownOnly?: boolean;
};

/** Rows to show, depth first, descending only into expanded nodes. */
export function visibleOpeningRows(
    families: readonly OpeningFamilyNode[],
    expanded: ReadonlySet<string>,
): OpeningFamilyRow[] {
    const rows: OpeningFamilyRow[] = [];
    const visit = (nodes: readonly OpeningFamilyNode[], depth: number) => {
        for (const node of nodes) {
            rows.push({ node, depth });
            if (node.children.length === 0 || !expanded.has(node.key)) continue;
            if (node.own.games > 0) rows.push({ node, depth: depth + 1, ownOnly: true });
            visit(node.children, depth + 1);
        }
    };
    visit(families, 0);
    return rows;
}
