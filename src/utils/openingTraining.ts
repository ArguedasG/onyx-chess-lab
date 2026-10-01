import { commands, type BestMoves, type ScoreValue } from "@/bindings";
import { getPGN, parsePGN, uciNormalize } from "@/utils/chess";
import { positionFromFen } from "@/utils/chessops";
import { areaId, type OpeningRepertoire, type OpeningsState } from "@/utils/trainingAreas";
import {
    createNode,
    defaultTree,
    type GameHeaders,
    type TreeNode,
    type TreeState,
} from "@/utils/treeReducer";
import { unwrap } from "@/utils/unwrap";
import { getOpeningImportGroupPreviews, normalizedGroupKey } from "@/utils/openingImportGrouping";
import i18n from "i18next";
import { makeUci, parseUci } from "chessops";
import { makeFen } from "chessops/fen";
import { makeSan } from "chessops/san";

export {
    getOpeningImportGroupPreviews,
    getOpeningImportSuggestedExclusions,
} from "@/utils/openingImportGrouping";

export type OpeningImportConfig = {
    color: OpeningRepertoire["color"];
    subvariationPolicy: OpeningRepertoire["subvariationPolicy"];
    groupingMode: OpeningGroupingMode;
};

export type OpeningGroupingMode = "smart" | "records" | "single";

export type OpeningImportLine = {
    name: string;
    fen: string;
    moves: string[];
    path: number[];
    plyCount: number;
    trainable: boolean;
};

export type OpeningImportVariant = {
    name: string;
    sourceRecordIndex: number;
    trainingRecordIndex: number;
    contentType: "theory" | "modelGame";
    commentCount: number;
    hasVariations: boolean;
    lines: OpeningImportLine[];
};

export type OpeningPgnSample = {
    index: number;
    name: string;
    startingFen: string;
    chapterName?: string;
    chessableGroupName?: string;
    eventName?: string;
    /** Raw `White`/`Black` headers; course exports use them for chapter and line titles. */
    whiteName?: string;
    blackName?: string;
    lineCount: number;
    commentCount: number;
    hasVariations: boolean;
    contentType: "theory" | "modelGame";
    error?: string;
};

export type OpeningPgnInspection = {
    path: string;
    filename: string;
    recordCount: number;
    samples: OpeningPgnSample[];
    /**
     * Trees parsed during inspection, by source record index (`null` for invalid records). They
     * let the import reuse the work instead of reading and lexing the whole PGN a second time.
     */
    parsedTrees?: Array<TreeState | null>;
};

export type OpeningImportGroupPreview = {
    key: string;
    name: string;
    startingFen: string;
    recordIndexes: number[];
    lineCount: number;
    commentCount: number;
    contentType: "theory" | "modelGame";
};

export type OpeningConsolidationGroup = {
    key: string;
    name: string;
    variantIds: string[];
    lineCount: number;
};

export type OpeningImportOverrides = {
    /** Sections edited in the import review; replaces the automatic grouping when present. */
    groups?: OpeningImportGroupPreview[];
    /** Manual line names by source record index. */
    recordNames?: Record<number, string>;
};

export type PreparedOpeningImport = {
    trainingPgn: string;
    variants: OpeningImportVariant[];
    skippedRecords: number;
};

function scoreForSide(value: ScoreValue, side: "white" | "black"): number {
    const sign = side === "white" ? 1 : -1;
    if (value.type === "cp") return value.value * sign;
    if (value.type === "mate") return value.value * sign * 100000;
    return -value.value * sign;
}

export function acceptsOpeningDeviation(
    best: BestMoves,
    candidate: BestMoves,
    side: "white" | "black",
    thresholdCp = 30,
): boolean {
    const bestValue = best.score.value;
    const candidateValue = candidate.score.value;
    if (bestValue.type === "mate") {
        return candidateValue.type === "mate" && candidateValue.value === bestValue.value;
    }
    if (candidateValue.type === "mate") {
        return scoreForSide(candidateValue, side) > scoreForSide(bestValue, side);
    }
    return scoreForSide(bestValue, side) - scoreForSide(candidateValue, side) <= thresholdCp;
}

export type OpeningMoveClassification =
    | "correct"
    | "good-deviation"
    | "incorrect"
    | "engine-unavailable";

export function classifyOpeningMove(
    expectedSan: string,
    playedSan: string,
    playedUci: string,
    evaluated: BestMoves[] | null,
    side: "white" | "black",
    thresholdCp = 30,
): OpeningMoveClassification {
    if (playedSan === expectedSan) return "correct";
    if (!evaluated || evaluated.length === 0) return "engine-unavailable";

    const candidate = evaluated.find((line) => line.uciMoves[0] === playedUci);
    if (!candidate) return "incorrect";
    return acceptsOpeningDeviation(evaluated[0], candidate, side, thresholdCp)
        ? "good-deviation"
        : "incorrect";
}

function cloneTreeNode(node: TreeNode, selectedPaths: number[][], depth: number): TreeNode {
    return {
        ...node,
        shapes: [...node.shapes],
        annotations: [...node.annotations],
        children: node.children.flatMap((child, childIndex) => {
            const paths = selectedPaths.filter((path) => path[depth] === childIndex);
            return paths.length > 0 ? [cloneTreeNode(child, paths, depth + 1)] : [];
        }),
    };
}

export function filterOpeningTree(root: TreeNode, selectedPaths: number[][]): TreeNode {
    return cloneTreeNode(root, selectedPaths, 0);
}

function moveKey(node: TreeNode): string | null {
    return node.move ? makeUci(node.move) : null;
}

function mergeOpeningBranch(targetRoot: TreeNode, sourceRoot: TreeNode, path: number[]) {
    let target = targetRoot;
    let source = sourceRoot;
    for (const childIndex of path) {
        const sourceChild = source.children[childIndex];
        if (!sourceChild) return;
        const key = moveKey(sourceChild);
        let targetChild = target.children.find((child) => moveKey(child) === key);
        if (!targetChild) {
            targetChild = {
                ...sourceChild,
                children: [],
                shapes: [...sourceChild.shapes],
                annotations: [...sourceChild.annotations],
            };
            target.children.push(targetChild);
        }
        target = targetChild;
        source = sourceChild;
    }
}

function openingPathForMoves(root: TreeNode, moves: string[]): number[] | null {
    const path: number[] = [];
    let node = root;
    for (const uci of moves) {
        const [position] = positionFromFen(node.fen);
        if (!position) return null;
        const childIndex = node.children.findIndex(
            (child) => child.move && uciNormalize(position.clone(), child.move) === uci,
        );
        if (childIndex < 0) return null;
        path.push(childIndex);
        node = node.children[childIndex];
    }
    return path;
}

function lineKey(moves: string[]): string {
    return moves.join(" ");
}

function commonMovePrefix(left: string[], right: string[]): number {
    let index = 0;
    while (index < left.length && index < right.length && left[index] === right[index]) index += 1;
    return index;
}

const REPERTOIRE_ID_HEADER = "ChessLabRepertoireId";
const VARIANT_ID_HEADER = "ChessLabVariantId";

function appendOpeningMoves(root: TreeNode, moves: string[]) {
    let node = root;
    for (const uci of moves) {
        const [position] = positionFromFen(node.fen);
        const move = parseUci(uci);
        if (!position || !move || !position.isLegal(move)) {
            throw new Error(
                i18n.t(
                    "Errors.IllegalMoveInSequence",
                    "The sequence contains an illegal move: {{move}}.",
                    { move: uci },
                ),
            );
        }
        const key = makeUci(move);
        let child = node.children.find((candidate) => moveKey(candidate) === key);
        if (!child) {
            const san = makeSan(position, move);
            position.play(move);
            child = createNode({
                fen: makeFen(position.toSetup()),
                move,
                san,
                halfMoves: node.halfMoves + 1,
            });
            node.children.push(child);
        }
        node = child;
    }
}

export async function buildOpeningTrainingPgn(
    state: OpeningsState,
    repertoireId: string,
): Promise<string> {
    const repertoire = state.repertoires[repertoireId];
    if (!repertoire)
        throw new Error(i18n.t("Errors.RepertoireNotFound", "The repertoire could not be found."));
    const variants = repertoire.variantIds
        .map((id) => state.variants[id])
        .filter((variant): variant is NonNullable<typeof variant> => Boolean(variant))
        .sort((left, right) => left.trainingRecordIndex - right.trainingRecordIndex);
    const workingRecordCount = unwrap(await commands.countPgnGames(repertoire.path));
    const records =
        workingRecordCount > 0
            ? unwrap(await commands.readGames(repertoire.path, 0, workingRecordCount - 1))
            : [];
    const trainingRecords: string[] = [];

    const parsedRecords = await Promise.all(records.map((raw) => parsePGN(raw)));
    const recordForVariant = (variant: (typeof variants)[number]) =>
        parsedRecords.find((record) => record.headers.other?.[VARIANT_ID_HEADER] === variant.id) ??
        parsedRecords.find(
            (record) =>
                record.headers.other?.ChapterName === variant.name ||
                record.headers.event === variant.name,
        ) ??
        parsedRecords[variant.trainingRecordIndex];

    for (const variant of variants) {
        const selectedLines = variant.lineIds
            .map((id) => state.lines[id])
            .filter((line): line is NonNullable<typeof line> => Boolean(line));
        const firstLineSource = selectedLines
            .map((line) =>
                parsedRecords.find((record) => openingPathForMoves(record.root, line.moves)),
            )
            .find(Boolean);
        const tree = recordForVariant(variant) ?? firstLineSource ?? parsedRecords[0];
        if (!tree) {
            throw new Error(
                i18n.t("Errors.ChapterCreateFailed", "Could not create the chapter “{{name}}”.", {
                    name: variant.name,
                }),
            );
        }
        const root = cloneTreeNode(tree.root, [], 0);
        for (const line of selectedLines) {
            const source = parsedRecords
                .map((record) => ({ record, path: openingPathForMoves(record.root, line.moves) }))
                .find((candidate) => candidate.path !== null);
            if (source?.path) {
                if (source.record.root.fen !== root.fen) {
                    throw new Error(
                        i18n.t(
                            "Errors.LineIncompatibleStart",
                            "The line “{{name}}” starts from an incompatible position.",
                            { name: line.name },
                        ),
                    );
                }
                mergeOpeningBranch(root, source.record.root, source.path);
            } else {
                appendOpeningMoves(root, line.moves);
            }
        }
        const orientation =
            repertoire.color === "both" ? (tree.headers.orientation ?? "white") : repertoire.color;
        trainingRecords.push(
            getPGN(root, {
                headers: {
                    ...tree.headers,
                    event: variant.name,
                    orientation,
                    other: {
                        ...tree.headers.other,
                        ChapterName: variant.name,
                        ChessLabContentType: variant.contentType,
                        [REPERTOIRE_ID_HEADER]: repertoire.id,
                        [VARIANT_ID_HEADER]: variant.id,
                    },
                },
                glyphs: true,
                comments: true,
                variations: true,
                extraMarkups: true,
            }),
        );
    }

    return trainingRecords.join("\n\n\n");
}

export function buildOpeningFlatPgn(state: OpeningsState, repertoireId: string): string {
    const repertoire = state.repertoires[repertoireId];
    if (!repertoire)
        throw new Error(i18n.t("Errors.RepertoireNotFound", "The repertoire could not be found."));
    const records: string[] = [];

    for (const variantId of repertoire.variantIds) {
        const variant = state.variants[variantId];
        if (!variant || variant.contentType !== "theory") continue;
        for (const lineId of variant.lineIds) {
            const line = state.lines[lineId];
            if (!line?.trainable || line.moves.length === 0) continue;
            const root = defaultTree(line.fen).root;
            appendOpeningMoves(root, line.moves);
            const orientation = repertoire.color === "both" ? "white" : repertoire.color;
            records.push(
                getPGN(root, {
                    headers: {
                        id: records.length,
                        fen: line.fen,
                        event: repertoire.name,
                        site: "Onyx Chess Lab",
                        white: variant.name,
                        black: line.name,
                        result: "*",
                        orientation,
                        other: {
                            RepertoireName: repertoire.name,
                            ChapterName: variant.name,
                            LineName: line.name,
                            OnyxTrainable: "1",
                            ChessLabRepertoireId: repertoire.id,
                            ChessLabVariantId: variant.id,
                            ChessLabLineId: line.id,
                        },
                    },
                    glyphs: true,
                    comments: false,
                    variations: false,
                    extraMarkups: false,
                }),
            );
        }
    }

    if (records.length === 0) {
        throw new Error(
            i18n.t(
                "Errors.NoTrainableLinesToExport",
                "The repertoire has no trainable lines to export.",
            ),
        );
    }
    return records.join("\n\n\n");
}

export function syncOpeningVariantTree(
    state: OpeningsState,
    workingPath: string,
    recordIndex: number,
    root: TreeNode,
    headers: GameHeaders,
): OpeningsState {
    const repertoire = Object.values(state.repertoires).find(
        (candidate) => candidate.path === workingPath,
    );
    if (!repertoire) return state;

    const taggedVariantId = headers.other?.[VARIANT_ID_HEADER];
    let variant = taggedVariantId ? state.variants[taggedVariantId] : undefined;
    if (variant?.repertoireId !== repertoire.id) variant = undefined;
    variant ??= repertoire.variantIds
        .map((id) => state.variants[id])
        .find((candidate) => candidate?.trainingRecordIndex === recordIndex);

    const variants = { ...state.variants };
    const lines = { ...state.lines };
    const variantIds = [...repertoire.variantIds];
    const variantId = variant?.id ?? areaId("variant");
    const extracted = extractOpeningImportLines(root, "all");
    const existingByMoves = new Map(
        (variant?.lineIds ?? [])
            .map((id) => lines[id])
            .filter((line): line is NonNullable<typeof line> => Boolean(line))
            .map((line) => [lineKey(line.moves), line]),
    );
    const nextLineIds = extracted.map((entry) => {
        const exact = existingByMoves.get(lineKey(entry.moves));
        const existing =
            exact ??
            [...existingByMoves.values()]
                .map((line) => ({ line, prefix: commonMovePrefix(line.moves, entry.moves) }))
                .filter(
                    ({ line, prefix }) =>
                        prefix === Math.min(line.moves.length, entry.moves.length) && prefix > 0,
                )
                .sort((left, right) => right.prefix - left.prefix)[0]?.line;
        if (existing) {
            existingByMoves.delete(lineKey(existing.moves));
            lines[existing.id] = {
                ...existing,
                fen: entry.fen,
                moves: entry.moves,
                path: entry.path,
                plyCount: entry.plyCount,
                sourceRecordIndex: null,
            };
            return existing.id;
        }
        const id = areaId("line");
        lines[id] = {
            id,
            variantId,
            name: entry.name,
            fen: entry.fen,
            moves: entry.moves,
            path: entry.path,
            plyCount: entry.plyCount,
            trainable: variant?.contentType !== "modelGame",
            sourceRecordIndex: null,
            moveProgress: {},
            session: { attempts: 0, completions: 0, flawless: 0, totalTimeMs: 0 },
        };
        return id;
    });
    for (const obsolete of existingByMoves.values()) delete lines[obsolete.id];

    const stats = treeStats(root);
    const name = openingName(headers, recordIndex);
    variants[variantId] = {
        id: variantId,
        repertoireId: repertoire.id,
        name,
        lineIds: nextLineIds,
        sourceRecordIndex: variant?.sourceRecordIndex ?? recordIndex,
        trainingRecordIndex: recordIndex,
        contentType: variant?.contentType ?? "theory",
        commentCount: stats.commentCount,
        hasVariations: stats.hasVariations,
    };
    if (!variant) {
        variantIds.splice(Math.min(recordIndex, variantIds.length), 0, variantId);
    }

    return {
        ...state,
        lines,
        variants,
        repertoires: {
            ...state.repertoires,
            [repertoire.id]: {
                ...repertoire,
                variantIds,
                updatedAt: new Date().toISOString(),
            },
        },
    };
}

export type OpeningTrainingSyncPreview = {
    openings: OpeningsState;
    structural: boolean;
    addedLines: number;
    changedLines: number;
    removedLines: number;
};

export function previewOpeningTrainingSync(
    state: OpeningsState,
    workingPath: string,
    recordIndex: number,
    root: TreeNode,
    headers: GameHeaders,
): OpeningTrainingSyncPreview {
    const beforeRepertoire = Object.values(state.repertoires).find(
        (candidate) => candidate.path === workingPath,
    );
    const beforeVariant = beforeRepertoire?.variantIds
        .map((id) => state.variants[id])
        .find((variant) => variant?.trainingRecordIndex === recordIndex);
    const openings = syncOpeningVariantTree(state, workingPath, recordIndex, root, headers);
    const afterRepertoire = beforeRepertoire
        ? openings.repertoires[beforeRepertoire.id]
        : undefined;
    const afterVariant = afterRepertoire?.variantIds
        .map((id) => openings.variants[id])
        .find((variant) => variant?.trainingRecordIndex === recordIndex);

    const beforeLines = new Map(
        (beforeVariant?.lineIds ?? []).flatMap((id) => {
            const line = state.lines[id];
            return line ? [[id, line.moves.join(" ")] as const] : [];
        }),
    );
    const afterLines = new Map(
        (afterVariant?.lineIds ?? []).flatMap((id) => {
            const line = openings.lines[id];
            return line ? [[id, line.moves.join(" ")] as const] : [];
        }),
    );
    const addedLines = [...afterLines.keys()].filter((id) => !beforeLines.has(id)).length;
    const removedLines = [...beforeLines.keys()].filter((id) => !afterLines.has(id)).length;
    const changedLines = [...afterLines.entries()].filter(
        ([id, moves]) => beforeLines.has(id) && beforeLines.get(id) !== moves,
    ).length;

    return {
        openings,
        structural: addedLines + changedLines + removedLines > 0,
        addedLines,
        changedLines,
        removedLines,
    };
}

function filename(path: string): string {
    return path.split(/[\\/]/).pop() || "Repertorio.pgn";
}

function meaningfulHeader(value: string | undefined): string | undefined {
    const normalized = value?.trim();
    return normalized && normalized !== "?" && normalized !== "-" ? normalized : undefined;
}

// "12) Slav", "3. QGA", "1.2) Intro" or "18 A) Kan"; the letter keeps sub-chapters apart.
const CHAPTER_NUMBER = /^\s*\d+(?:\.\d+)*(?:\s*[A-Z](?=\s*[.)]))?\s*[.)]\s*/;

function chessableGroupName(headers: GameHeaders): string | undefined {
    const candidates = [meaningfulHeader(headers.white), meaningfulHeader(headers.black)];
    for (const candidate of candidates) {
        if (!candidate || !CHAPTER_NUMBER.test(candidate)) continue;
        const withoutOrder = candidate.replace(CHAPTER_NUMBER, "").trim();
        const beforeVersus = withoutOrder.split(/\s+(?:vs\.?|versus)\s+/i)[0]?.trim();
        if (beforeVersus) return beforeVersus;
    }
    return undefined;
}

function importGroupingHints(headers: GameHeaders) {
    return {
        chapterName: meaningfulHeader(headers.other?.ChapterName),
        chessableGroupName: chessableGroupName(headers),
        eventName: meaningfulHeader(headers.event),
        whiteName: meaningfulHeader(headers.white),
        blackName: meaningfulHeader(headers.black),
    };
}

function openingName(headers: GameHeaders, index: number): string {
    const explicitLine = meaningfulHeader(
        headers.other?.LineName ?? headers.other?.ChessLabLineName,
    );
    if (explicitLine) return explicitLine;
    const chapter = meaningfulHeader(headers.other?.ChapterName);
    if (chapter) return chapter;
    const white = meaningfulHeader(headers.white);
    const black = meaningfulHeader(headers.black);
    if (white && black) return `${white} — ${black}`;
    if (white) return `${white} — Black`;
    if (black) return `White — ${black}`;
    const event = meaningfulHeader(headers.event);
    if (event) return event;
    return i18n.t("OpeningImport.LineFallbackName", "Line {{number}}", { number: index + 1 });
}

function lineName(headers: GameHeaders, fallback: string, sectionName?: string): string {
    const explicit = meaningfulHeader(headers.other?.LineName ?? headers.other?.ChessLabLineName);
    if (explicit) return explicit;
    const chapter = meaningfulHeader(headers.other?.ChapterName);
    if (chapter && chapter !== sectionName) return chapter;
    const white = meaningfulHeader(headers.white);
    const black = meaningfulHeader(headers.black);
    if (white && black) return `${white} — ${black}`;
    if (white) return `${white} — Black`;
    if (black) return `White — ${black}`;
    const event = meaningfulHeader(headers.event);
    if (event && event !== sectionName) return event;
    return fallback || i18n.t("OpeningImport.LineFallback", "Line");
}

function consolidationName(value: string): string | null {
    const match = /^\s*\d+(?:\.\d+)*\s*[.)]\s*(.+)$/.exec(value);
    if (!match) return null;
    const withoutOrder = match[1].trim();
    const base = withoutOrder.split(/\s+(?:vs\.?|versus)\s+|\s+[—–]\s+/i)[0]?.trim();
    return base || null;
}

export function getOpeningConsolidationGroups(
    state: OpeningsState,
    repertoireId: string,
): OpeningConsolidationGroup[] {
    const repertoire = state.repertoires[repertoireId];
    if (!repertoire) return [];
    const groups = new Map<string, OpeningConsolidationGroup>();
    for (const variantId of repertoire.variantIds) {
        const variant = state.variants[variantId];
        if (!variant || variant.contentType !== "theory" || variant.lineIds.length === 0) continue;
        const name = consolidationName(variant.name);
        if (!name) continue;
        const startingFens = new Set(
            variant.lineIds.map((lineId) => state.lines[lineId]?.fen).filter(Boolean),
        );
        if (startingFens.size !== 1) continue;
        const startingFen = [...startingFens][0];
        const key = `${normalizedGroupKey(name)}|${startingFen}`;
        const existing = groups.get(key);
        if (existing) {
            existing.variantIds.push(variant.id);
            existing.lineCount += variant.lineIds.length;
        } else {
            groups.set(key, {
                key,
                name,
                variantIds: [variant.id],
                lineCount: variant.lineIds.length,
            });
        }
    }
    return [...groups.values()].filter((group) => group.variantIds.length > 1);
}

export function consolidateOpeningSections(
    state: OpeningsState,
    repertoireId: string,
    selectedGroupKeys: readonly string[],
): OpeningsState {
    const repertoire = state.repertoires[repertoireId];
    if (!repertoire || selectedGroupKeys.length === 0) return state;
    const selected = new Set(selectedGroupKeys);
    const groups = getOpeningConsolidationGroups(state, repertoireId).filter((group) =>
        selected.has(group.key),
    );
    if (groups.length === 0) return state;

    const variants = { ...state.variants };
    const lines = { ...state.lines };
    const removedVariantIds = new Set<string>();

    for (const group of groups) {
        const targetId = group.variantIds[0];
        const target = variants[targetId];
        if (!target) continue;
        const lineIds: string[] = [];
        const lineByMoves = new Map<string, string>();
        let commentCount = 0;
        let hasVariations = false;

        for (const variantId of group.variantIds) {
            const variant = variants[variantId];
            if (!variant) continue;
            commentCount += variant.commentCount;
            hasVariations ||= variant.hasVariations;
            for (const lineId of variant.lineIds) {
                const line = lines[lineId];
                if (!line) continue;
                const key = lineKey(line.moves);
                const duplicateId = lineByMoves.get(key);
                if (!duplicateId) {
                    lineByMoves.set(key, lineId);
                    lineIds.push(lineId);
                    lines[lineId] = { ...line, variantId: targetId };
                    continue;
                }
                const duplicate = lines[duplicateId];
                const moveProgress = { ...duplicate.moveProgress };
                for (const [moveKey, progress] of Object.entries(line.moveProgress)) {
                    const current = moveProgress[moveKey];
                    moveProgress[moveKey] = current
                        ? {
                              attempts: current.attempts + progress.attempts,
                              successes: current.successes + progress.successes,
                              failures: current.failures + progress.failures,
                              totalTimeMs: current.totalTimeMs + progress.totalTimeMs,
                              lastAttemptAt:
                                  current.lastAttemptAt > progress.lastAttemptAt
                                      ? current.lastAttemptAt
                                      : progress.lastAttemptAt,
                          }
                        : progress;
                }
                const learnedAt = [duplicate.learnedAt, line.learnedAt]
                    .filter((value): value is string => Boolean(value))
                    .sort()[0];
                // Keep the more demanding schedule: the review that is due first.
                const review =
                    duplicate.review && line.review
                        ? duplicate.review.due <= line.review.due
                            ? duplicate.review
                            : line.review
                        : (duplicate.review ?? line.review);
                lines[duplicateId] = {
                    ...duplicate,
                    learnedAt,
                    review,
                    trainable: duplicate.trainable || line.trainable,
                    moveProgress,
                    session: {
                        attempts: duplicate.session.attempts + line.session.attempts,
                        completions: duplicate.session.completions + line.session.completions,
                        flawless: duplicate.session.flawless + line.session.flawless,
                        totalTimeMs: duplicate.session.totalTimeMs + line.session.totalTimeMs,
                        lastAttemptAt:
                            !duplicate.session.lastAttemptAt ||
                            (line.session.lastAttemptAt &&
                                line.session.lastAttemptAt > duplicate.session.lastAttemptAt)
                                ? line.session.lastAttemptAt
                                : duplicate.session.lastAttemptAt,
                    },
                };
                delete lines[lineId];
            }
            if (variantId !== targetId) {
                removedVariantIds.add(variantId);
                delete variants[variantId];
            }
        }

        variants[targetId] = {
            ...target,
            name: group.name,
            lineIds,
            commentCount,
            hasVariations: hasVariations || lineIds.length > 1,
        };
    }

    const variantIds = repertoire.variantIds.filter((id) => !removedVariantIds.has(id));
    variantIds.forEach((id, trainingRecordIndex) => {
        const variant = variants[id];
        if (variant) variants[id] = { ...variant, trainingRecordIndex };
    });
    return {
        ...state,
        variants,
        lines,
        repertoires: {
            ...state.repertoires,
            [repertoireId]: {
                ...repertoire,
                variantIds,
                recordCount: variantIds.length,
                updatedAt: new Date().toISOString(),
            },
        },
    };
}

export function isModelGame(headers: GameHeaders): boolean {
    const declaredType = headers.other?.ChessLabContentType;
    if (declaredType === "theory" || declaredType === "modelGame")
        return declaredType === "modelGame";
    return [
        headers.event,
        headers.white,
        headers.black,
        headers.other?.ChapterName,
        headers.other?.StudyName,
    ].some((value) => /model\s*games?|partidas?\s*modelo/i.test(value ?? ""));
}

function treeStats(root: TreeNode): { commentCount: number; hasVariations: boolean } {
    let commentCount = root.comment.trim() ? 1 : 0;
    let hasVariations = root.children.length > 1;
    for (const child of root.children) {
        const childStats = treeStats(child);
        commentCount += childStats.commentCount;
        hasVariations ||= childStats.hasVariations;
    }
    return { commentCount, hasVariations };
}

export function extractOpeningImportLines(
    root: TreeNode,
    policy: OpeningImportConfig["subvariationPolicy"],
): OpeningImportLine[] {
    const lines: OpeningImportLine[] = [];

    function visit(node: TreeNode, path: number[], moves: string[], sans: string[]) {
        const children = policy === "all" ? node.children : node.children.slice(0, 1);
        if (children.length === 0) {
            if (moves.length > 0) {
                lines.push({
                    name:
                        sans.slice(-4).join(" ") ||
                        i18n.t("OpeningImport.LineFallbackName", "Line {{number}}", {
                            number: lines.length + 1,
                        }),
                    fen: root.fen,
                    moves,
                    path,
                    plyCount: moves.length,
                    trainable: true,
                });
            }
            return;
        }

        const [position] = positionFromFen(node.fen);
        if (!position) return;
        children.forEach((child, index) => {
            if (!child.move) return;
            visit(
                child,
                [...path, index],
                [...moves, uciNormalize(position.clone(), child.move)],
                [...sans, child.san ?? ""],
            );
        });
    }

    visit(root, [], [], []);
    return lines;
}

/** Config-dependent view of a parsed record; cheap enough to recompute when the config changes. */
function buildOpeningRecord(
    tree: TreeState,
    sourceRecordIndex: number,
    trainingRecordIndex: number,
    config: Pick<OpeningImportConfig, "subvariationPolicy">,
) {
    const stats = treeStats(tree.root);
    const contentType = isModelGame(tree.headers) ? "modelGame" : "theory";
    const selectedLineKeys = new Set(
        extractOpeningImportLines(tree.root, config.subvariationPolicy).map((line) =>
            lineKey(line.moves),
        ),
    );
    // The section's content type decides trainability at import time, because the review can
    // move a record between theory and model-game sections.
    const lines = extractOpeningImportLines(tree.root, "all").map((line) => ({
        ...line,
        trainable: selectedLineKeys.has(lineKey(line.moves)),
    }));

    return {
        tree,
        variant: {
            name: openingName(tree.headers, sourceRecordIndex),
            sourceRecordIndex,
            trainingRecordIndex,
            contentType,
            commentCount: stats.commentCount,
            hasVariations: stats.hasVariations,
            lines,
        } satisfies OpeningImportVariant,
    };
}

async function readOpeningRecords(path: string, recordCount: number): Promise<string[]> {
    return recordCount > 0 ? unwrap(await commands.readGames(path, 0, recordCount - 1)) : [];
}

async function parseOpeningRecords(records: string[]): Promise<Array<TreeState | null>> {
    const trees: Array<TreeState | null> = [];
    for (const raw of records) {
        try {
            trees.push(await parsePGN(raw));
        } catch {
            trees.push(null);
        }
    }
    return trees;
}

export async function inspectOpeningPgn(
    path: string,
    config: OpeningImportConfig,
): Promise<OpeningPgnInspection> {
    const recordCount = unwrap(await commands.countPgnGames(path));
    const records = await readOpeningRecords(path, recordCount);
    const samples: OpeningPgnSample[] = [];
    const parsedTrees: Array<TreeState | null> = [];

    for (const [index, raw] of records.entries()) {
        try {
            const tree = await parsePGN(raw);
            const parsed = buildOpeningRecord(tree, index, index, config);
            const hints = importGroupingHints(tree.headers);
            samples.push({
                index,
                name: parsed.variant.name,
                startingFen: tree.root.fen,
                ...hints,
                lineCount: parsed.variant.lines.length,
                commentCount: parsed.variant.commentCount,
                hasVariations: parsed.variant.hasVariations,
                contentType: parsed.variant.contentType,
            });
            parsedTrees.push(tree);
        } catch (error) {
            samples.push({
                index,
                name: i18n.t("OpeningImport.RecordFallbackName", "Record {{number}}", {
                    number: index + 1,
                }),
                startingFen: "invalid",
                lineCount: 0,
                commentCount: 0,
                hasVariations: false,
                contentType: "theory",
                error:
                    error instanceof Error
                        ? error.message
                        : i18n.t("OpeningImport.InvalidRecord", "Invalid record"),
            });
            parsedTrees.push(null);
        }
    }

    return { path, filename: filename(path), recordCount, samples, parsedTrees };
}

export async function prepareOpeningImport(
    inspection: OpeningPgnInspection,
    config: OpeningImportConfig,
    overrides: OpeningImportOverrides = {},
): Promise<PreparedOpeningImport> {
    // Reuse the inspection's trees; only fall back to reading the file when they are missing.
    // Trees are never mutated below (merges clone them), so a failed import can be retried.
    const trees =
        inspection.parsedTrees?.length === inspection.recordCount
            ? inspection.parsedTrees
            : await parseOpeningRecords(
                  await readOpeningRecords(inspection.path, inspection.recordCount),
              );
    const parsedRecords: Array<ReturnType<typeof buildOpeningRecord>> = [];
    let skippedRecords = 0;

    for (const [sourceRecordIndex, tree] of trees.entries()) {
        try {
            if (!tree) throw new Error("invalid record");
            parsedRecords.push(
                buildOpeningRecord(tree, sourceRecordIndex, parsedRecords.length, config),
            );
        } catch {
            skippedRecords += 1;
        }
    }

    const parsedBySourceIndex = new Map(
        parsedRecords.map((parsed) => [parsed.variant.sourceRecordIndex, parsed]),
    );
    const previews =
        overrides.groups ?? getOpeningImportGroupPreviews(inspection, config.groupingMode);
    const variants: OpeningImportVariant[] = [];
    const trainingRecords: string[] = [];

    for (const preview of previews) {
        const entries = preview.recordIndexes.flatMap((index) => {
            const parsed = parsedBySourceIndex.get(index);
            return parsed ? [parsed] : [];
        });
        if (entries.length === 0) continue;

        const first = entries[0];
        const root = structuredClone(first.tree.root);
        const selectedLineKeys = new Set<string>();
        const lineNames = new Map<string, string>();
        const importedLines = new Map<string, OpeningImportLine>();
        for (const entry of entries) {
            // `root` is already a private copy, so later records are merged into it in place.
            if (entry !== first) mergeOpeningTreeInto(root, entry.tree.root);
            for (const line of entry.variant.lines) {
                const key = lineKey(line.moves);
                if (line.trainable) selectedLineKeys.add(key);
                if (!importedLines.has(key)) importedLines.set(key, line);
                if (!lineNames.has(key)) {
                    lineNames.set(
                        key,
                        overrides.recordNames?.[entry.variant.sourceRecordIndex] ??
                            lineName(entry.tree.headers, line.name, preview.name),
                    );
                }
            }
        }

        const usedLineNames = new Map<string, number>();
        const lines = [...importedLines.entries()].map(([key, line]) => {
            const baseName = lineNames.get(key) ?? line.name;
            const normalized = normalizedGroupKey(baseName);
            const occurrence = (usedLineNames.get(normalized) ?? 0) + 1;
            usedLineNames.set(normalized, occurrence);
            return {
                ...line,
                path: openingPathForMoves(root, line.moves) ?? line.path,
                name: occurrence === 1 ? baseName : `${baseName} — ${line.name}`,
                trainable: preview.contentType === "theory" && selectedLineKeys.has(key),
            };
        });
        const stats = treeStats(root);
        const trainingRecordIndex = trainingRecords.length;
        const orientation =
            config.color === "both" ? (first.tree.headers.orientation ?? "white") : config.color;
        const headers: GameHeaders = {
            ...first.tree.headers,
            event: preview.name,
            orientation,
            other: {
                ...first.tree.headers.other,
                ChapterName: preview.name,
                ChessLabContentType: preview.contentType,
            },
        };
        trainingRecords.push(
            getPGN(root, {
                headers,
                glyphs: true,
                comments: true,
                variations: true,
                extraMarkups: true,
            }),
        );
        variants.push({
            name: preview.name,
            sourceRecordIndex: first.variant.sourceRecordIndex,
            trainingRecordIndex,
            contentType: preview.contentType,
            commentCount: stats.commentCount,
            hasVariations: stats.hasVariations,
            lines,
        });
    }

    return {
        trainingPgn: trainingRecords.join("\n\n\n"),
        variants,
        skippedRecords,
    };
}

export function mergeImportedOpeningTrees(target: TreeNode, source: TreeNode): TreeNode {
    return mergeOpeningTreeInto(structuredClone(target), source);
}

/**
 * Merges `source` into `target` in place and returns `target`. Only branches new to `target` are
 * cloned, so merging many records into one section stays linear in their size; `source` is never
 * modified.
 */
function mergeOpeningTreeInto(target: TreeNode, source: TreeNode): TreeNode {
    if (target.fen !== source.fen) {
        throw new Error(
            i18n.t(
                "Errors.GroupedLinesIncompatible",
                "The grouped lines start from incompatible positions.",
            ),
        );
    }

    function merge(node: TreeNode, right: TreeNode) {
        const comment = right.comment.trim();
        if (comment && !node.comment.includes(comment)) {
            node.comment = [node.comment.trim(), comment].filter(Boolean).join("\n\n");
        }
        node.annotations = [...new Set([...node.annotations, ...right.annotations])];
        for (const shape of right.shapes) {
            const serialized = JSON.stringify(shape);
            if (!node.shapes.some((existing) => JSON.stringify(existing) === serialized)) {
                node.shapes.push(structuredClone(shape));
            }
        }
        for (const child of right.children) {
            const key = moveKey(child);
            const existing = node.children.find((candidate) => moveKey(candidate) === key);
            if (existing) merge(existing, child);
            else node.children.push(structuredClone(child));
        }
    }

    merge(target, source);
    return target;
}
