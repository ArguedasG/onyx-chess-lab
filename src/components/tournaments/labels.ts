import {
    IconArrowsShuffle,
    IconChartBar,
    IconCrown,
    IconFlame,
    IconMountain,
    IconSettings,
    IconSword,
    IconTarget,
    type Icon,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { type RatedRhythm, rhythmOfClock } from "@/utils/botRating";
import { knockoutStage } from "@/utils/tournaments/engine";
import type {
    Tournament,
    TournamentBracket,
    TournamentFormat,
    TournamentTemplate,
} from "@/utils/tournaments/types";

export const TEMPLATE_ICONS: Record<TournamentTemplate, Icon> = {
    favorite: IconCrown,
    myLevel: IconTarget,
    allStronger: IconMountain,
    mixed: IconChartBar,
    specialists: IconSword,
    sameStyle: IconFlame,
    bigFavorite: IconArrowsShuffle,
    custom: IconSettings,
};

export const TEMPLATE_COLORS: Record<TournamentTemplate, string> = {
    favorite: "yellow",
    myLevel: "blue",
    allStronger: "red",
    mixed: "teal",
    specialists: "grape",
    sameStyle: "orange",
    bigFavorite: "indigo",
    custom: "gray",
};

/** Templates shown first; the rest are experimental. */
export const MAIN_TEMPLATES: readonly TournamentTemplate[] = [
    "myLevel",
    "favorite",
    "allStronger",
    "mixed",
];
export const EXPERIMENTAL_TEMPLATES: readonly TournamentTemplate[] = [
    "specialists",
    "sameStyle",
    "bigFavorite",
];

export function useTournamentLabels() {
    const { t } = useTranslation();
    const formats: Record<TournamentFormat, { name: string; description: string }> = {
        roundRobin: {
            name: t("Tournaments.Format.RoundRobin", "Round robin"),
            description: t(
                "Tournaments.Format.RoundRobin.Desc",
                "Everyone plays everyone. Few players, every game counts.",
            ),
        },
        swiss: {
            name: t("Tournaments.Format.Swiss", "Swiss"),
            description: t(
                "Tournaments.Format.Swiss.Desc",
                "A fixed number of rounds against players with your score. Ideal for big opens.",
            ),
        },
        knockout: {
            name: t("Tournaments.Format.Knockout", "Knockout"),
            description: t(
                "Tournaments.Format.Knockout.Desc",
                "Lose a match and you are out. Ties are decided by an Armageddon game.",
            ),
        },
        doubleElimination: {
            name: t("Tournaments.Format.DoubleElimination", "Double elimination"),
            description: t(
                "Tournaments.Format.DoubleElimination.Desc",
                "You are out after two lost matches: a first loss sends you to the losers' bracket.",
            ),
        },
    };
    const templates: Record<TournamentTemplate, { name: string; description: string }> = {
        myLevel: {
            name: t("Tournaments.Template.MyLevel", "Everyone at my level"),
            description: t(
                "Tournaments.Template.MyLevel.Desc",
                "Opponents within ±{{range}} of your rating. The fairest fight.",
                { range: 100 },
            ),
        },
        favorite: {
            name: t("Tournaments.Template.Favorite", "I am the favorite"),
            description: t(
                "Tournaments.Template.Favorite.Desc",
                "Opponents 100–400 points below you. Can you handle the pressure?",
            ),
        },
        allStronger: {
            name: t("Tournaments.Template.AllStronger", "Everyone is stronger"),
            description: t(
                "Tournaments.Template.AllStronger.Desc",
                "Opponents 50–400 points above you. Every half point is a success.",
            ),
        },
        mixed: {
            name: t("Tournaments.Template.Mixed", "Mixed field"),
            description: t(
                "Tournaments.Template.Mixed.Desc",
                "From 300 below to 300 above, like a real open.",
            ),
        },
        specialists: {
            name: t("Tournaments.Template.Specialists", "Opening specialists"),
            description: t(
                "Tournaments.Template.Specialists.Desc",
                "Everyone plays the same opening. Good to test your preparation.",
            ),
        },
        sameStyle: {
            name: t("Tournaments.Template.SameStyle", "One single style"),
            description: t(
                "Tournaments.Template.SameStyle.Desc",
                "All your opponents share a personality: attackers, defenders…",
            ),
        },
        bigFavorite: {
            name: t("Tournaments.Template.BigFavorite", "A giant in the field"),
            description: t(
                "Tournaments.Template.BigFavorite.Desc",
                "Your level, plus one opponent far stronger than everyone else.",
            ),
        },
        custom: {
            name: t("Tournaments.Template.Custom", "Custom"),
            description: t(
                "Tournaments.Template.Custom.Desc",
                "Choose the ratings, styles and openings yourself.",
            ),
        },
    };
    const brackets: Record<TournamentBracket, string> = {
        main: t("Tournaments.Bracket.Main", "Bracket"),
        winners: t("Tournaments.Bracket.Winners", "Winners' bracket"),
        losers: t("Tournaments.Bracket.Losers", "Losers' bracket"),
        final: t("Tournaments.Bracket.Final", "Grand final"),
        reset: t("Tournaments.Bracket.Reset", "Grand final, decider"),
    };
    const roundName = (tournament: Tournament, round: number): string => {
        const stage = knockoutStage(tournament, round);
        if (stage === "final") return t("Tournaments.Stage.Final", "Final");
        if (stage === "semifinal") return t("Tournaments.Stage.Semifinal", "Semifinals");
        if (stage === "quarterfinal") return t("Tournaments.Stage.Quarterfinal", "Quarterfinals");
        if (stage === "roundOf16") return t("Tournaments.Stage.RoundOf16", "Round of 16");
        return t("Tournaments.Round", "Round {{round}}", { round });
    };
    const ordinal = (rank: number) => t("Tournaments.Rank", "#{{rank}}", { rank });
    return { formats, templates, brackets, roundName, ordinal };
}

export function clockLabel(clock: { seconds: number; increment: number }): string {
    return `${clock.seconds / 60_000}+${clock.increment / 1000}`;
}

/** The rhythm whose ratings a tournament uses; bullet ones use the blitz scale. */
export function tournamentRhythm(clock: { seconds: number; increment: number }): RatedRhythm {
    const rhythm = rhythmOfClock(clock);
    return rhythm === "bullet" ? "blitz" : rhythm;
}

export function formatPoints(points: number): string {
    const whole = Math.floor(points);
    const half = points - whole >= 0.5;
    if (!half) return String(whole);
    return whole === 0 ? "½" : `${whole}½`;
}
