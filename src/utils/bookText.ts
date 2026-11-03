/**
 * Side to move and move number of a book diagram, read from the text around it (phase 9.4).
 *
 * Books print the next move below the diagram ("15...Qxd2+", "8.0-0") or say it ("Juegan las
 * negras", "White to play"); some print the last move above it ("7.Nge2 c6"). Text layers of
 * scanned books garble the figurines but usually keep the move numbers. When nothing is found the
 * side to move stays unknown, and the interface says so.
 */

/** A text run in PDF units: (x, y) is its baseline start, origin at the page's bottom-left. */
export type TextRun = { str: string; x: number; y: number; width: number; height: number };

export type MoveContext = {
    turn: "w" | "b" | null;
    fullmove: number | null;
    /** The text the guess came from, to show it to the user. */
    evidence: string | null;
};

const WHITE =
    /\b(?:juegan|mueven|juega|mueve)\s+(?:las\s+)?blancas\b|\bwhite\s+to\s+(?:move|play)\b|\b(?:blancas|white)\s+(?:juegan|mueven|play|plays)\b/i;
const BLACK =
    /\b(?:juegan|mueven|juega|mueve)\s+(?:las\s+)?negras\b|\bblack\s+to\s+(?:move|play)\b|\b(?:negras|black)\s+(?:juegan|mueven|play|plays)\b/i;
/** A move number followed by "." (White) or "..." / "…" (Black), as printed in books. */
// A digit right after the dot is a decimal ("2.5"), except castling written with zeros ("8.0-0").
const MOVE_NUMBER = /(?:^|[^\d.,])(\d{1,3})\s*(\.\s*\.\s*\.|…|\.)(?![1-9]|0(?!-))/g;
/** A move token after a number: SAN, castling, or a garbled figurine followed by a square. */
const MOVE_TOKEN =
    /^(?:[KQRBNDTACRSL]?[a-h]?[1-8]?x?[a-h][1-8]|0-0(?:-0)?|O-O(?:-O)?|\S{1,4}[a-h][1-8])[+#!?=A-Z]*$/;

/** "Diagram 11-7", "Diagrama 23", "Diag. 4": a reference to a diagram placed elsewhere. */
const MARKER = /\b(?:diagram[ae]?|diag\.)\s*\d[\d\s-]*/i;

/**
 * OCR splits move numbers ("1 1 . Te1"): two lone digits followed by a dot are joined. A digit
 * right after a letter ends a square ("Kb6 56.Kc4") and is left alone.
 */
function joinDigits(text: string): string {
    return text.replace(/(?<![\p{L}\d])(\d) (\d)(?=\s*\.)/gu, "$1$2");
}

type Line = { y: number; text: string };

/** Groups runs into lines (same baseline ± 40 % of the text height), top to bottom. */
function lines(runs: TextRun[]): Line[] {
    const sorted = [...runs].sort((a, b) => b.y - a.y || a.x - b.x);
    const out: { y: number; height: number; runs: TextRun[] }[] = [];
    for (const run of sorted) {
        const line = out.find(
            (l) => Math.abs(l.y - run.y) <= 0.4 * Math.max(l.height, run.height, 1),
        );
        if (line) line.runs.push(run);
        else out.push({ y: run.y, height: run.height, runs: [run] });
    }
    return out.map((l) => ({
        y: l.y,
        text: joinDigits(
            l.runs
                .sort((a, b) => a.x - b.x)
                .map((r) => r.str)
                .join(" ")
                .replace(/\s+/g, " ")
                .trim(),
        ),
    }));
}

/** Next move printed below the diagram: "15..." → Black 15, "8." → White 8. */
function nextMove(text: string): Omit<MoveContext, "evidence"> | null {
    const match = [...text.matchAll(MOVE_NUMBER)][0];
    if (!match) return null;
    const black = match[2] !== ".";
    return { turn: black ? "b" : "w", fullmove: Number(match[1]) };
}

/** Last move printed above the diagram: "7.Nge2 c6" → White 8, "7.Nge2" → Black 7. */
function afterLastMove(text: string): Omit<MoveContext, "evidence"> | null {
    const matches = [...text.matchAll(MOVE_NUMBER)];
    const last = matches[matches.length - 1];
    if (!last || last.index === undefined) return null;
    const number = Number(last[1]);
    const rest = text
        .slice(last.index + last[0].length)
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    const moves = rest.filter((token) => MOVE_TOKEN.test(token)).length;
    if (last[2] !== ".") return moves >= 1 ? { turn: "w", fullmove: number + 1 } : null;
    if (moves >= 2) return { turn: "w", fullmove: number + 1 };
    if (moves === 1) return { turn: "b", fullmove: number };
    return null;
}

/**
 * Books that place diagrams in another column refer to them in the text ("... 9.Bh2 Diagram 11-7
 * 9...Ne4!"): the next move after the marker, in reading order, is the one to play. With several
 * markers on the page, the one closest in height to the diagram.
 */
function afterMarker(runs: TextRun[], box: [number, number, number, number]): MoveContext | null {
    const centre = (box[1] + box[3]) / 2;
    const markers = runs
        .map((run, index) => ({ run, index }))
        .filter(({ run }) => MARKER.test(run.str))
        .sort((a, b) => Math.abs(a.run.y - centre) - Math.abs(b.run.y - centre));
    const marker = markers[0];
    if (!marker) return null;
    const after = [
        marker.run.str.replace(MARKER, " "),
        ...runs.slice(marker.index + 1, marker.index + 12).map((r) => r.str),
    ];
    const text = joinDigits(after.join(" ").replace(/\s+/g, " ").trim()).slice(0, 160);
    const found = nextMove(text);
    return found ? { ...found, evidence: `${marker.run.str.trim()} ${text}`.slice(0, 80) } : null;
}

/**
 * Reads the side to move from the text near a diagram box (x0, y0, x1, y1), PDF units.
 * Looks, in order: a phrase like "Juegan las negras" close to the diagram, the first move number
 * in the two lines below it, the last move in the line above it, then the move after a
 * "Diagram N" reference anywhere on the page. `runs` must keep the page's reading order.
 */
export function moveContext(runs: TextRun[], box: [number, number, number, number]): MoveContext {
    const [x0, y0, x1, y1] = box;
    const width = x1 - x0;
    const square = (y1 - y0) / 8;
    // Text of the same column: it overlaps the diagram horizontally.
    const column = runs.filter(
        (r) => r.str.trim() && r.x < x1 + 0.1 * width && r.x + r.width > x0 - 0.1 * width,
    );
    const below = lines(column.filter((r) => r.y < y0 && r.y > y0 - 4 * square));
    const above = lines(column.filter((r) => r.y > y1 && r.y < y1 + 3 * square)).reverse();

    for (const line of [...below.slice(0, 3), ...above.slice(0, 2)]) {
        if (BLACK.test(line.text)) return { turn: "b", fullmove: null, evidence: line.text };
        if (WHITE.test(line.text)) return { turn: "w", fullmove: null, evidence: line.text };
    }
    for (const line of below.slice(0, 2)) {
        const found = nextMove(line.text);
        if (found) return { ...found, evidence: line.text };
    }
    const line = above[0];
    const found = line && afterLastMove(line.text);
    if (found) return { ...found, evidence: line.text };
    return afterMarker(runs, box) ?? { turn: null, fullmove: null, evidence: null };
}
