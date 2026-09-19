import { parsePGN } from "./chess";
import { getGameName } from "./treeReducer";

export const MAX_PASTED_PGN_CHARACTERS = 5_000_000;
export const MAX_PASTED_PGN_RECORDS = 500;

export type StudyPgnImportErrorCode = "empty" | "tooLarge" | "tooMany" | "invalid";

export class StudyPgnImportError extends Error {
    constructor(
        public readonly code: StudyPgnImportErrorCode,
        public readonly recordNumber?: number,
    ) {
        super(code);
        this.name = "StudyPgnImportError";
    }
}

export type ImportedStudyChapter = {
    title: string;
    pgn: string;
    generatedTitle: boolean;
};

export function splitPgnTextRecords(raw: string): string[] {
    const lines = raw.replace(/\r/g, "").split("\n");
    const records: string[] = [];
    let current: string[] = [];

    for (const line of lines) {
        const startsGame = /^\s*\[Event\s+"/i.test(line);
        if (startsGame && current.some((entry) => entry.trim())) {
            records.push(current.join("\n").trim());
            current = [];
        }
        current.push(line);
    }

    if (current.some((entry) => entry.trim())) records.push(current.join("\n").trim());
    return records.filter(Boolean);
}

export async function parseStudyPgnText(raw: string): Promise<ImportedStudyChapter[]> {
    const trimmed = raw.trim();
    if (!trimmed) throw new StudyPgnImportError("empty");
    if (trimmed.length > MAX_PASTED_PGN_CHARACTERS) {
        throw new StudyPgnImportError("tooLarge");
    }

    const records = splitPgnTextRecords(trimmed);
    if (records.length > MAX_PASTED_PGN_RECORDS) {
        throw new StudyPgnImportError("tooMany");
    }

    const chapters: ImportedStudyChapter[] = [];
    for (const [index, pgn] of records.entries()) {
        try {
            const tree = await parsePGN(pgn);
            if (tree.root.children.length === 0) throw new Error("PGN has no moves");
            const inferredTitle = getGameName(tree.headers);
            chapters.push({
                pgn,
                title:
                    tree.headers.other?.ChapterName?.trim() ||
                    (inferredTitle !== "Unknown" ? inferredTitle : `Chapter ${index + 1}`),
                generatedTitle:
                    !tree.headers.other?.ChapterName?.trim() && inferredTitle === "Unknown",
            });
        } catch {
            throw new StudyPgnImportError("invalid", index + 1);
        }
    }
    return chapters;
}
