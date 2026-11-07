import { join } from "@tauri-apps/api/path";
import { readDir } from "@tauri-apps/plugin-fs";
import i18n from "i18next";
import { commands } from "@/bindings";
import { parsePGN, uciNormalize } from "@/utils/chess";
import { positionFromFen } from "@/utils/chessops";
import { canonicalUci, playUci } from "@/utils/repertoireGenerator/positions";
import type {
    TacticsExercise,
    TacticsSet,
    TacticsStartingActor,
    TacticsVariationPolicy,
} from "@/utils/trainingAreas";
import type { TreeNode } from "@/utils/treeReducer";
import { unwrap } from "@/utils/unwrap";

export type TacticsLoadedExercise = {
    id: string;
    recordIndex: number;
    title: string;
    fen: string;
    solutionLines: string[][];
    hasVariations: boolean;
    sourcePgn: string;
};

export type TacticsPgnSample = {
    index: number;
    title: string;
    moveCount: number;
    hasVariations: boolean;
    hasSolution: boolean;
    error?: string;
};

export type TacticsPgnInspection = {
    path: string;
    filename: string;
    recordCount: number;
    samples: TacticsPgnSample[];
};

function filename(path: string): string {
    return (
        path.split(/[\\/]/).pop() || `${i18n.t("Training.TacticsSetFallback", "Tactics set")}.pgn`
    );
}

function treeHasVariations(node: TreeNode): boolean {
    return node.children.length > 1 || node.children.some(treeHasVariations);
}

/**
 * Solution lines that continue with `uci` after `ply` moves from `rootFen` (every line given shares
 * those first moves). Castling is compared in one form: solutions store it as king-takes-rook
 * ("e1a1", via `uciNormalize`) while the board sends the king's two-square step ("e1c1").
 */
export function solutionLinesWith(
    rootFen: string,
    lines: string[][],
    ply: number,
    uci: string,
): string[][] {
    let fen: string | null = rootFen;
    for (const move of lines[0]?.slice(0, ply) ?? []) {
        fen = playUci(fen, move)?.fen ?? null;
        if (!fen) break;
    }
    const played = fen ? (canonicalUci(fen, uci) ?? uci) : uci;
    return lines.filter((line) => {
        const move = line[ply];
        if (move === undefined) return false;
        if (move === uci) return true;
        return fen !== null && (canonicalUci(fen, move) ?? move) === played;
    });
}

function isStudentTurn(ply: number, startingActor: TacticsStartingActor): boolean {
    return startingActor === "student" ? ply % 2 === 0 : ply % 2 === 1;
}

export function extractTacticsSolutionLines(
    root: TreeNode,
    variationPolicy: TacticsVariationPolicy,
    startingActor: TacticsStartingActor,
): string[][] {
    const lines: string[][] = [];

    function visit(node: TreeNode, prefix: string[]) {
        if (node.children.length === 0) {
            if (prefix.length > 0) lines.push(prefix);
            return;
        }

        const studentTurn = isStudentTurn(prefix.length, startingActor);
        const children =
            variationPolicy === "all" || (variationPolicy === "opponentResponses" && !studentTurn)
                ? node.children
                : node.children.slice(0, 1);

        const [position] = positionFromFen(node.fen);
        if (!position) return;

        for (const child of children) {
            if (!child.move) continue;
            visit(child, [...prefix, uciNormalize(position.clone(), child.move)]);
        }
    }

    visit(root, []);
    return lines;
}

export async function parseTacticsPgnRecord(
    raw: string,
    recordIndex: number,
    config: Pick<TacticsSet["config"], "startingActor" | "variationPolicy">,
): Promise<TacticsLoadedExercise> {
    const tree = await parsePGN(raw);
    const [position] = positionFromFen(tree.headers.fen);
    if (!position) {
        throw new Error(i18n.t("Errors.RecordInvalidFen", "The record FEN position is not valid."));
    }

    return {
        id: `record-${recordIndex}`,
        recordIndex,
        title: tree.headers.event || `${tree.headers.white} - ${tree.headers.black}`,
        fen: tree.headers.fen,
        solutionLines: extractTacticsSolutionLines(
            tree.root,
            config.variationPolicy,
            config.startingActor,
        ),
        hasVariations: treeHasVariations(tree.root),
        sourcePgn: raw,
    };
}

export type TacticsCourseFile = {
    path: string;
    filename: string;
    /** Theme name: the file name without its extension or leading number ("01. Pin" → "Pin"). */
    title: string;
    recordCount: number;
    /** Suggested for import: has exercises and, when the folder numbers its themes, is numbered. */
    suggested: boolean;
    error?: string;
};

const NUMBERED_FILE = /^\s*\d+\s*[.)_-]?\s*/;

/** Theme name for a course file: no extension and no leading "01. ". */
export function courseThemeTitle(filename: string): string {
    const base = filename.replace(/\.[^.]+$/, "");
    return base.replace(NUMBERED_FILE, "").trim() || base;
}

/**
 * Orders a course folder's PGN files and suggests which to import. When some files are numbered
 * ("01. Double Attack.pgn") and others are not ("Whole book.pgn"), only the numbered ones are
 * suggested: the others are usually the complete book or another course.
 */
export function planTacticsCourseFiles(
    files: { path: string; filename: string; recordCount: number; error?: string }[],
): TacticsCourseFile[] {
    const sorted = [...files].sort((a, b) =>
        a.filename.localeCompare(b.filename, undefined, { numeric: true, sensitivity: "base" }),
    );
    const numbered = sorted.filter((file) => NUMBERED_FILE.test(file.filename)).length;
    const onlyNumbered = numbered > 0 && numbered < sorted.length;
    return sorted.map((file) => ({
        ...file,
        title: courseThemeTitle(file.filename),
        suggested:
            file.recordCount > 0 &&
            !file.error &&
            (!onlyNumbered || NUMBERED_FILE.test(file.filename)),
    }));
}

/** Reads a folder's PGN files (not its subfolders) to import them as a course. */
export async function scanTacticsCourseFolder(
    directory: string,
): Promise<{ name: string; files: TacticsCourseFile[] }> {
    const entries = await readDir(directory);
    const pgns = entries.filter((entry) => entry.isFile && /\.pgn$/i.test(entry.name));
    const files = await Promise.all(
        pgns.map(async (entry) => {
            const path = await join(directory, entry.name);
            try {
                return {
                    path,
                    filename: entry.name,
                    recordCount: unwrap(await commands.countPgnGames(path)),
                };
            } catch (error) {
                return {
                    path,
                    filename: entry.name,
                    recordCount: 0,
                    error: error instanceof Error ? error.message : String(error),
                };
            }
        }),
    );
    const name = directory.split(/[\\/]/).filter(Boolean).pop() ?? directory;
    return { name, files: planTacticsCourseFiles(files) };
}

export async function inspectTacticsPgn(
    path: string,
    config: Pick<TacticsSet["config"], "startingActor" | "variationPolicy">,
    sampleSize = 12,
): Promise<TacticsPgnInspection> {
    const recordCount = unwrap(await commands.countPgnGames(path));
    const end = Math.min(recordCount, sampleSize) - 1;
    const records = end >= 0 ? unwrap(await commands.readGames(path, 0, end)) : [];
    const samples = await Promise.all(
        records.map(async (raw, index): Promise<TacticsPgnSample> => {
            try {
                const parsed = await parseTacticsPgnRecord(raw, index, config);
                return {
                    index,
                    title: parsed.title,
                    moveCount: parsed.solutionLines[0]?.length ?? 0,
                    hasVariations: parsed.hasVariations,
                    hasSolution: parsed.solutionLines.length > 0,
                };
            } catch (error) {
                return {
                    index,
                    title: `Registro ${index + 1}`,
                    moveCount: 0,
                    hasVariations: false,
                    hasSolution: false,
                    error:
                        error instanceof Error
                            ? error.message
                            : i18n.t("OpeningImport.InvalidRecord", "Invalid record"),
                };
            }
        }),
    );

    return { path, filename: filename(path), recordCount, samples };
}

export async function loadTacticsFileExercise(
    set: Pick<TacticsSet, "source" | "config">,
    recordIndex: number,
): Promise<TacticsLoadedExercise> {
    if (set.source?.kind !== "pgnFile") {
        throw new Error(i18n.t("Errors.SetNotLinkedToPgn", "The set is not linked to a PGN file."));
    }
    const records = unwrap(await commands.readGames(set.source.path, recordIndex, recordIndex));
    if (!records[0]) {
        throw new Error(
            i18n.t("Errors.ExerciseReadFailed", "Could not read exercise {{number}}.", {
                number: recordIndex + 1,
            }),
        );
    }
    return parseTacticsPgnRecord(records[0], recordIndex, set.config);
}

export async function loadEmbeddedTacticsExercise(
    exercise: TacticsExercise,
    config: Pick<TacticsSet["config"], "startingActor" | "variationPolicy">,
    recordIndex: number,
): Promise<TacticsLoadedExercise> {
    if (exercise.source.study && exercise.source.pgn) {
        const parsed = await parseTacticsPgnRecord(exercise.source.pgn, recordIndex, config);
        return { ...parsed, id: exercise.id, title: exercise.title };
    }
    return {
        id: exercise.id,
        recordIndex,
        title: exercise.title,
        fen: exercise.fen,
        solutionLines: exercise.solutionMoves.length > 0 ? [exercise.solutionMoves] : [],
        hasVariations: false,
        sourcePgn: exercise.source.pgn ?? "",
    };
}

export async function loadTacticsExercise(
    set: Pick<TacticsSet, "source" | "exerciseIds" | "config">,
    exercises: Record<string, TacticsExercise>,
    recordIndex: number,
): Promise<TacticsLoadedExercise> {
    if (set.source?.kind === "pgnFile") return loadTacticsFileExercise(set, recordIndex);
    const exerciseId = set.exerciseIds[recordIndex];
    const exercise = exercises[exerciseId];
    if (!exercise)
        throw new Error(
            i18n.t("Errors.ExerciseReadFailed", "Could not read exercise {{number}}.", {
                number: recordIndex + 1,
            }),
        );
    return loadEmbeddedTacticsExercise(exercise, set.config, recordIndex);
}
