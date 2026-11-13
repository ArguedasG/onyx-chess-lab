import type { Position } from "chessops/chess";
import { parsePgn, startingPosition, type ChildNode, type PgnNodeData } from "chessops/pgn";
import { makeSanAndPlay, parseSan } from "chessops/san";
import { makeUci } from "chessops/util";
import type { OpeningsState, OpeningVariant } from "@/utils/trainingAreas";

/**
 * Finds a move (say "Bb5") anywhere in a repertoire's sections: every variation of the theory,
 * trained or not, and the model games and reference sections. Only the move matters, not the
 * position it is played in.
 */

export type MoveSearchColor = "both" | "white" | "black";

export type MoveSearchHit = {
    /** Child indexes from the root, as a board tab's tree position. */
    path: number[];
    /** The moves up to and including the hit, numbered ("1.e4 e5 2.Nf3 Nc6 3.Bb5"). */
    line: string;
    color: "white" | "black";
    /** Whether the hit lies on a line this section trains. */
    trained: boolean;
};

export type MoveSearchSection = {
    variant: OpeningVariant;
    hits: MoveSearchHit[];
};

/** The section a record belongs to, written in its headers by the repertoire tools. */
const VARIANT_ID_PATTERN = /\[ChessLabVariantId "([^"]+)"\]/;

/** A move as typed or written: no check signs or glyphs, castling with letters. */
export function normalizeSearchMove(move: string): string {
    return move
        .trim()
        .replace(/[+#!?]+$/g, "")
        .replace(/0/g, "O");
}

function numbered(sans: string[], startPly: number): string {
    return sans
        .map((san, index) => {
            const ply = startPly + index;
            const number = Math.floor(ply / 2) + 1;
            if (ply % 2 === 0) return `${number}.${san}`;
            return index === 0 ? `${number}...${san}` : san;
        })
        .join(" ");
}

/** Every prefix of the section's trainable lines, as UCI moves joined by spaces. */
function trainedPrefixes(variant: OpeningVariant, openings: OpeningsState): Set<string> {
    const prefixes = new Set<string>();
    for (const lineId of variant.lineIds) {
        const line = openings.lines[lineId];
        if (!line?.trainable) continue;
        for (let length = 1; length <= line.moves.length; length++) {
            prefixes.add(line.moves.slice(0, length).join(" "));
        }
    }
    return prefixes;
}

/** A move of a record, ready to match: its normalized SAN with the hit it would give. */
type IndexedMove = MoveSearchHit & { san: string };

/** Every move of one PGN record. Moves that cannot be read stop that branch. */
function indexRecord(pgn: string, trained: Set<string>): IndexedMove[] {
    const [game] = parsePgn(pgn);
    if (!game) return [];
    const start = startingPosition(game.headers);
    if (start.isErr) return [];
    const initial = start.value;
    // Plies counted from 1.e4 = 0, so the move numbers of a record starting from a FEN are right.
    const startPly = (initial.fullmoves - 1) * 2 + (initial.turn === "white" ? 0 : 1);
    const moves: IndexedMove[] = [];

    const walk = (
        children: ChildNode<PgnNodeData>[],
        position: Position,
        path: number[],
        sans: string[],
        ucis: string[],
    ) => {
        children.forEach((child, index) => {
            const next = position.clone();
            const parsed = parseSan(next, child.data.san);
            if (!parsed) return;
            const side = next.turn;
            const childUcis = [...ucis, makeUci(parsed)];
            const childSans = [...sans, makeSanAndPlay(next, parsed)];
            const childPath = [...path, index];
            moves.push({
                san: normalizeSearchMove(childSans[childSans.length - 1]),
                path: childPath,
                line: numbered(childSans, startPly),
                color: side,
                trained: trained.has(childUcis.join(" ")),
            });
            walk(child.children, next, childPath, childSans, childUcis);
        });
    };
    walk(game.moves.children, initial, [], [], []);
    return moves;
}

function matches(moves: IndexedMove[], move: string, color: MoveSearchColor): MoveSearchHit[] {
    const target = normalizeSearchMove(move);
    if (!target) return [];
    return moves
        .filter((entry) => entry.san === target && (color === "both" || color === entry.color))
        .map(({ san: _san, ...hit }) => hit);
}

/** Hits of `move` in one PGN record. */
export function searchRecord(
    pgn: string,
    move: string,
    color: MoveSearchColor,
    trained: Set<string> = new Set(),
): MoveSearchHit[] {
    return matches(indexRecord(pgn, trained), move, color);
}

export type RepertoireMoveIndex = { variant: OpeningVariant; moves: IndexedMove[] }[];

/**
 * Reads the records of a repertoire's PGN (in file order) once, so each search only filters. A
 * record belongs to the section named in its header, or else to the one at its index, as the
 * repertoire's own tools do.
 */
export function indexRepertoireRecords(
    records: string[],
    repertoireId: string,
    openings: OpeningsState,
): RepertoireMoveIndex {
    const repertoire = openings.repertoires[repertoireId];
    if (!repertoire) return [];
    const variants = repertoire.variantIds
        .map((id) => openings.variants[id])
        .filter((variant): variant is OpeningVariant => Boolean(variant));
    return records.flatMap((pgn, index) => {
        const taggedId = VARIANT_ID_PATTERN.exec(pgn)?.[1];
        const variant =
            variants.find((candidate) => candidate.id === taggedId) ??
            variants.find((candidate) => candidate.trainingRecordIndex === index);
        return variant
            ? [{ variant, moves: indexRecord(pgn, trainedPrefixes(variant, openings)) }]
            : [];
    });
}

export function searchRepertoireIndex(
    index: RepertoireMoveIndex,
    move: string,
    color: MoveSearchColor,
): MoveSearchSection[] {
    return index.flatMap(({ variant, moves }) => {
        const hits = matches(moves, move, color);
        return hits.length > 0 ? [{ variant, hits }] : [];
    });
}
