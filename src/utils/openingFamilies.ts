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
