import { readFile } from "@tauri-apps/plugin-fs";

/** CRLF and lone CR (classic Mac files) become LF. */
export function normalizePgnLineEndings(text: string): string {
    return text.replace(/\r\n?/g, "\n");
}

/**
 * Decodes PGN bytes as UTF-8, or as Windows-1252 when they are not valid UTF-8
 * (older publisher and ChessBase exports), and normalizes line endings.
 */
export function decodePgnBytes(bytes: Uint8Array): string {
    let text: string;
    try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
        text = decodeWindows1252(bytes);
    }
    return normalizePgnLineEndings(text.replace(/^﻿/, ""));
}

// 0x80–0x9F differ from Latin-1; undefined positions keep their C1 code point.
const WINDOWS_1252_HIGH = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ";

function decodeWindows1252(bytes: Uint8Array): string {
    let text = "";
    for (const byte of bytes) {
        text +=
            byte >= 0x80 && byte <= 0x9f
                ? WINDOWS_1252_HIGH[byte - 0x80]
                : String.fromCharCode(byte);
    }
    return text;
}

/** Reads a user-chosen PGN file whatever its encoding or line endings. */
export async function readPgnTextFile(path: string): Promise<string> {
    return decodePgnBytes(await readFile(path));
}
