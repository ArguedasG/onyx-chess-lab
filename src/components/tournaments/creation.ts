import { GENERATED_PLAYER_PREFIX } from "@/utils/botGeneratedPlayers";
import { botRatingAt, type RatedRhythm } from "@/utils/botRating";
import { getHumanBotProfile } from "@/utils/humanBots";
import {
    resolveTwinProfile,
    type SavedTwin,
    twinParticipantId,
} from "@/utils/preparation/savedTwins";
import type { CalendarEvent } from "@/utils/tournaments/calendar";
import { createTournament } from "@/utils/tournaments/engine";
import { buildField, templateFilters } from "@/utils/tournaments/templates";
import {
    type Tournament,
    type TournamentFormat,
    type TournamentParticipant,
    type TournamentTemplate,
    USER_PARTICIPANT_ID,
} from "@/utils/tournaments/types";

export function newTournamentId(): string {
    return `tournament-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function newSeed(): number {
    return Math.floor(Math.random() * 2 ** 31);
}

/** A catalog bot or generated player as an entrant, with its rating at the rhythm. */
export function entrantFor(
    profileId: string,
    rhythm: RatedRhythm,
): Omit<TournamentParticipant, "seed"> {
    const profile = getHumanBotProfile(profileId);
    return {
        id: profile.id,
        name: profile.name,
        rating: botRatingAt(profile.elo, rhythm),
        kind: profile.id.startsWith(GENERATED_PLAYER_PREFIX) ? "generated" : "catalog",
    };
}

/**
 * A saved twin as an entrant, with the rating of the profile it plays at the rhythm. It is only
 * added by hand: autofill never picks twins.
 */
export function twinEntrant(
    twin: SavedTwin,
    rhythm: RatedRhythm,
): Omit<TournamentParticipant, "seed"> {
    const profile = resolveTwinProfile(twin, rhythm)?.profile;
    return {
        id: twinParticipantId(twin.id),
        name: twin.name,
        rating: Math.round(profile?.play.elo ?? 1500),
        kind: "twin",
    };
}

export function userEntrant(name: string, rating: number): Omit<TournamentParticipant, "seed"> {
    return { id: USER_PARTICIPANT_ID, name, rating: Math.round(rating), kind: "user" };
}

/** Default number of Swiss rounds for a field: enough to separate the leaders, at most 9. */
export function defaultSwissRounds(players: number): number {
    return Math.max(3, Math.min(9, Math.ceil(Math.log2(Math.max(2, players))) + 1));
}

/** A calendar tournament around the user's current rating. */
export function calendarTournament(
    event: CalendarEvent,
    options: {
        name: string;
        userName: string;
        userRating: number;
        rhythm: RatedRhythm;
        rated: boolean;
        now: string;
    },
): Tournament {
    const template: TournamentTemplate = "mixed";
    const filters = {
        ...templateFilters(template, options.userRating),
        range: [
            Math.round(options.userRating - event.spread),
            Math.round(options.userRating + event.spread),
        ] as [number, number],
    };
    const field = buildField({
        template,
        opponents: event.players - 1,
        userRating: options.userRating,
        rhythm: options.rhythm,
        filters,
        seed: event.seed,
    });
    return createTournament({
        id: newTournamentId(),
        name: options.name,
        format: event.format,
        template,
        clock: event.clock,
        rated: options.rated,
        seed: event.seed,
        participants: [userEntrant(options.userName, options.userRating), ...field],
        swissRounds: event.swissRounds,
        calendarSlot: event.slot,
        now: options.now,
    });
}

export type FormatSettings = {
    format: TournamentFormat;
    players: number;
    swissRounds: number;
    doubleRoundRobin: boolean;
    gamesPerMatch: number;
};
