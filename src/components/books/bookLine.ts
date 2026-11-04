/**
 * «Abrir esta partida» in the reader: the text of a few pages around a double click, the move
 * under the pointer, and where each move of a line is on the page (to mark it).
 */

import { joinRuns, type PageRun, type Token, tokenize } from "@/utils/bookGame";
import type { TextRun } from "@/utils/bookText";
import type { PdfBox } from "./diagram";

/** The text of pages `first`..`last` in reading order, tokenized. */
export type TextWindow = {
    runs: PageRun[];
    starts: number[];
    text: string;
    tokens: Token[];
};

export function textWindow(pages: { page: number; runs: TextRun[] }[]): TextWindow {
    const runs: PageRun[] = pages.flatMap(({ page, runs }) => runs.map((r) => ({ ...r, page })));
    const { text, starts } = joinRuns(runs);
    return { runs, starts, text, tokens: tokenize(text) };
}

/** Box of a run in PDF units: the baseline sits a little above the bottom of the letters. */
const runBox = (r: PageRun): PdfBox => [r.x, r.y - 0.25 * r.height, r.x + r.width, r.y + r.height];

/**
 * Index of the move token under (x, y) on `page`, or null. A click on a move number takes the
 * move after it.
 */
export function moveAt(w: TextWindow, page: number, x: number, y: number): number | null {
    const index = w.runs.findIndex((r) => {
        if (r.page !== page) return false;
        const [x0, y0, x1, y1] = runBox(r);
        return x >= x0 && x <= x1 && y >= y0 && y <= y1;
    });
    if (index < 0) return null;
    const run = w.runs[index];
    const fraction = run.width > 0 ? (x - run.x) / run.width : 0;
    const offset =
        w.starts[index] +
        Math.min(run.str.length - 1, Math.max(0, Math.floor(fraction * run.str.length)));
    const runEnd = w.starts[index] + run.str.length;
    let at = w.tokens.findIndex((t) => t.start <= offset && offset < Math.max(t.end, t.start + 1));
    if (at < 0) return null;
    // The number of a move: the move printed right after it.
    if (w.tokens[at].kind !== "move") {
        const next = w.tokens.findIndex(
            (t, i) => i > at && (t.kind === "move" || t.kind === "word" || t.kind === "open"),
        );
        if (
            !["number", "dots", "bare"].includes(w.tokens[at].kind) ||
            next < 0 ||
            w.tokens[next].kind !== "move" ||
            w.tokens[next].start > runEnd + 1
        )
            return null;
        at = next;
    }
    const token = w.tokens[at];
    return token.kind === "move" && token.ply !== null ? at : null;
}

/** Where the token is on its page, in PDF units (characters are taken as equally wide). */
export function tokenBox(w: TextWindow, tokenIndex: number): { page: number; box: PdfBox } | null {
    const token = w.tokens[tokenIndex];
    if (!token) return null;
    let index = 0;
    for (let i = 0; i < w.starts.length; i++) if (w.starts[i] <= token.start) index = i;
    const run = w.runs[index];
    if (!run) return null;
    const len = Math.max(1, run.str.length);
    const from = Math.max(0, token.start - w.starts[index]);
    const to = Math.min(len, token.end - w.starts[index]);
    const [, y0, , y1] = runBox(run);
    return {
        page: run.page,
        box: [run.x + (from / len) * run.width, y0, run.x + (to / len) * run.width, y1],
    };
}
