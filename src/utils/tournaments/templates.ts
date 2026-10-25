import { generatedPlayerId, generatedPlayerSpec } from "@/utils/botGeneratedPlayers";
import type { BotOpeningStyleId, BotPlayStyleId } from "@/utils/botCatalogSpecs";
import type { BotOpeningFamilyId } from "@/utils/botOpenings";
import { botRatingAt, type RatedRhythm } from "@/utils/botRating";
import {
    HUMAN_BOT_PROFILES,
    type HumanBotProfile,
    humanBotOpeningStyle,
    humanBotPlayStyle,
} from "@/utils/humanBots";
import { hashText, seededRandom } from "./random";
import type { TournamentParticipant, TournamentTemplate } from "./types";

/**
 * Templates and the automatic field (I-51). Every template is written from the user's point of
 * view, around their rating at the tournament rhythm; the field is filled with catalog bots first
 * (they have a name, a story and a measured style) and then with generated players, which are
 * the same person in every tournament because their id is their seed.
 */

/** Default half-width of "everyone at my level", in rating points. */
export const DEFAULT_LEVEL_RANGE = 100;

export type FieldFilters = {
    /** Ratings at the tournament rhythm. */
    range: [number, number];
    plays: BotPlayStyleId[];
    openings: BotOpeningStyleId[];
    family: BotOpeningFamilyId | null;
    includeCatalog: boolean;
    includeGenerated: boolean;
};

export type TemplateOptions = {
    /** "My level": half-width of the range. */
    levelRange?: number;
    /** "Specialists": the opening everyone plays. */
    family?: BotOpeningFamilyId | null;
    /** "Same style": the personality everyone shares. */
    play?: BotPlayStyleId | null;
};

const MIN_RATING = 400;
const MAX_RATING = 3000;

/** Filters of a template around the user's rating. */
export function templateFilters(
    template: TournamentTemplate,
    userRating: number,
    options: TemplateOptions = {},
): FieldFilters {
    const around = (low: number, high: number): [number, number] => [
        Math.max(MIN_RATING, Math.round(userRating + low)),
        Math.min(MAX_RATING, Math.round(userRating + high)),
    ];
    const base: FieldFilters = {
        range: around(-DEFAULT_LEVEL_RANGE, DEFAULT_LEVEL_RANGE),
        plays: [],
        openings: [],
        family: null,
        includeCatalog: true,
        includeGenerated: true,
    };
    switch (template) {
        case "favorite":
            return { ...base, range: around(-400, -100) };
        case "myLevel": {
            const width = Math.max(25, options.levelRange ?? DEFAULT_LEVEL_RANGE);
            return { ...base, range: around(-width, width) };
        }
        case "allStronger":
            return { ...base, range: around(50, 400) };
        case "mixed":
            return { ...base, range: around(-300, 300) };
        case "specialists":
            return { ...base, range: around(-250, 250), family: options.family ?? null };
        case "sameStyle":
            return { ...base, range: around(-200, 200), plays: options.play ? [options.play] : [] };
        case "bigFavorite":
            return { ...base, range: around(-150, 150) };
        case "custom":
            return base;
    }
}

/** Engine Elo whose rating at the rhythm is closest to `rating` (inverse of `botRatingAt`). */
export function engineEloFor(rating: number, rhythm: RatedRhythm): number {
    let best = 800;
    for (let elo = 800; elo <= 2800; elo += 50) {
        if (
            Math.abs(botRatingAt(elo, rhythm) - rating) <
            Math.abs(botRatingAt(best, rhythm) - rating)
        ) {
            best = elo;
        }
    }
    return best;
}

function familiesOf(profile: HumanBotProfile): BotOpeningFamilyId[] {
    const families = profile.catalog?.families;
    return families ? [families.white, families.vsE4, families.vsD4, families.vsFlank] : [];
}

export function matchesFilters(
    profile: HumanBotProfile,
    rating: number,
    filters: Pick<FieldFilters, "range" | "plays" | "openings" | "family">,
): boolean {
    if (rating < filters.range[0] || rating > filters.range[1]) return false;
    if (filters.plays.length > 0 && !filters.plays.includes(humanBotPlayStyle(profile)))
        return false;
    if (filters.openings.length > 0 && !filters.openings.includes(humanBotOpeningStyle(profile)))
        return false;
    if (filters.family && !familiesOf(profile).includes(filters.family)) return false;
    return true;
}

/** Catalog bots that fit the filters, with their rating at the rhythm. */
export function catalogCandidates(filters: FieldFilters, rhythm: RatedRhythm) {
    if (!filters.includeCatalog) return [];
    return HUMAN_BOT_PROFILES.filter((profile) => profile.catalog)
        .map((profile) => ({ profile, rating: botRatingAt(profile.elo, rhythm) }))
        .filter(({ profile, rating }) => matchesFilters(profile, rating, filters));
}

/**
 * A generated player near a rating that fits the filters: seeds are tried in order until one
 * gives the wanted personality or opening, so the result is still reproducible.
 */
function generatedNear(
    rating: number,
    rhythm: RatedRhythm,
    filters: FieldFilters,
    baseSeed: number,
    taken: Set<string>,
): Omit<TournamentParticipant, "seed"> | null {
    const elo = engineEloFor(rating, rhythm);
    for (let attempt = 0; attempt < 400; attempt++) {
        const seed = hashText(`${baseSeed}:${attempt}`);
        const id = generatedPlayerId(seed, elo);
        if (taken.has(id)) continue;
        const spec = generatedPlayerSpec(seed, elo);
        const wanted = { ...filters, range: [-Infinity, Infinity] as [number, number] };
        const profile = {
            catalog: {
                play: spec.play,
                opening: spec.opening,
                families: {
                    white: spec.white,
                    vsE4: spec.vsE4,
                    vsD4: spec.vsD4,
                    vsFlank: spec.vsFlank,
                },
            },
        } as HumanBotProfile;
        if (!matchesFilters(profile, 0, wanted)) continue;
        return { id, name: spec.name, rating: botRatingAt(spec.elo, rhythm), kind: "generated" };
    }
    return null;
}

export type FieldRequest = {
    template: TournamentTemplate;
    /** Opponents wanted, the user not included. */
    opponents: number;
    userRating: number;
    rhythm: RatedRhythm;
    filters: FieldFilters;
    seed: number;
    /** Players left out by hand, or already in the field. */
    exclude?: readonly string[];
};

/**
 * The opponents of a new tournament. Target ratings are spread over the range (with a little
 * jitter); each target takes the nearest unused catalog bot, or a generated player when no
 * catalog bot is close enough.
 */
export function buildField(request: FieldRequest): Omit<TournamentParticipant, "seed">[] {
    const { filters, rhythm, opponents } = request;
    const next = seededRandom(hashText(`${request.seed}:field`));
    const [low, high] = filters.range;
    const targets: number[] = [];
    if (request.template === "bigFavorite" && opponents > 0) {
        targets.push(request.userRating + 450);
    }
    const spread = opponents - targets.length;
    for (let i = 0; i < spread; i++) {
        const step = (high - low) / Math.max(1, spread);
        targets.push(low + step * (i + 0.5) + (next() - 0.5) * step * 0.8);
    }
    const catalog = catalogCandidates(
        request.template === "bigFavorite"
            ? { ...filters, range: [low, Math.max(high, request.userRating + 650)] }
            : filters,
        rhythm,
    );
    const used = new Set<string>(request.exclude ?? []);
    const field: Omit<TournamentParticipant, "seed">[] = [];
    // The closest catalog bot is accepted up to this distance; beyond it, a generated player.
    const tolerance = filters.includeGenerated ? 60 : Number.POSITIVE_INFINITY;
    targets.forEach((target, index) => {
        const candidates = catalog
            .filter(({ profile }) => !used.has(profile.id))
            .map((candidate) => ({ ...candidate, distance: Math.abs(candidate.rating - target) }))
            .filter((candidate) => candidate.distance <= tolerance)
            .sort((left, right) => left.distance - right.distance || next() - 0.5);
        const pick = candidates[0];
        if (pick) {
            used.add(pick.profile.id);
            field.push({
                id: pick.profile.id,
                name: pick.profile.name,
                rating: pick.rating,
                kind: "catalog",
            });
            return;
        }
        if (!filters.includeGenerated) return;
        const generated = generatedNear(
            target,
            rhythm,
            filters,
            hashText(`${request.seed}:gen:${index}`),
            used,
        );
        if (generated) {
            used.add(generated.id);
            field.push(generated);
        }
    });
    return field;
}

/** Players a format accepts, and its usual default. */
export const FIELD_SIZES = {
    roundRobin: { min: 3, max: 16, default: 8 },
    swiss: { min: 6, max: 150, default: 30 },
    knockout: { min: 4, max: 64, default: 16 },
    doubleElimination: { min: 4, max: 32, default: 8 },
} as const;
