import {
    BaseDirectory,
    exists,
    mkdir,
    readDir,
    readFile,
    readTextFile,
    remove,
    writeTextFile,
} from "@tauri-apps/plugin-fs";

/**
 * Piece sets the user loads from a folder of their own images. Onyx ships only openly licensed
 * sets; these never leave the user's computer. The images are embedded in a CSS file kept in
 * the app data folder, so the set keeps working if the original folder moves or is deleted.
 */
export type CustomPieceSet = { id: string; name: string };

export const CUSTOM_PIECE_SET_PREFIX = "custom:";

const COLORS = { w: "white", b: "black" } as const;
const ROLES = { P: "pawn", N: "knight", B: "bishop", R: "rook", Q: "queen", K: "king" } as const;
export type PieceCode = `${keyof typeof COLORS}${keyof typeof ROLES}`;
export const PIECE_CODES = (Object.keys(COLORS) as (keyof typeof COLORS)[]).flatMap((c) =>
    (Object.keys(ROLES) as (keyof typeof ROLES)[]).map((r) => `${c}${r}` as PieceCode),
);

const MIME_TYPES: Record<string, string> = {
    png: "image/png",
    svg: "image/svg+xml",
    webp: "image/webp",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
};
/** A piece image larger than this is surely not a piece; it would bloat the stylesheet. */
export const MAX_PIECE_FILE_BYTES = 2 * 1024 * 1024;

function extension(fileName: string): string {
    const dot = fileName.lastIndexOf(".");
    return dot < 0 ? "" : fileName.slice(dot + 1).toLowerCase();
}

/** The names a piece's file may have once lowercased and stripped of separators. */
function namesFor(code: PieceCode): string[] {
    const color = COLORS[code[0] as keyof typeof COLORS];
    const role = ROLES[code[1] as keyof typeof ROLES];
    // wP (chess.com, Lichess sources), white-pawn, pawn_white, whitepawn...
    return [code.toLowerCase(), `${color}${role}`, `${role}${color}`];
}

/**
 * Matches the files of a folder with the twelve pieces. Case and separators are ignored, so
 * "wP.png", "white-pawn.svg" and "Pawn_White.png" all name the white pawn.
 */
export function matchPieceFiles(fileNames: string[]): {
    found: Partial<Record<PieceCode, string>>;
    missing: PieceCode[];
} {
    const images = fileNames.filter((name) => MIME_TYPES[extension(name)]);
    const found: Partial<Record<PieceCode, string>> = {};
    for (const code of PIECE_CODES) {
        const names = namesFor(code);
        const match = images
            .filter((file) => {
                const stem = file
                    .slice(0, file.lastIndexOf("."))
                    .toLowerCase()
                    .replace(/[^a-z]/g, "");
                return names.includes(stem);
            })
            // Several formats of the same piece: prefer SVG, which stays sharp at any size.
            .sort((a, b) => Number(extension(b) === "svg") - Number(extension(a) === "svg"))[0];
        if (match) found[code] = match;
    }
    return { found, missing: PIECE_CODES.filter((code) => !found[code]) };
}

export function mimeTypeOf(fileName: string): string | undefined {
    return MIME_TYPES[extension(fileName)];
}

function toBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
}

/** The same shape as the bundled sets in public/pieces: one rule per piece. */
export function buildPieceSetCss(images: Record<PieceCode, { mime: string; bytes: Uint8Array }>) {
    return PIECE_CODES.map((code) => {
        const { mime, bytes } = images[code];
        const color = COLORS[code[0] as keyof typeof COLORS];
        const role = ROLES[code[1] as keyof typeof ROLES];
        return `.${role}.${color} {background-image:url('data:${mime};base64,${toBase64(bytes)}')}`;
    }).join("\n");
}

/** A stable id from the folder name, so loading the same folder again replaces the set. */
export function customPieceSetId(name: string): string {
    const slug = name
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return slug || "pieces";
}

export function isCustomPieceSet(value: string): boolean {
    return value.startsWith(CUSTOM_PIECE_SET_PREFIX);
}

export function customPieceSetValue(id: string): string {
    return `${CUSTOM_PIECE_SET_PREFIX}${id}`;
}

export function customPieceSetIdOf(value: string): string {
    return value.slice(CUSTOM_PIECE_SET_PREFIX.length);
}

const DIRECTORY = "pieces";
const options = { baseDir: BaseDirectory.AppData };
const cssFile = (id: string) => `${DIRECTORY}/${id}.css`;

export class MissingPiecesError extends Error {
    constructor(readonly missing: PieceCode[]) {
        super(`Missing pieces: ${missing.join(", ")}`);
    }
}

export class PieceFileTooLargeError extends Error {
    constructor(readonly fileName: string) {
        super(`${fileName} is too large`);
    }
}

/** Reads the twelve images of a folder and keeps them as a piece set named after the folder. */
export async function importPieceSetFromFolder(directory: string): Promise<CustomPieceSet> {
    const entries = await readDir(directory);
    const { found, missing } = matchPieceFiles(
        entries.filter((entry) => entry.isFile).map((entry) => entry.name),
    );
    if (missing.length > 0) throw new MissingPiecesError(missing);

    const separator = directory.includes("\\") ? "\\" : "/";
    const images = {} as Record<PieceCode, { mime: string; bytes: Uint8Array }>;
    for (const code of PIECE_CODES) {
        const fileName = found[code]!;
        const bytes = await readFile(`${directory}${separator}${fileName}`);
        if (bytes.length > MAX_PIECE_FILE_BYTES) throw new PieceFileTooLargeError(fileName);
        images[code] = { mime: mimeTypeOf(fileName)!, bytes };
    }

    const name = directory.split(/[\\/]/).filter(Boolean).pop() ?? "Pieces";
    const id = customPieceSetId(name);
    if (!(await exists(DIRECTORY, options)))
        await mkdir(DIRECTORY, { ...options, recursive: true });
    const css = buildPieceSetCss(images);
    await writeTextFile(cssFile(id), css, options);
    cssCache.set(id, css);
    return { id, name };
}

/** Stylesheets already read, so switching back to a set does not touch the disk again. */
const cssCache = new Map<string, string | null>();

export function cachedCustomPieceCss(id: string): string | null | undefined {
    return cssCache.get(id);
}

/** The stylesheet of a loaded set, or null when its file is gone. */
export async function loadCustomPieceCss(id: string): Promise<string | null> {
    if (cssCache.has(id)) return cssCache.get(id)!;
    let css: string | null = null;
    try {
        if (await exists(cssFile(id), options)) css = await readTextFile(cssFile(id), options);
    } catch {
        // Unreadable counts as gone: the default set is shown instead.
    }
    cssCache.set(id, css);
    return css;
}

export async function removeCustomPieceSet(id: string): Promise<void> {
    cssCache.delete(id);
    if (await exists(cssFile(id), options)) await remove(cssFile(id), options);
}
