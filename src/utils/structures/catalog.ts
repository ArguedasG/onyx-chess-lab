/**
 * The named pawn structures (I-31) as the interface presents them: family, skeleton and typical
 * breaks. The 8.6 set plus the structures of Mauricio Flores Rios's *Chess Structures* added in
 * 9.3. The rules live in Rust (`db/pawn_structures.rs`); the texts (plans, summaries) are Onyx's
 * own summaries, in `components/structures/texts.ts`, never the book's wording.
 */
import type { PawnStructure } from "@/bindings";

export type StructureFamily =
    | "isolated"
    | "queensGambit"
    | "dutchGrunfeld"
    | "sicilian"
    | "benoni"
    | "kingsIndian"
    | "french"
    | "ruyLopez";

export type StructureInfo = {
    family: StructureFamily;
    /** Pawns and kings only, with the owner as in the usual opening. */
    skeleton: string;
    /** The usual owner is White (the skeleton is shown from the owner's side). */
    ownerWhite: boolean;
    /** Typical pawn breaks as `from`-`to` squares, by colour of the skeleton. */
    breaks: { white: string[]; black: string[] };
    /** Structures it usually turns into or comes from. */
    related: PawnStructure[];
};

export const STRUCTURE_FAMILIES: readonly { id: StructureFamily; structures: PawnStructure[] }[] = [
    { id: "isolated", structures: ["iqp", "hangingPawns"] },
    {
        id: "queensGambit",
        structures: ["carlsbad", "caroKann", "slav", "panov", "threeVsFour"],
    },
    { id: "dutchGrunfeld", structures: ["stonewall", "grunfeld"] },
    {
        id: "sicilian",
        structures: ["najdorfI", "najdorfII", "scheveningen", "dragon", "maroczy", "hedgehog"],
    },
    { id: "benoni", structures: ["asymmetricBenoni", "symmetricBenoni", "benko"] },
    {
        id: "kingsIndian",
        structures: [
            "kingsIndianI",
            "kingsIndianII",
            "kingsIndianIII",
            "openKingsIndian",
            "kingsIndianComplex",
        ],
    },
    { id: "french", structures: ["frenchI", "frenchII", "frenchIII"] },
    { id: "ruyLopez", structures: ["closedRuyLopez", "lopezFormation"] },
];

export const STRUCTURE_INFO: Record<PawnStructure, StructureInfo> = {
    iqp: {
        family: "isolated",
        skeleton: "4k3/pp3ppp/4p3/8/3P4/8/PP3PPP/4K3 w - - 0 1",
        ownerWhite: true,
        breaks: { white: ["d4-d5"], black: [] },
        related: ["hangingPawns", "carlsbad", "panov"],
    },
    hangingPawns: {
        family: "isolated",
        skeleton: "4k3/p4ppp/1p2p3/8/2PP4/8/P4PPP/4K3 w - - 0 1",
        ownerWhite: true,
        breaks: { white: ["d4-d5", "c4-c5"], black: ["b6-b5", "e6-e5"] },
        related: ["iqp"],
    },
    caroKann: {
        family: "queensGambit",
        skeleton: "4k3/pp3ppp/2p1p3/8/3P4/8/PPP2PPP/4K3 w - - 0 1",
        ownerWhite: false,
        breaks: { white: ["c2-c4"], black: ["c6-c5", "e6-e5"] },
        related: ["threeVsFour", "slav"],
    },
    slav: {
        family: "queensGambit",
        skeleton: "4k3/pp3ppp/2p1p3/8/3P4/4P3/PP3PPP/4K3 w - - 0 1",
        ownerWhite: false,
        breaks: { white: ["e3-e4", "b2-b4"], black: ["e6-e5", "c6-c5", "f7-f5"] },
        related: ["caroKann", "threeVsFour"],
    },
    stonewall: {
        family: "dutchGrunfeld",
        skeleton: "4k3/ppp3pp/4p3/3p1p2/3P4/8/PPP1PPPP/4K3 w - - 0 1",
        ownerWhite: false,
        breaks: { white: ["c2-c4"], black: ["c7-c5"] },
        related: [],
    },
    grunfeld: {
        family: "dutchGrunfeld",
        skeleton: "4k3/pp2pppp/8/2p5/3PP3/2P5/P4PPP/4K3 w - - 0 1",
        ownerWhite: true,
        breaks: { white: ["d4-d5", "e4-e5"], black: [] },
        related: [],
    },
    carlsbad: {
        family: "queensGambit",
        skeleton: "4k3/pp3ppp/2p5/3p4/3P4/4P3/PP3PPP/4K3 w - - 0 1",
        ownerWhite: true,
        breaks: { white: ["b2-b4", "e3-e4"], black: ["c6-c5"] },
        related: ["panov", "iqp", "hangingPawns"],
    },
    najdorfI: {
        family: "sicilian",
        skeleton: "4k3/pp3ppp/3p4/3Pp3/8/8/PPP2PPP/4K3 w - - 0 1",
        ownerWhite: false,
        breaks: { white: ["c2-c4", "b2-b4"], black: ["f7-f5", "b7-b5"] },
        related: ["najdorfII", "kingsIndianComplex"],
    },
    najdorfII: {
        family: "sicilian",
        skeleton: "4k3/pp3ppp/3p4/4p3/4P3/8/PPP2PPP/4K3 w - - 0 1",
        ownerWhite: false,
        breaks: { white: ["f2-f4", "g2-g4"], black: ["d6-d5", "b7-b5"] },
        related: ["najdorfI", "scheveningen"],
    },
    hedgehog: {
        family: "sicilian",
        skeleton: "4k3/5ppp/pp1pp3/8/2P1P3/8/PP3PPP/4K3 w - - 0 1",
        ownerWhite: false,
        breaks: { white: ["c4-c5", "b2-b4"], black: ["b6-b5", "d6-d5", "g7-g5"] },
        related: ["maroczy", "scheveningen"],
    },
    maroczy: {
        family: "sicilian",
        skeleton: "4k3/pp2pp1p/3p2p1/8/2P1P3/8/PP3PPP/4K3 w - - 0 1",
        ownerWhite: true,
        breaks: { white: ["f2-f4"], black: ["b7-b5", "f7-f5"] },
        related: ["hedgehog", "dragon"],
    },
    asymmetricBenoni: {
        family: "benoni",
        skeleton: "4k3/pp3ppp/3p4/2pP4/4P3/8/PP3PPP/4K3 w - - 0 1",
        ownerWhite: false,
        breaks: { white: ["e4-e5", "f2-f4"], black: ["b7-b5", "f7-f5"] },
        related: ["symmetricBenoni", "benko", "lopezFormation"],
    },
    symmetricBenoni: {
        family: "benoni",
        skeleton: "4k3/pp3ppp/3p4/2pP4/2P5/8/PP3PPP/4K3 w - - 0 1",
        ownerWhite: false,
        breaks: { white: ["f2-f4", "g2-g4"], black: ["b7-b5", "f7-f5"] },
        related: ["asymmetricBenoni"],
    },
    kingsIndianI: {
        family: "kingsIndian",
        skeleton: "4k3/pp3ppp/3p4/3Pp3/4P3/8/PP3PPP/4K3 w - - 0 1",
        ownerWhite: false,
        breaks: { white: ["a2-a4"], black: ["f7-f5"] },
        related: ["kingsIndianII", "kingsIndianIII", "kingsIndianComplex"],
    },
    kingsIndianII: {
        family: "kingsIndian",
        skeleton: "4k3/pp3ppp/3p4/2pPp3/2P1P3/8/PP3PPP/4K3 w - - 0 1",
        ownerWhite: false,
        breaks: { white: ["b2-b4", "f2-f4"], black: ["f7-f5", "b7-b5"] },
        related: ["kingsIndianIII", "closedRuyLopez", "kingsIndianComplex"],
    },
    kingsIndianIII: {
        family: "kingsIndian",
        skeleton: "4k3/ppp2ppp/3p4/3Pp3/2P1P3/8/PP3PPP/4K3 w - - 0 1",
        ownerWhite: false,
        breaks: { white: ["c4-c5"], black: ["f7-f5"] },
        related: ["kingsIndianI", "kingsIndianII", "frenchII"],
    },
    openKingsIndian: {
        family: "kingsIndian",
        skeleton: "4k3/ppp2ppp/3p4/8/2P1P3/8/PP3PPP/4K3 w - - 0 1",
        ownerWhite: false,
        breaks: { white: ["f2-f4", "e4-e5"], black: ["d6-d5", "f7-f5", "b7-b5"] },
        related: ["kingsIndianComplex"],
    },
    kingsIndianComplex: {
        family: "kingsIndian",
        skeleton: "4k3/pp3ppp/2pp4/4p3/2PPP3/8/PP3PPP/4K3 w - - 0 1",
        ownerWhite: false,
        breaks: { white: ["d4-d5", "c4-c5"], black: ["e5-d4"] },
        related: [
            "kingsIndianI",
            "kingsIndianII",
            "kingsIndianIII",
            "openKingsIndian",
            "najdorfI",
            "najdorfII",
        ],
    },
    frenchI: {
        family: "french",
        skeleton: "4k3/ppp3pp/4p3/3p4/3P4/8/PPP2PPP/4K3 w - - 0 1",
        ownerWhite: false,
        breaks: { white: [], black: ["c7-c5", "e6-e5"] },
        related: ["frenchIII"],
    },
    frenchII: {
        family: "french",
        skeleton: "4k3/pp3ppp/4p3/3pP3/8/2P5/PP3PPP/4K3 w - - 0 1",
        ownerWhite: false,
        breaks: { white: ["f2-f4"], black: ["f7-f6", "b7-b5"] },
        related: ["frenchIII", "scheveningen"],
    },
    frenchIII: {
        family: "french",
        skeleton: "4k3/pp3ppp/4p3/3pP3/3P4/8/PP3PPP/4K3 w - - 0 1",
        ownerWhite: false,
        breaks: { white: ["f2-f4"], black: ["c7-c5", "f7-f6"] },
        related: ["frenchI", "frenchII"],
    },
    threeVsFour: {
        family: "queensGambit",
        skeleton: "4k3/pp3ppp/4p3/8/8/2P5/PP3PPP/4K3 w - - 0 1",
        ownerWhite: true,
        breaks: { white: ["b2-b4", "c3-c4"], black: ["a7-a5", "b7-b5"] },
        related: ["caroKann", "slav", "scheveningen"],
    },
    panov: {
        family: "queensGambit",
        skeleton: "4k3/pp2pppp/8/2Pp4/3P4/8/PP3PPP/4K3 w - - 0 1",
        ownerWhite: true,
        breaks: { white: ["b2-b4"], black: ["b7-b6"] },
        related: ["carlsbad", "iqp"],
    },
    dragon: {
        family: "sicilian",
        skeleton: "4k3/pp2pp1p/3p2p1/8/4P3/8/PPP2PPP/4K3 w - - 0 1",
        ownerWhite: false,
        breaks: { white: ["h2-h4"], black: ["b7-b5", "d6-d5"] },
        related: ["maroczy", "najdorfI"],
    },
    scheveningen: {
        family: "sicilian",
        skeleton: "4k3/pp3ppp/3pp3/8/4P3/8/PPP2PPP/4K3 w - - 0 1",
        ownerWhite: false,
        breaks: { white: ["g2-g4", "f2-f4"], black: ["d6-d5", "b7-b5"] },
        related: ["frenchII", "threeVsFour", "najdorfII", "hedgehog"],
    },
    benko: {
        family: "benoni",
        skeleton: "4k3/4pp1p/3p2p1/2pP4/4P3/8/PP3PPP/4K3 w - - 0 1",
        ownerWhite: false,
        breaks: { white: ["e4-e5", "f2-f4"], black: [] },
        related: ["asymmetricBenoni"],
    },
    closedRuyLopez: {
        family: "ruyLopez",
        skeleton: "4k3/p4ppp/3p4/1p1Pp3/2p1P3/2P5/PP3PPP/4K3 w - - 0 1",
        ownerWhite: true,
        breaks: { white: ["f2-f4", "a2-a4"], black: ["b5-b4", "f7-f5"] },
        related: ["kingsIndianII", "lopezFormation"],
    },
    lopezFormation: {
        family: "ruyLopez",
        skeleton: "4k3/pp3ppp/3p4/2p1p3/3PP3/2P5/PP3PPP/4K3 w - - 0 1",
        ownerWhite: true,
        breaks: { white: ["d4-d5"], black: ["c5-c4", "e5-d4"] },
        related: [
            "closedRuyLopez",
            "kingsIndianII",
            "kingsIndianI",
            "asymmetricBenoni",
            "kingsIndianComplex",
        ],
    },
};

export const ALL_STRUCTURES: readonly PawnStructure[] = STRUCTURE_FAMILIES.flatMap(
    (family) => family.structures,
);

export function structureFamily(structure: PawnStructure): StructureFamily {
    return STRUCTURE_INFO[structure].family;
}

/** A break as squares for the board arrows. */
export function breakSquares(move: string): [string, string] {
    const [from, to] = move.split("-");
    return [from, to];
}
