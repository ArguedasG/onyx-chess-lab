import { hashText } from "./random";
import type { TournamentFormat } from "./types";

/**
 * The optional local calendar (I-51): a daily, a weekly and a monthly tournament, generated from
 * the date alone, with no server. The same day always gives the same tournaments, and each one
 * can be joined once.
 */
export type CalendarKind = "daily" | "weekly" | "monthly";

export type CalendarEvent = {
    /** Stable id of the period, such as `daily-2026-10-18`. */
    slot: string;
    kind: CalendarKind;
    /** Index into the names of its kind, for the translated title. */
    nameIndex: number;
    format: TournamentFormat;
    players: number;
    swissRounds?: number;
    clock: { seconds: number; increment: number };
    /** Half-width of the field around the user's rating. */
    spread: number;
    seed: number;
    startsOn: Date;
    endsOn: Date;
};

const minutes = (base: number, increment: number) => ({
    seconds: base * 60_000,
    increment: increment * 1000,
});

function isoDay(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
}

/** ISO week number and its Monday. */
function isoWeek(date: Date): { year: number; week: number; monday: Date } {
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const weekday = (day.getDay() + 6) % 7;
    const monday = new Date(day);
    monday.setDate(day.getDate() - weekday);
    const thursday = new Date(monday);
    thursday.setDate(monday.getDate() + 3);
    const firstThursday = new Date(thursday.getFullYear(), 0, 4);
    const week =
        1 +
        Math.round(
            ((thursday.getTime() - firstThursday.getTime()) / 86_400_000 -
                3 +
                ((firstThursday.getDay() + 6) % 7)) /
                7,
        );
    return { year: thursday.getFullYear(), week, monday };
}

/** Daily formats rotate so that each day feels different. */
const DAILY: Pick<CalendarEvent, "format" | "players" | "swissRounds" | "clock" | "spread">[] = [
    { format: "swiss", players: 24, swissRounds: 5, clock: minutes(3, 2), spread: 250 },
    { format: "roundRobin", players: 6, clock: minutes(5, 3), spread: 150 },
    { format: "knockout", players: 8, clock: minutes(3, 2), spread: 200 },
    { format: "swiss", players: 16, swissRounds: 4, clock: minutes(5, 0), spread: 200 },
];

const WEEKLY: Pick<CalendarEvent, "format" | "players" | "swissRounds" | "clock" | "spread">[] = [
    { format: "swiss", players: 40, swissRounds: 7, clock: minutes(10, 5), spread: 300 },
    { format: "roundRobin", players: 8, clock: minutes(10, 0), spread: 200 },
    { format: "doubleElimination", players: 8, clock: minutes(10, 5), spread: 200 },
];

export const CALENDAR_NAME_COUNT: Record<CalendarKind, number> = {
    daily: 4,
    weekly: 3,
    monthly: 1,
};

export function calendarEvents(today: Date): CalendarEvent[] {
    const dayKey = isoDay(today);
    const dayIndex = Math.floor(
        (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - Date.UTC(2026, 0, 1)) /
            86_400_000,
    );
    const daily = DAILY[((dayIndex % DAILY.length) + DAILY.length) % DAILY.length];
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    const { year, week, monday } = isoWeek(today);
    const weekly = WEEKLY[(((year * 53 + week) % WEEKLY.length) + WEEKLY.length) % WEEKLY.length];
    const nextMonday = new Date(monday);
    nextMonday.setDate(monday.getDate() + 7);

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

    const event = (
        slot: string,
        kind: CalendarKind,
        nameIndex: number,
        base: Pick<CalendarEvent, "format" | "players" | "swissRounds" | "clock" | "spread">,
        startsOn: Date,
        endsOn: Date,
    ): CalendarEvent => ({
        slot,
        kind,
        nameIndex,
        ...base,
        seed: hashText(slot),
        startsOn,
        endsOn,
    });

    return [
        event(
            `daily-${dayKey}`,
            "daily",
            dayIndex % CALENDAR_NAME_COUNT.daily,
            daily,
            today,
            tomorrow,
        ),
        event(
            `weekly-${year}-W${week}`,
            "weekly",
            week % CALENDAR_NAME_COUNT.weekly,
            weekly,
            monday,
            nextMonday,
        ),
        event(
            `monthly-${monthKey}`,
            "monthly",
            0,
            {
                format: "swiss",
                players: 60,
                swissRounds: 9,
                clock: minutes(15, 10),
                spread: 350,
            },
            monthStart,
            nextMonth,
        ),
    ];
}
