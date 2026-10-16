/**
 * The preparation package (8.6): a local PGN file with the likely repertoire of a player in each
 * color (their moves as the main line and alternatives as variations, with games, score and
 * rating par in comments) and a first chapter with the summary. It opens in Onyx or any PGN
 * reader and can be imported into a study or a repertoire.
 */
import { playUci, sideToMove } from "@/utils/repertoireGenerator/positions";
import { type BookMove, bookPosition, type PlayerBook, playerPar, START_FEN } from "./book";

export type PackageOptions = {
    /** Plies of the book written to the file. */
    maxPlies: number;
    /** Moves played fewer times are left out (the first move of a position is always kept). */
    minGames: number;
    /** At most this many alternatives in each position. */
    maxAlternatives: number;
};

export const DEFAULT_PACKAGE_OPTIONS: PackageOptions = {
    maxPlies: 16,
    minGames: 2,
    maxAlternatives: 3,
};

function clean(text: string) {
    return text.replace(/[{}]/g, "").trim();
}

function header(name: string, value: string) {
    return `[${name} "${value.replace(/\\/g, "").replace(/"/g, "'")}"]`;
}

export function moveComment(book: PlayerBook, fen: string, move: BookMove, total: number) {
    const known = move.white + move.draws + move.black;
    const wins = book.color === "white" ? move.white : move.black;
    const score = known ? ((wins + move.draws / 2) / known) * 100 : null;
    const par = playerPar(book, fen, move);
    const parts = [
        `${move.games}/${total}`,
        score == null ? null : `${score.toFixed(0)}%`,
        par == null || (move.ratedGames ?? 0) < 10
            ? null
            : `${par >= 0 ? "+" : ""}${par.toFixed(1)}`,
        move.lastDay ? `${move.lastDay}` : null,
    ].filter(Boolean);
    return parts.join(" · ");
}

/** Movetext of the book from `fen`, the most played move first and the rest as variations. */
export function bookMovetext(
    book: PlayerBook,
    options: PackageOptions = DEFAULT_PACKAGE_OPTIONS,
): string {
    const visit = (fen: string, ply: number, needsNumber: boolean, seen: Set<string>): string => {
        if (ply >= options.maxPlies) return "";
        const position = bookPosition(book, fen);
        if (!position) return "";
        const total = position.moves.reduce((sum, move) => sum + move.games, 0);
        const moves = position.moves
            .filter((move, index) => index === 0 || move.games >= options.minGames)
            .slice(0, options.maxAlternatives + 1);
        if (moves.length === 0) return "";
        const number = Math.floor(ply / 2) + 1;
        const white = sideToMove(fen) === "white";
        const token = (san: string, forceNumber: boolean) =>
            white ? `${number}. ${san}` : forceNumber ? `${number}... ${san}` : san;
        const render = (move: BookMove, forceNumber: boolean) => {
            const next = playUci(fen, move.uci);
            if (!next) return null;
            return {
                text: `${token(next.san, forceNumber)} {${clean(moveComment(book, fen, move, total))}}`,
                fen: next.fen,
            };
        };
        const [main, ...alternatives] = moves;
        const first = render(main, needsNumber);
        if (!first) return "";
        const parts = [first.text];
        for (const alternative of alternatives) {
            const rendered = render(alternative, true);
            if (!rendered) continue;
            const key = rendered.fen.split(" ").slice(0, 4).join(" ");
            const rest = seen.has(key)
                ? ""
                : visit(rendered.fen, ply + 1, true, new Set(seen).add(key));
            parts.push(`(${rendered.text}${rest ? ` ${rest}` : ""})`);
        }
        const key = first.fen.split(" ").slice(0, 4).join(" ");
        const rest = seen.has(key)
            ? ""
            : visit(first.fen, ply + 1, alternatives.length > 0, new Set(seen).add(key));
        return rest ? `${parts.join(" ")} ${rest}` : parts.join(" ");
    };
    return visit(START_FEN, 0, false, new Set());
}

export function preparationPackage(input: {
    name: string;
    books: { white: PlayerBook; black: PlayerBook };
    summary: string;
    titles: { summary: string; white: string; black: string };
    legend: string;
    date: string;
    options?: PackageOptions;
}): string {
    const chapter = (title: string, comment: string, movetext: string) =>
        [
            header("Event", `${input.name}: ${title}`),
            header("Site", "Onyx Chess Lab"),
            header("Date", input.date),
            header("White", "?"),
            header("Black", "?"),
            header("Result", "*"),
            header("ChapterName", title),
            "",
            `{${clean(comment)}} ${movetext ? `${movetext} ` : ""}*`,
            "",
        ].join("\n");
    const chapters = [chapter(input.titles.summary, input.summary, "")];
    for (const color of ["white", "black"] as const) {
        const book = input.books[color];
        if (book.games === 0) continue;
        chapters.push(
            chapter(input.titles[color], input.legend, bookMovetext(book, input.options)),
        );
    }
    return `${chapters.join("\n")}\n`;
}
