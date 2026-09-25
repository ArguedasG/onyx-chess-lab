import { describe, expect, it } from "vitest";
import { INITIAL_FEN } from "chessops/fen";
import type { OpeningLine } from "./trainingAreas";
import {
    getOpeningCompletion,
    getOpeningMoveTokens,
    getOpeningNoveltyStarts,
    openingLineToSan,
} from "./openingPresentation";

function line(id: string, moves: string[], completions = 0, trainable = true): OpeningLine {
    return {
        id,
        variantId: "variant",
        name: id,
        fen: INITIAL_FEN,
        moves,
        path: [],
        plyCount: moves.length,
        trainable,
        sourceRecordIndex: 0,
        moveProgress: {},
        session: { attempts: completions, completions, flawless: 0, totalTimeMs: 0 },
    };
}

describe("opening presentation", () => {
    it("marks the first unseen continuation against every preceding line", () => {
        const lines = [
            line("one", ["g1f3", "d7d5", "g2g3", "c7c6", "f1g2", "g8f6"]),
            line("two", ["g1f3", "d7d5", "g2g3", "c7c6", "d2d4"]),
            line("three", ["g1f3", "d7d5", "g2g3", "c7c6", "f1g2", "c8f5"]),
        ];

        expect(getOpeningNoveltyStarts(lines)).toEqual([0, 4, 5]);
    });

    it("converts UCI moves to numbered SAN tokens", () => {
        const openingLine = line("king pawn", ["e2e4", "e7e5", "g1f3"]);
        expect(openingLineToSan(openingLine)).toEqual(["e4", "e5", "Nf3"]);
        expect(getOpeningMoveTokens(openingLine, 2)).toEqual([
            { key: "0:e2e4", text: "1. e4", novel: false },
            { key: "1:e7e5", text: "e5", novel: false },
            { key: "2:g1f3", text: "2. Nf3", novel: true },
        ]);
    });

    it("reports practiced trainable lines rather than raw move accuracy", () => {
        expect(
            getOpeningCompletion([
                line("completed", ["e2e4"], 1),
                line("pending", ["d2d4"]),
                line("paused", ["c2c4"], 1, false),
            ]),
        ).toEqual({ completed: 1, total: 2, percent: 50 });
    });
});
