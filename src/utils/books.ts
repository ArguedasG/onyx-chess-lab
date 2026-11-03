import { BaseDirectory, exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { z } from "zod";
import { commands } from "@/bindings";
import { unwrap } from "./unwrap";

/**
 * Books (phase 9.4, I-55). The library keeps paths, never copies, and a book is identified by
 * the SHA-256 of its file. Each book has its own file with the diagram corrections the user
 * saved. Nothing of the book itself is stored.
 */
export const BOOK_LIBRARY_SCHEMA_VERSION = 1;
export const BOOK_NOTES_SCHEMA_VERSION = 1;

const bookSchema = z.object({
    /** First 16 hex digits of the file's SHA-256. */
    id: z.string(),
    sha256: z.string(),
    size: z.number(),
    path: z.string(),
    title: z.string(),
    pages: z.number().int().nonnegative(),
    lastPage: z.number().int().positive(),
    addedAt: z.string(),
    lastOpenedAt: z.string().optional(),
});

export const bookLibrarySchema = z.object({
    schemaVersion: z.literal(BOOK_LIBRARY_SCHEMA_VERSION),
    books: z.array(bookSchema),
    updatedAt: z.string(),
});

const diagramCorrectionSchema = z.object({
    page: z.number().int().positive(),
    /** Diagram box in PDF units (x0, y0, x1, y1), origin at the page's bottom-left. */
    box: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    fen: z.string(),
    /** What the model had read, kept to measure it later (private evaluation). */
    readPlacement: z.string().nullable(),
    savedAt: z.string(),
});

export const bookNotesSchema = z.object({
    schemaVersion: z.literal(BOOK_NOTES_SCHEMA_VERSION),
    bookId: z.string(),
    corrections: z.array(diagramCorrectionSchema),
});

export type Book = z.infer<typeof bookSchema>;
export type BookLibrary = z.infer<typeof bookLibrarySchema>;
export type DiagramCorrection = z.infer<typeof diagramCorrectionSchema>;
export type BookNotes = z.infer<typeof bookNotesSchema>;

const DIRECTORY = "books";
const LIBRARY_FILE = `${DIRECTORY}/library.json`;
const notesFile = (bookId: string) => `${DIRECTORY}/${bookId}.json`;
const options = { baseDir: BaseDirectory.AppData };
let lane: Promise<unknown> = Promise.resolve();

function now(): string {
    return new Date().toISOString();
}

async function ensureDirectory(): Promise<void> {
    if (!(await exists(DIRECTORY, options)))
        await mkdir(DIRECTORY, { ...options, recursive: true });
}

async function readJson<T>(path: string, schema: z.ZodType<T>): Promise<T | null> {
    if (!(await exists(path, options))) return null;
    try {
        return schema.parse(JSON.parse(await readTextFile(path, options)));
    } catch {
        return null;
    }
}

/** One write at a time, so two quick updates never lose each other. */
function serialized<T>(operation: () => Promise<T>): Promise<T> {
    const next = lane.then(operation);
    lane = next.catch(() => undefined);
    return next;
}

export async function loadBookLibrary(): Promise<BookLibrary> {
    await ensureDirectory();
    return (
        (await readJson(LIBRARY_FILE, bookLibrarySchema)) ?? {
            schemaVersion: BOOK_LIBRARY_SCHEMA_VERSION,
            books: [],
            updatedAt: now(),
        }
    );
}

export function updateBookLibrary(
    update: (library: BookLibrary) => BookLibrary,
): Promise<BookLibrary> {
    return serialized(async () => {
        const next = bookLibrarySchema.parse({
            ...update(await loadBookLibrary()),
            updatedAt: now(),
        });
        await writeTextFile(LIBRARY_FILE, JSON.stringify(next, null, 2), options);
        return next;
    });
}

export function titleFromPath(path: string): string {
    const name = path.split(/[\\/]/).pop() ?? path;
    return name
        .replace(/\.pdf$/i, "")
        .replace(/[_]+/g, " ")
        .trim();
}

/**
 * Adds PDF files to the library. A file already there (same content) only gets its path updated,
 * so moving a book keeps its reading point and corrections.
 */
export async function addBooks(paths: string[]): Promise<BookLibrary> {
    const fingerprints = await Promise.all(
        paths.map(async (path) => ({
            path,
            fingerprint: unwrap(await commands.bookFingerprint(path)),
        })),
    );
    return updateBookLibrary((library) => {
        const books = [...library.books];
        for (const { path, fingerprint } of fingerprints) {
            const id = fingerprint.sha256.slice(0, 16);
            const existing = books.findIndex((book) => book.id === id);
            if (existing >= 0) {
                books[existing] = { ...books[existing], path };
                continue;
            }
            books.push({
                id,
                sha256: fingerprint.sha256,
                size: fingerprint.size,
                path,
                title: titleFromPath(path),
                pages: 0,
                lastPage: 1,
                addedAt: now(),
            });
        }
        return { ...library, books };
    });
}

/** Removes a book from the library (its file is never touched). */
export function removeBook(id: string): Promise<BookLibrary> {
    return updateBookLibrary((library) => ({
        ...library,
        books: library.books.filter((book) => book.id !== id),
    }));
}

export function updateBook(
    id: string,
    patch: Partial<Pick<Book, "lastPage" | "pages" | "lastOpenedAt" | "title">>,
) {
    return updateBookLibrary((library) => ({
        ...library,
        books: library.books.map((book) => (book.id === id ? { ...book, ...patch } : book)),
    }));
}

export async function loadBookNotes(bookId: string): Promise<BookNotes> {
    await ensureDirectory();
    return (
        (await readJson(notesFile(bookId), bookNotesSchema)) ?? {
            schemaVersion: BOOK_NOTES_SCHEMA_VERSION,
            bookId,
            corrections: [],
        }
    );
}

const overlaps = (a: number[], b: number[]) =>
    Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) *
    Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

/** The saved correction of the diagram at that box, if any (same page, mostly the same area). */
export function findCorrection(
    notes: BookNotes,
    page: number,
    box: number[],
): DiagramCorrection | null {
    const area = (r: number[]) => (r[2] - r[0]) * (r[3] - r[1]);
    return (
        notes.corrections.find(
            (c) => c.page === page && overlaps(c.box, box) > 0.6 * Math.min(area(c.box), area(box)),
        ) ?? null
    );
}

/** Saves (or replaces) the correction of one diagram. */
export function saveCorrection(
    bookId: string,
    correction: Omit<DiagramCorrection, "savedAt">,
): Promise<BookNotes> {
    return serialized(async () => {
        const notes = await loadBookNotes(bookId);
        const others = notes.corrections.filter(
            (c) => c !== findCorrection(notes, correction.page, correction.box),
        );
        const next = bookNotesSchema.parse({
            ...notes,
            corrections: [...others, { ...correction, savedAt: now() }],
        });
        await writeTextFile(notesFile(bookId), JSON.stringify(next, null, 2), options);
        return next;
    });
}
