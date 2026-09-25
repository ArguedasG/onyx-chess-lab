import { parseUci } from "chessops";
import { makeSan } from "chessops/san";
import { positionFromFen } from "./chessops";
import type { OpeningLine } from "./trainingAreas";

export type OpeningMoveToken = {
    key: string;
    text: string;
    novel: boolean;
};

function commonPrefixLength(left: readonly string[], right: readonly string[]): number {
    let index = 0;
    while (index < left.length && index < right.length && left[index] === right[index]) {
        index += 1;
    }
    return index;
}

export function getOpeningNoveltyStarts(lines: readonly OpeningLine[]): number[] {
    const previous: string[][] = [];
    return lines.map((line) => {
        let familiarPlies = 0;
        for (const moves of previous) {
            familiarPlies = Math.max(familiarPlies, commonPrefixLength(moves, line.moves));
        }
        previous.push(line.moves);
        return familiarPlies;
    });
}

export function openingLineToSan(line: Pick<OpeningLine, "fen" | "moves">): string[] {
    const [position] = positionFromFen(line.fen);
    if (!position) return [...line.moves];

    const sans: string[] = [];
    for (const uci of line.moves) {
        const move = parseUci(uci);
        if (!move || !position.isLegal(move)) {
            sans.push(uci);
            continue;
        }
        sans.push(makeSan(position, move));
        position.play(move);
    }
    return sans;
}

export function getOpeningMoveTokens(
    line: Pick<OpeningLine, "fen" | "moves">,
    noveltyStart: number,
): OpeningMoveToken[] {
    const fenParts = line.fen.trim().split(/\s+/);
    const startsWithBlack = fenParts[1] === "b";
    const parsedFullmove = Number.parseInt(fenParts[5] ?? "1", 10);
    const initialFullmove = Number.isFinite(parsedFullmove) ? Math.max(1, parsedFullmove) : 1;
    const sans = openingLineToSan(line);

    return sans.map((san, index) => {
        const absolutePly = index + (startsWithBlack ? 1 : 0);
        const isWhite = absolutePly % 2 === 0;
        const moveNumber = initialFullmove + Math.floor(absolutePly / 2);
        const prefix = isWhite ? `${moveNumber}. ` : index === 0 ? `${moveNumber}... ` : "";
        return {
            key: `${index}:${line.moves[index] ?? san}`,
            text: `${prefix}${san}`,
            novel: index >= noveltyStart,
        };
    });
}

export function getOpeningCompletion(lines: readonly OpeningLine[]): {
    completed: number;
    total: number;
    percent: number;
} {
    const trainable = lines.filter((line) => line.trainable);
    const completed = trainable.filter((line) => line.session.completions > 0).length;
    return {
        completed,
        total: trainable.length,
        percent: trainable.length === 0 ? 0 : Math.round((completed / trainable.length) * 100),
    };
}
