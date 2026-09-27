import { describe, expect, it } from "vitest";
import {
    getDueOpeningLines,
    isOpeningLineDue,
    nextOpeningReviewDate,
    scheduleOpeningLineReview,
} from "./openingReview";
import { createEmptyTrainingAreas, type OpeningLine, type OpeningsState } from "./trainingAreas";

const NOW = new Date("2026-09-26T12:00:00.000Z");
const HOUR = 3_600_000;

function line(id: string, extra: Partial<OpeningLine> = {}): OpeningLine {
    return {
        id,
        variantId: "v1",
        name: id,
        fen: "start",
        moves: ["e2e4"],
        path: [0],
        plyCount: 1,
        trainable: true,
        sourceRecordIndex: null,
        moveProgress: {},
        session: { attempts: 0, completions: 0, flawless: 0, totalTimeMs: 0 },
        ...extra,
    };
}

function review(due: Date) {
    return {
        due: due.toISOString(),
        stability: 1,
        difficulty: 5,
        elapsed_days: 0,
        scheduled_days: 1,
        reps: 1,
        lapses: 0,
        state: 2,
    };
}

function state(lines: OpeningLine[]): OpeningsState {
    const base = createEmptyTrainingAreas().openings;
    return {
        ...base,
        variants: {
            v1: {
                id: "v1",
                repertoireId: "r1",
                name: "Theory",
                lineIds: lines.map((l) => l.id),
                sourceRecordIndex: 0,
                trainingRecordIndex: 0,
                contentType: "theory",
                commentCount: 0,
                hasVariations: false,
            },
        },
        lines: Object.fromEntries(lines.map((l) => [l.id, l])),
    };
}

describe("opening line reviews", () => {
    it("schedules a first review in the future and grows the interval on success", () => {
        const initial = state([line("a", { learnedAt: NOW.toISOString() })]);
        const first = scheduleOpeningLineReview(initial, "a", 3, NOW);
        const firstDue = new Date(first.lines.a.review!.due);
        expect(firstDue.getTime()).toBeGreaterThan(NOW.getTime());
        expect(first.lines.a.review!.reps).toBe(1);

        const second = scheduleOpeningLineReview(first, "a", 3, firstDue);
        const secondDue = new Date(second.lines.a.review!.due);
        expect(secondDue.getTime() - firstDue.getTime()).toBeGreaterThan(
            firstDue.getTime() - NOW.getTime(),
        );
        expect(second.lines.a.review!.lastReview).toBe(firstDue.toISOString());
    });

    it("brings a failed line back sooner than a successful one", () => {
        const learned = scheduleOpeningLineReview(
            state([line("a", { learnedAt: NOW.toISOString() })]),
            "a",
            3,
            NOW,
        );
        const at = new Date(learned.lines.a.review!.due);
        const again = new Date(scheduleOpeningLineReview(learned, "a", 1, at).lines.a.review!.due);
        const good = new Date(scheduleOpeningLineReview(learned, "a", 3, at).lines.a.review!.due);
        expect(again.getTime()).toBeLessThan(good.getTime());
    });

    it("only considers learned trainable lines and orders them by due date", () => {
        const current = state([
            line("new"),
            line("paused", { trainable: false, learnedAt: "2026-09-01" }),
            line("later", {
                learnedAt: "2026-09-01",
                review: review(new Date(NOW.getTime() + HOUR)),
            }),
            line("overdue", {
                learnedAt: "2026-09-01",
                review: review(new Date(NOW.getTime() - 48 * HOUR)),
            }),
            line("legacy", {
                session: { attempts: 1, completions: 1, flawless: 1, totalTimeMs: 0 },
            }),
            line("due", {
                learnedAt: "2026-09-01",
                review: review(new Date(NOW.getTime() - HOUR)),
            }),
        ]);
        expect(isOpeningLineDue(current.lines.new, NOW)).toBe(false);
        expect(getDueOpeningLines(current, ["v1"], NOW).map((l) => l.id)).toEqual([
            "legacy",
            "overdue",
            "due",
        ]);
        expect(nextOpeningReviewDate(Object.values(current.lines), NOW)?.getTime()).toBe(
            NOW.getTime() + HOUR,
        );
    });
});
