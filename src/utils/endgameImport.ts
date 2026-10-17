import { positionFromFen } from "@/utils/chessops";
import {
    endgameThemeFromFen,
    type EndgameTheme,
    type ParsedTrainingRecord,
    type TrainingObjective,
} from "@/utils/trainingAreas";

/** How an imported PGN with many endgames becomes sets (I-08). */
export type EndgameImportGrouping = "single" | "theme" | "chapter";

export type EndgameImportPreview = {
    index: number;
    record: ParsedTrainingRecord;
    theme: EndgameTheme;
    pieces: number;
    chapter: string | null;
    objective: TrainingObjective | null;
};

export const ENDGAME_THEME_ORDER: EndgameTheme[] = [
    "pawn",
    "rook",
    "minorPiece",
    "queen",
    "mixed",
    "other",
];

function header(pgn: string | undefined, name: string): string | null {
    if (!pgn) return null;
    const value = new RegExp(`^\\[${name}\\s+"([^"]*)"\\]`, "im").exec(pgn)?.[1]?.trim();
    return value && value !== "?" ? value : null;
}

/**
 * Chapter of a record as the book writes it: Lichess studies put it in `ChapterName`, most books
 * in `Event`. Only a header that groups several records counts as a chapter.
 */
export function endgameRecordChapter(record: ParsedTrainingRecord): string | null {
    return header(record.sourcePgn, "ChapterName") ?? header(record.sourcePgn, "Event");
}

export function previewEndgameImport(records: ParsedTrainingRecord[]): EndgameImportPreview[] {
    return records.map((record, index) => ({
        index,
        record,
        theme: endgameThemeFromFen(record.fen),
        pieces: positionFromFen(record.fen)[0]?.board.occupied.size() ?? 0,
        chapter: endgameRecordChapter(record),
        objective: record.endgameObjective ?? null,
    }));
}

/** Chapters worth offering: more than one, and each with more than one record on average. */
export function hasUsefulChapters(preview: EndgameImportPreview[]): boolean {
    const chapters = new Set(preview.map((item) => item.chapter ?? ""));
    return chapters.size > 1 && chapters.size < preview.length;
}

export type EndgameImportGroup = { name: string; records: ParsedTrainingRecord[] };

/** Splits the selected records into the sets to create, keeping the order of the PGN. */
export function groupEndgameImport(
    preview: EndgameImportPreview[],
    grouping: EndgameImportGrouping,
    baseName: string,
    themeLabel: (theme: EndgameTheme) => string,
): EndgameImportGroup[] {
    if (preview.length === 0) return [];
    if (grouping === "single") {
        return [{ name: baseName, records: preview.map((item) => item.record) }];
    }
    const groups = new Map<string, EndgameImportGroup>();
    const keys =
        grouping === "theme"
            ? ENDGAME_THEME_ORDER.filter((theme) => preview.some((item) => item.theme === theme))
            : [...new Set(preview.map((item) => item.chapter ?? ""))];
    for (const key of keys) {
        const label = grouping === "theme" ? themeLabel(key as EndgameTheme) : key || baseName;
        groups.set(key, { name: `${baseName} · ${label}`, records: [] });
    }
    for (const item of preview) {
        const key = grouping === "theme" ? item.theme : (item.chapter ?? "");
        groups.get(key)?.records.push(item.record);
    }
    return [...groups.values()].filter((group) => group.records.length > 0);
}
