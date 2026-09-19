import { appDataDir, resolve } from "@tauri-apps/api/path";
import { BaseDirectory, exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { z } from "zod";

export const STUDY_LIBRARY_SCHEMA_VERSION = 1;
const MAX_CHAPTER_REVISIONS = 20;
const MAX_TRASH_ENTRIES = 100;

const studySourceSchema = z.object({
    kind: z.enum(["board", "file", "study"]),
    label: z.string().optional(),
    studyId: z.string().optional(),
    chapterId: z.string().optional(),
});

const studyRevisionSchema = z.object({
    id: z.string(),
    savedAt: z.string(),
    pgn: z.string(),
});

export const studyChapterSchema = z.object({
    id: z.string(),
    title: z.string(),
    pgn: z.string(),
    source: studySourceSchema.optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
    revisions: z.array(studyRevisionSchema),
});

export const studySchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    chapterOrder: z.array(z.string()),
    chapters: z.record(studyChapterSchema),
    createdAt: z.string(),
    updatedAt: z.string(),
});

const trashedStudySchema = z.object({
    id: z.string(),
    kind: z.literal("study"),
    deletedAt: z.string(),
    study: studySchema,
});

const trashedChapterSchema = z.object({
    id: z.string(),
    kind: z.literal("chapter"),
    deletedAt: z.string(),
    studyId: z.string(),
    studyName: z.string(),
    chapter: studyChapterSchema,
});

export const studyLibrarySchema = z.object({
    schemaVersion: z.literal(STUDY_LIBRARY_SCHEMA_VERSION),
    studyOrder: z.array(z.string()),
    studies: z.record(studySchema),
    trash: z.array(z.discriminatedUnion("kind", [trashedStudySchema, trashedChapterSchema])),
    updatedAt: z.string(),
});

export type StudySource = z.infer<typeof studySourceSchema>;
export type StudyRevision = z.infer<typeof studyRevisionSchema>;
export type StudyChapter = z.infer<typeof studyChapterSchema>;
export type Study = z.infer<typeof studySchema>;
export type StudyTrashEntry = z.infer<typeof studyLibrarySchema>["trash"][number];
export type StudyLibrary = z.infer<typeof studyLibrarySchema>;

function timestamp(): string {
    return new Date().toISOString();
}

export function studyId(prefix: string): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createEmptyStudyLibrary(): StudyLibrary {
    return {
        schemaVersion: STUDY_LIBRARY_SCHEMA_VERSION,
        studyOrder: [],
        studies: {},
        trash: [],
        updatedAt: timestamp(),
    };
}

function touch(library: StudyLibrary): StudyLibrary {
    return { ...library, updatedAt: timestamp() };
}

function trimTrash(entries: StudyTrashEntry[]): StudyTrashEntry[] {
    return entries.slice(-MAX_TRASH_ENTRIES);
}

export function createStudy(
    library: StudyLibrary,
    name: string,
    description = "",
    id = studyId("study"),
): StudyLibrary {
    const title = name.trim();
    if (!title) throw new Error("El estudio necesita un nombre.");
    const now = timestamp();
    return touch({
        ...library,
        studyOrder: [...library.studyOrder, id],
        studies: {
            ...library.studies,
            [id]: {
                id,
                name: title,
                description: description.trim(),
                chapterOrder: [],
                chapters: {},
                createdAt: now,
                updatedAt: now,
            },
        },
    });
}

export function updateStudyDetails(
    library: StudyLibrary,
    id: string,
    input: { name: string; description: string },
): StudyLibrary {
    const study = library.studies[id];
    if (!study) throw new Error("No se encontró el estudio.");
    const name = input.name.trim();
    if (!name) throw new Error("El estudio necesita un nombre.");
    return touch({
        ...library,
        studies: {
            ...library.studies,
            [id]: { ...study, name, description: input.description.trim(), updatedAt: timestamp() },
        },
    });
}

export function moveStudy(library: StudyLibrary, id: string, offset: -1 | 1): StudyLibrary {
    const index = library.studyOrder.indexOf(id);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= library.studyOrder.length) return library;
    const studyOrder = [...library.studyOrder];
    [studyOrder[index], studyOrder[target]] = [studyOrder[target], studyOrder[index]];
    return touch({ ...library, studyOrder });
}

export function deleteStudy(library: StudyLibrary, id: string): StudyLibrary {
    const study = library.studies[id];
    if (!study) return library;
    const studies = { ...library.studies };
    delete studies[id];
    return touch({
        ...library,
        studies,
        studyOrder: library.studyOrder.filter((candidate) => candidate !== id),
        trash: trimTrash([
            ...library.trash,
            { id: studyId("trash"), kind: "study", deletedAt: timestamp(), study },
        ]),
    });
}

export function addStudyChapter(
    library: StudyLibrary,
    studyKey: string,
    input: { title: string; pgn: string; source?: StudySource },
    id = studyId("chapter"),
): StudyLibrary {
    const study = library.studies[studyKey];
    if (!study) throw new Error("No se encontró el estudio.");
    const title = input.title.trim();
    if (!title) throw new Error("El capítulo necesita un nombre.");
    if (!input.pgn.trim()) throw new Error("El capítulo necesita contenido PGN.");
    const now = timestamp();
    const chapter: StudyChapter = {
        id,
        title,
        pgn: input.pgn.trim(),
        source: input.source,
        createdAt: now,
        updatedAt: now,
        revisions: [],
    };
    return touch({
        ...library,
        studies: {
            ...library.studies,
            [studyKey]: {
                ...study,
                chapterOrder: [...study.chapterOrder, id],
                chapters: { ...study.chapters, [id]: chapter },
                updatedAt: now,
            },
        },
    });
}

export function updateStudyChapter(
    library: StudyLibrary,
    studyKey: string,
    chapterKey: string,
    input: { title?: string; pgn?: string },
): StudyLibrary {
    const study = library.studies[studyKey];
    const chapter = study?.chapters[chapterKey];
    if (!study || !chapter) throw new Error("No se encontró el capítulo.");
    const title = input.title === undefined ? chapter.title : input.title.trim();
    const pgn = input.pgn === undefined ? chapter.pgn : input.pgn.trim();
    if (!title) throw new Error("El capítulo necesita un nombre.");
    if (!pgn) throw new Error("El capítulo necesita contenido PGN.");
    const changedPgn = pgn !== chapter.pgn;
    const revisions = changedPgn
        ? [
              ...chapter.revisions,
              { id: studyId("revision"), savedAt: timestamp(), pgn: chapter.pgn },
          ].slice(-MAX_CHAPTER_REVISIONS)
        : chapter.revisions;
    const now = timestamp();
    return touch({
        ...library,
        studies: {
            ...library.studies,
            [studyKey]: {
                ...study,
                chapters: {
                    ...study.chapters,
                    [chapterKey]: { ...chapter, title, pgn, revisions, updatedAt: now },
                },
                updatedAt: now,
            },
        },
    });
}

export function restoreStudyChapterRevision(
    library: StudyLibrary,
    studyKey: string,
    chapterKey: string,
    revisionId: string,
): StudyLibrary {
    const chapter = library.studies[studyKey]?.chapters[chapterKey];
    const revision = chapter?.revisions.find((candidate) => candidate.id === revisionId);
    if (!chapter || !revision) throw new Error("No se encontró la revisión.");
    return updateStudyChapter(library, studyKey, chapterKey, { pgn: revision.pgn });
}

export function moveStudyChapter(
    library: StudyLibrary,
    studyKey: string,
    chapterKey: string,
    offset: -1 | 1,
): StudyLibrary {
    const study = library.studies[studyKey];
    if (!study) return library;
    const index = study.chapterOrder.indexOf(chapterKey);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= study.chapterOrder.length) return library;
    const chapterOrder = [...study.chapterOrder];
    [chapterOrder[index], chapterOrder[target]] = [chapterOrder[target], chapterOrder[index]];
    return touch({
        ...library,
        studies: {
            ...library.studies,
            [studyKey]: { ...study, chapterOrder, updatedAt: timestamp() },
        },
    });
}

export function deleteStudyChapter(
    library: StudyLibrary,
    studyKey: string,
    chapterKey: string,
): StudyLibrary {
    const study = library.studies[studyKey];
    const chapter = study?.chapters[chapterKey];
    if (!study || !chapter) return library;
    const chapters = { ...study.chapters };
    delete chapters[chapterKey];
    const now = timestamp();
    return touch({
        ...library,
        studies: {
            ...library.studies,
            [studyKey]: {
                ...study,
                chapters,
                chapterOrder: study.chapterOrder.filter((candidate) => candidate !== chapterKey),
                updatedAt: now,
            },
        },
        trash: trimTrash([
            ...library.trash,
            {
                id: studyId("trash"),
                kind: "chapter",
                deletedAt: now,
                studyId: studyKey,
                studyName: study.name,
                chapter,
            },
        ]),
    });
}

export function restoreStudyTrashEntry(library: StudyLibrary, trashId: string): StudyLibrary {
    const entry = library.trash.find((candidate) => candidate.id === trashId);
    if (!entry) return library;
    const trash = library.trash.filter((candidate) => candidate.id !== trashId);
    if (entry.kind === "study") {
        let restored = entry.study;
        let id = restored.id;
        if (library.studies[id]) {
            id = studyId("study");
            restored = { ...restored, id };
        }
        return touch({
            ...library,
            trash,
            studyOrder: [...library.studyOrder, id],
            studies: { ...library.studies, [id]: restored },
        });
    }
    const study = library.studies[entry.studyId];
    if (!study) throw new Error(`Restaura primero el estudio «${entry.studyName}».`);
    let chapter = entry.chapter;
    let chapterId = chapter.id;
    if (study.chapters[chapterId]) {
        chapterId = studyId("chapter");
        chapter = { ...chapter, id: chapterId };
    }
    return touch({
        ...library,
        trash,
        studies: {
            ...library.studies,
            [study.id]: {
                ...study,
                chapterOrder: [...study.chapterOrder, chapterId],
                chapters: { ...study.chapters, [chapterId]: chapter },
                updatedAt: timestamp(),
            },
        },
    });
}

export function permanentlyDeleteStudyTrashEntry(
    library: StudyLibrary,
    trashId: string,
): StudyLibrary {
    return touch({
        ...library,
        trash: library.trash.filter((candidate) => candidate.id !== trashId),
    });
}

function escapeHeader(value: string): string {
    return value
        .replaceAll("\\", "\\\\")
        .replaceAll('"', '\\"')
        .replace(/[\r\n]+/g, " ");
}

function setPgnHeader(pgn: string, name: string, value: string): string {
    const header = `[${name} "${escapeHeader(value)}"]`;
    const expression = new RegExp(`^\\[${name}\\s+"(?:[^"\\\\]|\\\\.)*"\\]$`, "im");
    if (expression.test(pgn)) return pgn.replace(expression, header);
    const firstHeader = pgn.search(/^\s*\[/m);
    if (firstHeader < 0) return `${header}\n${pgn.trim()}`;
    return `${pgn.slice(0, firstHeader)}${header}\n${pgn.slice(firstHeader)}`;
}

export function exportStudyChapterPgn(study: Study, chapter: StudyChapter): string {
    let pgn = setPgnHeader(chapter.pgn.trim(), "StudyName", study.name);
    pgn = setPgnHeader(pgn, "ChapterName", chapter.title);
    pgn = setPgnHeader(pgn, "OnyxStudyId", study.id);
    pgn = setPgnHeader(pgn, "OnyxChapterId", chapter.id);
    return `${pgn}\n`;
}

export function exportStudyPgn(study: Study): string {
    return study.chapterOrder
        .map((id) => study.chapters[id])
        .filter((chapter): chapter is StudyChapter => Boolean(chapter))
        .map((chapter) => exportStudyChapterPgn(study, chapter).trim())
        .join("\n\n\n");
}

const STUDIES_DIRECTORY = "studies";
const LIBRARY_FILE = `${STUDIES_DIRECTORY}/library.json`;
const BACKUP_FILE = `${STUDIES_DIRECTORY}/library.backup.json`;
let mutationLane: Promise<unknown> = Promise.resolve();

async function ensureStudiesDirectory(): Promise<void> {
    if (!(await exists(STUDIES_DIRECTORY, { baseDir: BaseDirectory.AppData }))) {
        await mkdir(STUDIES_DIRECTORY, { baseDir: BaseDirectory.AppData, recursive: true });
    }
}

export async function loadStudyLibrary(): Promise<{
    library: StudyLibrary;
    recoveredFromBackup: boolean;
}> {
    await ensureStudiesDirectory();
    for (const [path, recoveredFromBackup] of [
        [LIBRARY_FILE, false],
        [BACKUP_FILE, true],
    ] as const) {
        if (!(await exists(path, { baseDir: BaseDirectory.AppData }))) continue;
        try {
            const library = studyLibrarySchema.parse(
                JSON.parse(await readTextFile(path, { baseDir: BaseDirectory.AppData })),
            );
            return { library, recoveredFromBackup };
        } catch {
            // Try the recovery copy before starting an empty library.
        }
    }
    return { library: createEmptyStudyLibrary(), recoveredFromBackup: false };
}

export async function saveStudyLibrary(library: StudyLibrary): Promise<void> {
    await ensureStudiesDirectory();
    const validated = studyLibrarySchema.parse(library);
    if (await exists(LIBRARY_FILE, { baseDir: BaseDirectory.AppData })) {
        const current = await readTextFile(LIBRARY_FILE, { baseDir: BaseDirectory.AppData });
        try {
            studyLibrarySchema.parse(JSON.parse(current));
            await writeTextFile(BACKUP_FILE, current, { baseDir: BaseDirectory.AppData });
        } catch {
            // Never replace a valid recovery copy with a corrupt primary manifest.
        }
    }
    await writeTextFile(LIBRARY_FILE, JSON.stringify(validated, null, 2), {
        baseDir: BaseDirectory.AppData,
    });
}

export function updateStudyLibrary(
    update: (current: StudyLibrary) => StudyLibrary | Promise<StudyLibrary>,
): Promise<StudyLibrary> {
    const operation = mutationLane.then(async () => {
        const { library } = await loadStudyLibrary();
        const next = studyLibrarySchema.parse(await update(library));
        await saveStudyLibrary(next);
        return next;
    });
    mutationLane = operation.catch(() => undefined);
    return operation;
}

export async function saveStudyChapterPgn(
    studyKey: string,
    chapterKey: string,
    pgn: string,
): Promise<StudyLibrary> {
    return updateStudyLibrary((library) =>
        updateStudyChapter(library, studyKey, chapterKey, { pgn }),
    );
}

export function parseStudyLibraryBackup(raw: string): StudyLibrary {
    return studyLibrarySchema.parse(JSON.parse(raw));
}

export async function writeStudySourcePgn(name: string, pgn: string): Promise<string> {
    await ensureStudiesDirectory();
    const directory = `${STUDIES_DIRECTORY}/training-sources`;
    if (!(await exists(directory, { baseDir: BaseDirectory.AppData }))) {
        await mkdir(directory, { baseDir: BaseDirectory.AppData, recursive: true });
    }
    const safe = name
        .normalize("NFKD")
        .replace(/[^a-zA-Z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
    const relative = `${directory}/${safe || "study"}-${studyId("source")}.pgn`;
    await writeTextFile(relative, `${pgn.trim()}\n`, { baseDir: BaseDirectory.AppData });
    return resolve(await appDataDir(), relative);
}
