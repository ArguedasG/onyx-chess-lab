import { parseUci } from "chessops";
import { makeSan } from "chessops/san";
import { positionFromFen } from "./chessops";

export type TacticsSolutionLine = {
    uciMoves: string[];
    sanMoves: string[];
};

export function getPreparedSolutionLine(lines: string[][]): string[] | null {
    return lines.find((line) => line.length > 0) ?? null;
}

export function describeTacticsSolution(
    fen: string,
    uciMoves: string[],
    engineSanMoves: string[] = [],
): TacticsSolutionLine {
    if (engineSanMoves.length === uciMoves.length) {
        return { uciMoves: [...uciMoves], sanMoves: [...engineSanMoves] };
    }

    const [position] = positionFromFen(fen);
    if (!position) return { uciMoves: [...uciMoves], sanMoves: [...uciMoves] };

    const sanMoves: string[] = [];
    for (const uci of uciMoves) {
        const move = parseUci(uci);
        if (!move || !position.isLegal(move)) {
            sanMoves.push(uci);
            continue;
        }
        sanMoves.push(makeSan(position, move));
        position.play(move);
    }
    return { uciMoves: [...uciMoves], sanMoves };
}
