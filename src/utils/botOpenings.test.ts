import { Chess, parseUci } from "chessops";
import { describe, expect, it } from "vitest";
import {
    BOT_OPENING_FAMILIES,
    BOT_OPENING_LINES,
    type BotOpeningLineId,
    botFamilyLines,
    botOpeningLineUci,
} from "./botOpenings";

describe("bot opening lines", () => {
    it("are legal from the initial position", () => {
        const illegal: string[] = [];
        for (const id of Object.keys(BOT_OPENING_LINES) as BotOpeningLineId[]) {
            const position = Chess.default();
            for (const uci of botOpeningLineUci(id)) {
                const move = parseUci(uci);
                if (!move || !position.isLegal(move)) {
                    illegal.push(`${id}: ${uci}`);
                    break;
                }
                position.play(move);
            }
        }
        expect(illegal).toEqual([]);
    });

    it("write castling as the king's two-square move", () => {
        expect(botOpeningLineUci("ruy-closed")).toContain("e1g1");
        expect(botOpeningLineUci("najdorf-bg5")).toContain("e1c1");
        expect(botOpeningLineUci("kid-black")).toContain("e8g8");
    });

    it("start with the family's own side", () => {
        const firstMoves = {
            white: ["e4", "d4", "c4", "Nf3"],
            vsE4: ["e4"],
            vsD4: ["d4"],
            vsFlank: ["c4", "Nf3"],
        } as const;
        for (const [id, family] of Object.entries(BOT_OPENING_FAMILIES)) {
            const allowed: readonly string[] = firstMoves[family.kind];
            const wrongStart = family.lines
                .map(([line]) => line)
                .filter((line) => !allowed.includes(BOT_OPENING_LINES[line].split(" ")[0]));
            expect(wrongStart).toEqual([]);
            const side = family.kind === "white" ? "white" : "black";
            const lines = botFamilyLines(id as keyof typeof BOT_OPENING_FAMILIES);
            expect(lines.every((candidate) => candidate.side === side)).toBe(true);
        }
    });
});
