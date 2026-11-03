import { describe, expect, it } from "vitest";
import { diagramFen, flipPlacement, inferCastling, legalTurn } from "./diagramFen";

describe("diagramFen", () => {
    it("infers castling from kings and rooks on their squares", () => {
        expect(inferCastling("r3k2r/8/8/8/8/8/8/R3K2R")).toBe("KQkq");
        expect(inferCastling("4k3/8/8/8/8/8/8/4K2R")).toBe("K");
        expect(inferCastling("8/8/8/8/8/8/8/8")).toBe("-");
    });

    it("flips a placement", () => {
        expect(flipPlacement("k7/8/8/8/8/8/8/7K")).toBe("K7/8/8/8/8/8/8/7k");
    });

    it("switches the side to move when the other side is in check", () => {
        // White rook gives check to the black king: Black must be to move.
        const fen = diagramFen("4k3/8/8/8/8/8/8/K3R3", "w", 12);
        expect(legalTurn(fen)).toEqual({ fen: "4k3/8/8/8/8/8/8/K3R3 b - - 0 12", switched: true });
    });

    it("leaves legal and hopeless positions alone", () => {
        const legal = diagramFen("4k3/8/8/8/8/8/8/K3R3", "b", 1);
        expect(legalTurn(legal).switched).toBe(false);
        const twoKings = diagramFen("4k3/8/8/8/8/8/8/K3K3", "w", 1);
        expect(legalTurn(twoKings)).toEqual({ fen: twoKings, switched: false });
    });
});
