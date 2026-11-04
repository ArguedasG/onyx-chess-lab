/**
 * «Abrir esta partida» (phase 9.4, step 5): the line of moves printed in a book's text up to the
 * move the user double-clicked, read from the PDF's text layer and checked move by move against
 * the rules.
 *
 * Books print moves in English or Spanish letters, German or French ones, figurines, or (in text
 * layers made by OCR or ClearScan) garbled figurines such as `ttJf3` or `ltlxb3`. A move is read
 * guided by legality: among the legal moves, the ones that match its destination, capture and
 * piece; a garbled piece letter matches any piece. Two candidates left is "ambiguous", none is
 * "illegal", and the line stops there.
 *
 * Which printed moves form the line comes from the move numbers ("4.Kd4", "4…Kb1", "29 ...Qe4"),
 * the moves that follow them without a number, and parentheses (variations): going back from the
 * clicked move, each earlier half-move is the closest one printed before it that is not inside a
 * variation the clicked move is not in. Variations that books introduce in prose without
 * parentheses ("Other moves are less stubborn: 5.Kd3 Kb1") are skipped because their run of
 * moves starts earlier than the line needs.
 */

import type { NormalMove, Role, Square } from "chessops";
import { Chess } from "chessops/chess";
import { makeFen, parseFen } from "chessops/fen";
import { makeSan, parseSan } from "chessops/san";
import { makeUci, parseSquare, squareFile, squareRank } from "chessops/util";

export type MoveSpec =
    | { castle: "short" | "long" }
    | {
          castle?: undefined;
          /** Piece letter or figurine as printed; "" for a pawn; null when garbled (any piece). */
          piece: string | null;
          /** The garbled characters of an unreadable figurine, to break ties. */
          garbled?: string;
          fromFile?: number;
          fromRank?: number;
          capture: boolean;
          to: Square;
          promotion?: string;
      };

export type Token =
    | { kind: "number"; start: number; end: number; n: number; black: boolean }
    | { kind: "bare"; start: number; end: number; n: number }
    | { kind: "dots"; start: number; end: number }
    | { kind: "open" | "close" | "break" | "word" | "note"; start: number; end: number }
    | {
          kind: "move";
          start: number;
          end: number;
          spec: MoveSpec;
          /** Half-move index: 0 is White's first move. Null when not part of a numbered line. */
          ply: number | null;
          /** Variations (parentheses) it is inside, outermost first. */
          groups: number[];
          /** Run of moves printed together; prose, results and parentheses end it. */
          chain: number;
          firstInGroup: boolean;
      };

export type MoveToken = Extract<Token, { kind: "move" }>;

export const plyOf = (fullmove: number, black: boolean) => (fullmove - 1) * 2 + (black ? 1 : 0);
export const plyOfFen = (fen: string): number | null => {
    const parts = fen.split(" ");
    const fullmove = Number(parts[5]);
    if (!Number.isInteger(fullmove) || fullmove < 1) return null;
    return plyOf(fullmove, parts[1] === "b");
};

/** "12." "12 ..." "12…" — the number of a move; a digit after the dot is a decimal or a square. */
const NUMBER = /^(\d{1,3}) ?(\. ?\. ?\.|…|\.\.|\.)(?![1-9]|0(?!-))/;
const DOTS = /^(?:\. ?\. ?\.|…)/;
const RESULT = /^(?:1[-–]0|0[-–]1|½[-–]½|1\/2[-–]1\/2)[.,;]?$/;
/** Evaluation and annotation signs that do not interrupt a line of moves. */
const NOTE =
    /^(?:[!?]{1,2}|[+#=±∓∞□Z†‡]|[-–]\+|\+[-–]|\+\/?[-–=]|[-–=]\/?\+|[-–—]|[,;:.…•]|\(?D\)?|N|ext)$/;
const FIGURINES: Record<string, string> = {
    "♔": "K",
    "♚": "K",
    "♕": "Q",
    "♛": "Q",
    "♖": "R",
    "♜": "R",
    "♗": "B",
    "♝": "B",
    "♘": "N",
    "♞": "N",
};

/** Strips evaluation signs, punctuation and check marks after a move ("Nc5+!", "Kc2=", "ie4t"). */
function core(token: string): string {
    let s = token.replace(/^[.,;:]+/, "");
    for (let i = 0; i < 4; i++) {
        const next = s
            .replace(/[,;:]+$/, "")
            .replace(/(?:…|\.{1,3})$/, "")
            .replace(/(?:[!?]+|[+#†‡]+|[±∓∞□Z]|[-–]\+|\+[-–]|=$|e\.p\.?$)$/, "")
            // A garbled check sign printed as "t" right after the square.
            .replace(/([a-h][1-8])t$/, "$1");
        if (next === s) break;
        s = next;
    }
    return s;
}

/** OCR reads ranks as letters: "dS" is d5, "fl" is f1. Only the character after a file letter. */
const fixRank = (s: string) =>
    s.replace(/([a-h])([SlIi|])$/, (_, file: string, r: string) => file + (r === "S" ? "5" : "1"));

export function parseMove(token: string): MoveSpec | null {
    let s = core(token);
    if (/^[0Oo]-[0Oo]-[0Oo]$/.test(s)) return { castle: "long" };
    if (/^[0Oo]-[0Oo]$/.test(s)) return { castle: "short" };
    s = fixRank(s);
    const clean =
        /^([KQRBNDTACLSFP♔♕♖♗♘♚♛♜♝♞])?([a-h])?([1-8])?([x:×])?([a-h][1-8])(?:=?\(?([QRBNDTACLSF♕♖♗♘♛♜♝♞])\)?)?$/.exec(
            s,
        );
    if (clean) {
        const [, piece = "", file, rank, x, to, promotion] = clean;
        return {
            piece: piece === "P" ? "" : piece,
            fromFile: file ? file.charCodeAt(0) - 97 : undefined,
            fromRank: rank ? Number(rank) - 1 : undefined,
            capture: !!x,
            to: parseSquare(to)!,
            promotion,
        };
    }
    // A garbled figurine: a few characters that are not a file letter, then the destination.
    const garbled = /^([^\sa-h0-9()[\]]{1,4}?)([a-h])?([1-8])?([x:×])?([a-h][1-8])$/.exec(s);
    if (garbled) {
        const [, prefix, file, rank, x, to] = garbled;
        return {
            piece: null,
            garbled: prefix,
            fromFile: file ? file.charCodeAt(0) - 97 : undefined,
            fromRank: rank ? Number(rank) - 1 : undefined,
            capture: !!x,
            to: parseSquare(to)!,
        };
    }
    return null;
}

type Language = "en" | "es" | "de";
const LETTERS: Record<Language, Record<string, Role>> = {
    en: { K: "king", Q: "queen", R: "rook", B: "bishop", N: "knight" },
    // Spanish, Italian and French: R(ey/oi), D(ama/onna/ame), T(orre/our), A(lfil)/F(ou), C(aballo/avalier).
    es: { R: "king", D: "queen", T: "rook", A: "bishop", F: "bishop", C: "knight" },
    de: { K: "king", D: "queen", T: "rook", L: "bishop", S: "knight" },
};

/** The piece letters of a text: the language whose letters its moves use most. */
export function guessLanguage(tokens: Token[]): Language {
    const count = { en: 0, es: 0, de: 0 };
    for (const t of tokens) {
        if (t.kind !== "move" || t.spec.castle || !t.spec.piece) continue;
        const p = t.spec.piece;
        if ("QBN".includes(p)) count.en++;
        if ("DTACF".includes(p)) count.es++;
        if ("LS".includes(p)) count.de += 2;
    }
    if (count.de > count.es && count.de > count.en) return "de";
    return count.es > count.en ? "es" : "en";
}

function rolesOf(piece: string, language: Language): Role[] {
    const figurine = FIGURINES[piece];
    if (figurine) return [LETTERS.en[figurine]];
    const primary = LETTERS[language][piece];
    if (primary) return [primary];
    // A letter of another language (a book mixing them, or "K" in a Spanish text).
    const others = (Object.keys(LETTERS) as Language[])
        .map((l) => LETTERS[l][piece])
        .filter((r): r is Role => !!r);
    return [...new Set(others)];
}

export type Resolved = { move: NormalMove; san: string; fuzzy: boolean };
export type Unresolved = { error: "illegal" | "ambiguous" };

/**
 * The piece a garbled figurine most likely is, from how OCR and ClearScan usually mangle the
 * common figurine fonts (`ttJ`/`ltl` knight, `'W`/`YM` queen, `l:t`/`E!:` rook, `.i`/`il.` bishop).
 * Only used to choose between legal moves.
 */
export function garbledRole(prefix: string): Role | null {
    if (/[WVYM9]/.test(prefix)) return "queen";
    if (/[:!]|E/.test(prefix)) return "rook";
    if (/tt|[tiLl]J|ltl|lll|CL|tD|ll/.test(prefix)) return "knight";
    if (/\.|^i$|il|lt|it/.test(prefix)) return "bishop";
    if (/[@�&]|c;t|'it|<it/.test(prefix)) return "king";
    return null;
}

type PieceSpec = Exclude<MoveSpec, { castle: "short" | "long" }>;

/** Legal moves to the printed square by one of `roles` (any piece but a pawn when null). */
function matching(
    pos: Chess,
    spec: PieceSpec,
    language: Language,
    roles: Role[] | null,
): NormalMove[] {
    const out: NormalMove[] = [];
    for (const [from, dests] of pos.allDests()) {
        if (!dests.has(spec.to)) continue;
        const role = pos.board.getRole(from)!;
        if (roles ? !roles.includes(role) : role === "pawn") continue;
        if (spec.fromFile !== undefined && squareFile(from) !== spec.fromFile) continue;
        if (spec.fromRank !== undefined && squareRank(from) !== spec.fromRank) continue;
        const captures =
            pos.board.has(spec.to) || (role === "pawn" && squareFile(from) !== squareFile(spec.to));
        // A pawn written "ed5" is a capture even without the "x".
        if (spec.capture && !captures) continue;
        const promotes =
            role === "pawn" && (squareRank(spec.to) === 0 || squareRank(spec.to) === 7);
        const promotion = promotes
            ? ((spec.promotion ? rolesOf(spec.promotion, language)[0] : undefined) ?? "queen")
            : undefined;
        out.push({ from, to: spec.to, promotion });
    }
    return out;
}

const allRoles = (letter: string): Role[] => [
    ...new Set(
        (Object.keys(LETTERS) as Language[])
            .map((l) => LETTERS[l][letter])
            .filter((r): r is Role => !!r),
    ),
];

/**
 * The legal move a printed move stands for in `pos`. `learned` maps garbled figurines already
 * read without doubt in the line to their piece, to break later ties.
 */
export function resolveMove(
    pos: Chess,
    spec: MoveSpec,
    language: Language,
    learned?: Map<string, Role>,
): Resolved | Unresolved {
    if (spec.castle) {
        const move = parseSan(pos, spec.castle === "short" ? "O-O" : "O-O-O");
        return move && "from" in move
            ? { move, san: makeSan(pos, move), fuzzy: false }
            : { error: "illegal" };
    }
    const piece = spec.piece;
    const roles =
        piece === null ? null : piece === "" ? (["pawn"] as Role[]) : rolesOf(piece, language);
    let candidates = matching(pos, spec, language, roles);
    // A letter of another language than the page's ("R" for the king in a mostly English text).
    if (candidates.length === 0 && piece && !FIGURINES[piece])
        candidates = matching(pos, spec, language, allRoles(piece));
    // A garbled figurine can swallow a file letter ("lbg6": "lb" is the knight, not the b-file).
    if (candidates.length === 0 && spec.garbled && spec.fromFile !== undefined)
        candidates = matching(
            pos,
            { ...spec, fromFile: undefined, fromRank: undefined },
            language,
            roles,
        );
    if (candidates.length === 0) return { error: "illegal" };
    let chosen = candidates;
    if (candidates.length > 1 && spec.garbled) {
        const role = learned?.get(spec.garbled) ?? garbledRole(spec.garbled);
        if (role) chosen = candidates.filter((m) => pos.board.getRole(m.from) === role);
    }
    if (chosen.length !== 1) return { error: "ambiguous" };
    const move = chosen[0];
    if (spec.garbled && candidates.length === 1)
        learned?.set(spec.garbled, pos.board.getRole(move.from)!);
    return { move, san: makeSan(pos, move), fuzzy: spec.piece === null };
}

/**
 * Splits a text into tokens and gives every move its half-move, variation and run. `text` is the
 * text layer of the pages in reading order.
 */
/**
 * Repairs of text layers that keep every character in place (same length, so offsets still point
 * at the page): bullets printed for dots, and move numbers split by OCR ("1 9 . . .").
 */
function normalize(text: string): string {
    return text.replace(/•/g, ".").replace(/(?<![\p{L}\d])(\d) (\d)(?= ?[.…])/gu, "$1$2 ");
}

export function tokenize(source: string): Token[] {
    const text = normalize(source);
    const raw: Token[] = [];
    const re = /\S+/g;
    for (let m = re.exec(text); m; m = re.exec(text)) {
        let start = m.index;
        let s = m[0];
        // "(D)": Everyman's mark for a diagram, not a variation.
        if (/^\(D\)[.,;:]?$/.test(s)) {
            raw.push({ kind: "note", start, end: start + s.length });
            continue;
        }
        // Parentheses and brackets are tokens of their own.
        while (s && /^[([{]/.test(s)) {
            raw.push({ kind: "open", start, end: start + 1 });
            s = s.slice(1);
            start++;
        }
        let closing = 0;
        while (s && /[)\]}][.,;:]?$/.test(s)) {
            const cut = s.search(/[)\]}][.,;:]?$/);
            closing++;
            s = s.slice(0, cut);
        }
        if (s) pushWord(raw, s, start, text);
        const end = start + s.length;
        for (let i = 0; i < closing; i++)
            raw.push({ kind: "close", start: end + i, end: end + i + 1 });
    }
    return assignPlies(raw);
}

function pushWord(out: Token[], s: string, start: number, text: string) {
    const end = start + s.length;
    const number = NUMBER.exec(s);
    if (number) {
        let len = number[0].length;
        let black = number[2] !== ".";
        // "24. . . . Te5": spaced dots after the number make it Black's.
        if (!black && len === s.length) {
            const dots = text.slice(start + len).match(/^(?: ?\.){2,3}| ?…/);
            if (dots) {
                black = true;
                len += dots[0].length;
            }
        }
        out.push({ kind: "number", start, end: start + len, n: Number(number[1]), black });
        if (len < s.length) pushWord(out, s.slice(len), start + len, text);
        return;
    }
    // "12 ..." split by a space: the number, then the dots (and maybe the move).
    if (/^\d{1,3}$/.test(s)) {
        const after = text.slice(end).match(/^ ?(\. ?\. ?\.|…|\.)(?![1-9]|0(?!-))/);
        out.push({ kind: "bare", start, end, n: Number(s) });
        if (after) {
            const prev = out.pop() as Extract<Token, { kind: "bare" }>;
            out.push({
                kind: "number",
                start,
                end: end + after[0].length,
                n: prev.n,
                black: after[1] !== ".",
            });
        }
        return;
    }
    const dots = DOTS.exec(s);
    if (dots) {
        // Dots already counted in the number before them.
        const prev = out[out.length - 1];
        if (!(prev?.kind === "number" && prev.end > start))
            out.push({ kind: "dots", start, end: start + dots[0].length });
        if (dots[0].length < s.length)
            pushWord(out, s.slice(dots[0].length), start + dots[0].length, text);
        return;
    }
    if (out[out.length - 1]?.kind === "number" && out[out.length - 1].end > start) return;
    if (RESULT.test(s)) {
        out.push({ kind: "break", start, end });
        return;
    }
    const spec = parseMove(s);
    if (spec) {
        out.push({
            kind: "move",
            start,
            end,
            spec,
            ply: null,
            groups: [],
            chain: 0,
            firstInGroup: false,
        });
        return;
    }
    out.push({ kind: NOTE.test(s) ? "note" : "word", start, end });
}

function assignPlies(tokens: Token[]): Token[] {
    let expect: number | null = null;
    let last: number | null = null;
    let chain = 0;
    let group = 0;
    const groups: number[] = [];
    const saved: { expect: number | null; last: number | null }[] = [];
    let firstInGroup = false;
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const next = tokens[i + 1];
        switch (t.kind) {
            case "number":
                expect = plyOf(t.n, t.black);
                break;
            case "bare":
                // "1 Nf3 d5 2 d4" (no dots): a number only where the line expects it.
                if (
                    next?.kind === "move" &&
                    (t.n === 1 ? last === null : expect === plyOf(t.n, false))
                )
                    expect = plyOf(t.n, false);
                else {
                    expect = null;
                    chain++;
                }
                break;
            case "dots": {
                // "29 ...Qe4" or "12. … Rc7" as separate pieces: the number before is Black's.
                const prev = tokens[i - 1];
                if (prev?.kind === "bare" || prev?.kind === "number") expect = plyOf(prev.n, true);
                break;
            }
            case "move":
                t.groups = [...groups];
                t.chain = chain;
                t.firstInGroup = firstInGroup;
                if (expect !== null) {
                    t.ply = expect;
                    last = expect;
                    expect = expect + 1;
                    firstInGroup = false;
                }
                break;
            case "open":
                saved.push({ expect, last });
                groups.push(++group);
                chain++;
                firstInGroup = true;
                // A variation replaces the move before it unless it says otherwise.
                expect = last;
                break;
            case "close": {
                const s = saved.pop();
                groups.pop();
                chain++;
                firstInGroup = false;
                expect = s?.expect ?? null;
                last = s?.last ?? null;
                break;
            }
            case "break":
                expect = null;
                last = null;
                chain++;
                break;
            case "word":
                expect = null;
                chain++;
                break;
            case "note":
                break;
        }
    }
    return tokens;
}

const visibleFrom = (t: MoveToken, from: MoveToken) =>
    t.groups.every((g) => from.groups.includes(g));

function chainBounds(tokens: Token[]) {
    const first = new Map<number, number>();
    const last = new Map<number, number>();
    tokens.forEach((t, i) => {
        if (t.kind !== "move" || t.ply === null) return;
        if (!first.has(t.chain)) first.set(t.chain, i);
        last.set(t.chain, i);
    });
    return { first, last };
}

/**
 * Indices of the moves of the line from half-move `fromPly` to the move at `clicked`, in order;
 * null when a half-move is missing in the text.
 */
export function pathTo(tokens: Token[], clicked: number, fromPly: number): number[] | null {
    const target = tokens[clicked];
    if (target?.kind !== "move" || target.ply === null || target.ply < fromPly) return null;
    const { first, last } = chainBounds(tokens);
    const path = [clicked];
    let ref = clicked;
    for (let ply = target.ply - 1; ply >= fromPly; ply--) {
        const r = tokens[ref] as MoveToken;
        const startsChain = first.get(r.chain) === ref;
        let found = -1;
        let fallback = -1;
        for (let i = ref - 1; i >= 0; i--) {
            const t = tokens[i];
            if (t.kind !== "move" || t.ply !== ply || !visibleFrom(t, r)) continue;
            if (!startsChain) {
                // The previous move of the same printed run.
                if (t.chain === r.chain) found = i;
                break;
            }
            if (fallback < 0) fallback = i;
            // A run that resumes after prose continues one that ended on the half-move before;
            // a variation's first move continues from the move before the one it replaces.
            if (r.firstInGroup || last.get(t.chain) === i) {
                found = i;
                break;
            }
        }
        if (found < 0) found = fallback;
        if (found < 0) return null;
        path.unshift(found);
        ref = found;
    }
    return path;
}

/** Indices of the moves printed after the one at `index` in the same line, as far as it goes. */
export function continuation(tokens: Token[], index: number, limit = 120): number[] {
    const out: number[] = [];
    const { first } = chainBounds(tokens);
    let ref = index;
    while (out.length < limit) {
        const r = tokens[ref] as MoveToken;
        const ply = r.ply! + 1;
        let found = -1;
        let depth = 0;
        for (let i = ref + 1; i < tokens.length; i++) {
            const t = tokens[i];
            if (t.kind === "break") break;
            if (t.kind === "open") depth++;
            // The end of the variation the line is in.
            if (t.kind === "close" && --depth < 0) break;
            if (t.kind !== "move" || t.ply !== ply || !visibleFrom(t, r)) continue;
            if (t.groups.length !== r.groups.length) continue;
            if (t.chain === r.chain || first.get(t.chain) === i) {
                found = i;
                break;
            }
        }
        if (found < 0) break;
        out.push(found);
        ref = found;
    }
    return out;
}

export type LineMove = { token: number; san: string; uci: string; fuzzy: boolean };
export type Line = {
    /** Position the line starts from. */
    fen: string;
    moves: LineMove[];
    /** Index in `moves` of the double-clicked move; -1 when the line stops before it. */
    clicked: number;
    /** The first move that could not be played, if any. */
    failure: { token: number; reason: "illegal" | "ambiguous" | "missing" } | null;
};

/** Plays the moves at `indices` from `fen` until one fails. */
function play(tokens: Token[], indices: number[], fen: string, language: Language) {
    const setup = parseFen(fen);
    if (setup.isErr) return null;
    const pos = Chess.fromSetup(setup.value);
    if (pos.isErr) return null;
    const chess = pos.value;
    const moves: LineMove[] = [];
    const learned = new Map<string, Role>();
    for (const index of indices) {
        const t = tokens[index] as MoveToken;
        const r = resolveMove(chess, t.spec, language, learned);
        if ("error" in r) return { moves, failure: { token: index, reason: r.error } };
        moves.push({ token: index, san: r.san, uci: makeUci(r.move), fuzzy: r.fuzzy });
        chess.play(r.move);
    }
    return { moves, failure: null, fen: makeFen(chess.toSetup()) };
}

/**
 * The line through the move at `clicked`, from the first of `starts` (FENs: the diagram before
 * the move, the board, the initial position…) from which every move up to it is legal. When none
 * works, the start that gets furthest, with the first move that fails.
 */
export function openLine(tokens: Token[], clicked: number, starts: string[]): Line | null {
    const target = tokens[clicked];
    if (target?.kind !== "move" || target.ply === null) return null;
    const language = guessLanguage(tokens);
    let best: Line | null = null;
    for (const fen of starts) {
        const fromPly = plyOfFen(fen);
        if (fromPly === null || fromPly > target.ply) continue;
        const path = pathTo(tokens, clicked, fromPly);
        if (!path) {
            if (!best)
                best = {
                    fen,
                    moves: [],
                    clicked: -1,
                    failure: { token: clicked, reason: "missing" },
                };
            continue;
        }
        const played = play(tokens, path, fen, language);
        if (!played) continue;
        if (!played.failure) {
            const after = play(tokens, continuation(tokens, clicked), played.fen!, language);
            return {
                fen,
                moves: [...played.moves, ...(after?.moves ?? [])],
                clicked: played.moves.length - 1,
                failure: after?.failure ?? null,
            };
        }
        if (!best || played.moves.length > best.moves.length)
            best = { fen, moves: played.moves, clicked: -1, failure: played.failure };
    }
    return best;
}

/** A text run of a page, as `textRuns` gives it, with its page number. */
export type PageRun = {
    page: number;
    str: string;
    x: number;
    y: number;
    width: number;
    height: number;
};

/**
 * The pages' runs as one text in reading order (runs separated by spaces), and where each run
 * starts in it, to map a click to a token and a token back to the page.
 */
export function joinRuns(runs: PageRun[]): { text: string; starts: number[] } {
    const starts: number[] = [];
    let text = "";
    for (const run of runs) {
        starts.push(text.length);
        text += `${run.str} `;
    }
    return { text, starts };
}
