import { Chess } from "chessops";
import { makeFen } from "chessops/fen";
import { parseSan } from "chessops/san";
import { describe, expect, it } from "vitest";
import type { Annotation } from "@/utils/annotation";
import { collectRetroMistakes, newRetroState, retroAccepts, retroRunsOn } from "@/utils/retro";
import { createNode, defaultTree } from "@/utils/treeReducer";

/** Mainline built from "san" or "san?" tokens. */
function game(moves: string) {
    const root = defaultTree().root;
    const pos = Chess.default();
    let node = root;
    for (const token of moves.split(" ")) {
        const [, san, annotation] = token.match(/^([^?]+)(\?*)$/)!;
        const move = parseSan(pos, san)!;
        pos.play(move);
        const child = createNode({
            fen: makeFen(pos.toSetup()),
            move,
            san,
            halfMoves: node.halfMoves + 1,
        });
        if (annotation) child.annotations = [annotation as Annotation];
        node.children.push(child);
        node = child;
    }
    return root;
}

const annotatedGame = async () => game("e4 e5 Qh5? Nc6 Bc4 g6?? Qf3 Nf6??");

describe("collectRetroMistakes", () => {
    it("keeps the mainline mistakes and blunders of one side", async () => {
        const root = await annotatedGame();
        const white = collectRetroMistakes(root, "white");
        expect(white.map((item) => [item.san, item.annotation, item.path.length])).toEqual([
            ["Qh5", "?", 3],
        ]);
        expect(white[0].uci).toBe("d1h5");
        expect(white[0].fen).toBe(root.children[0].children[0].fen);

        const black = collectRetroMistakes(root, "black");
        expect(black.map((item) => item.san)).toEqual(["g6", "Nf6"]);
    });

    it("recognises the game it was started on", async () => {
        const root = await annotatedGame();
        const state = newRetroState("black", collectRetroMistakes(root, "black"));
        expect(retroRunsOn(state, root)).toBe(true);
        const other = game("d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7");
        expect(retroRunsOn(state, other)).toBe(false);
        expect(retroRunsOn({ ...state, phase: "done" }, root)).toBe(false);
    });
});

describe("retroAccepts", () => {
    it("accepts moves that keep the winning chances", () => {
        expect(retroAccepts({ type: "cp", value: 250 }, { type: "cp", value: 230 }, "white")).toBe(
            true,
        );
        expect(retroAccepts({ type: "mate", value: 3 }, { type: "cp", value: 1500 }, "white")).toBe(
            true,
        );
    });

    it("rejects moves that give the advantage away, from either side", () => {
        expect(retroAccepts({ type: "cp", value: 250 }, { type: "cp", value: 0 }, "white")).toBe(
            false,
        );
        expect(retroAccepts({ type: "cp", value: -300 }, { type: "cp", value: 50 }, "black")).toBe(
            false,
        );
        expect(retroAccepts({ type: "cp", value: -300 }, { type: "cp", value: -320 }, "black")).toBe(
            true,
        );
    });
});
