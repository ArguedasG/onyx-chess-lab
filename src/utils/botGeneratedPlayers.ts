import type { BotCatalogSpec, BotOpeningStyleId, BotPlayStyleId } from "./botCatalogSpecs";
import type { BotOpeningFamilyId } from "./botOpenings";

/**
 * Generated players (Phase 9.1, I-49): bots without a story to fill large tournaments (9.2). Rating,
 * personalities, repertoire and name are drawn from a fixed seed, so a player is the same in every
 * tournament: its id, `gen-<seed>-<elo>`, is enough to rebuild it.
 */
const FIRST_NAMES = [
    "Alba",
    "Andrés",
    "Bianca",
    "Carmen",
    "Cristian",
    "Daniel",
    "Eva",
    "Felipe",
    "Gabriela",
    "Héctor",
    "Irene",
    "Jorge",
    "Lidia",
    "Luis",
    "Marta",
    "Miguel",
    "Natalia",
    "Nicolás",
    "Patricia",
    "Raúl",
    "Rosa",
    "Santiago",
    "Sara",
    "Tomás",
    "Valeria",
    "Xavier",
    "Yesenia",
    "Alicia",
    "Bernardo",
    "Clara",
    "Esteban",
    "Florencia",
    "Gustavo",
    "Iris",
    "Joaquín",
    "Lucía",
    "Manuel",
    "Nora",
    "Ricardo",
    "Sonia",
];
const SURNAME_INITIALS = "ABCDEFGHIJLMNOPRSTV";

const PLAY_STYLES: readonly BotPlayStyleId[] = [
    "rematador",
    "salvaje",
    "guardian",
    "acechador",
    "equilibrista",
];
const OPENING_STYLES: readonly BotOpeningStyleId[] = [
    "aventurero",
    "esgrimista",
    "practico",
    "clasico",
];

/** Families that fit each opening personality, by use. */
const FAMILIES: Record<
    BotOpeningStyleId,
    Record<"white" | "vsE4" | "vsD4" | "vsFlank", readonly BotOpeningFamilyId[]>
> = {
    aventurero: {
        white: ["gambits", "vienna", "d4-adventurous"],
        vsE4: ["two-knights", "scandinavian", "alekhine", "accelerated-dragon"],
        vsD4: ["albin", "benko", "dutch", "chigorin"],
        vsFlank: ["flank-g6", "flank-e5"],
    },
    esgrimista: {
        white: ["ruy", "scotch", "queens-gambit-sharp"],
        vsE4: ["najdorf", "dragon", "sveshnikov", "taimanov"],
        vsD4: ["kings-indian", "grunfeld", "benoni"],
        vsFlank: ["flank-c5", "flank-g6"],
    },
    practico: {
        white: ["london", "colle", "italian", "e4-practical", "reti-g3"],
        vsE4: ["caro-kann", "scandinavian", "philidor", "pirc", "modern"],
        vsD4: ["slav", "qgd", "qga"],
        vsFlank: ["flank-e5", "flank-nf6"],
    },
    clasico: {
        white: ["queens-gambit", "catalan", "english", "ruy", "reti-c4"],
        vsE4: [
            "ruy-defense",
            "berlin",
            "french-classical",
            "french-winawer",
            "petrov",
            "caro-kann",
        ],
        vsD4: ["qgd", "semi-slav", "nimzo"],
        vsFlank: ["flank-nf6", "flank-c5"],
    },
};

/** Mulberry32: small, fast and the same on every machine. */
function random(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function pick<T>(next: () => number, items: readonly T[]): T {
    return items[Math.floor(next() * items.length)];
}

export const GENERATED_PLAYER_PREFIX = "gen-";

export function generatedPlayerId(seed: number, elo: number): string {
    return `${GENERATED_PLAYER_PREFIX}${seed >>> 0}-${Math.round(elo)}`;
}

/** The spec of a generated player; the same seed and rating always give the same player. */
export function generatedPlayerSpec(seed: number, elo: number): BotCatalogSpec {
    const next = random(seed);
    const opening = pick(next, OPENING_STYLES);
    const families = FAMILIES[opening];
    return {
        id: generatedPlayerId(seed, elo),
        name: `${pick(next, FIRST_NAMES)} ${pick(next, SURNAME_INITIALS.split(""))}.`,
        elo: Math.max(800, Math.min(2800, Math.round(elo / 50) * 50)),
        play: pick(next, PLAY_STYLES),
        opening,
        white: pick(next, families.white),
        vsE4: pick(next, families.vsE4),
        vsD4: pick(next, families.vsD4),
        vsFlank: pick(next, families.vsFlank),
    };
}

/** Seed and rating of a generated player id, or `null` for any other id. */
export function parseGeneratedPlayerId(id: string): { seed: number; elo: number } | null {
    const match = /^gen-(\d+)-(\d+)$/.exec(id);
    return match ? { seed: Number(match[1]), elo: Number(match[2]) } : null;
}
