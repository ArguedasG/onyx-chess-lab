import { describe, expect, it } from "vitest";
import { getTacticsSetStatistics, type TacticsSet, type TacticsState } from "./trainingAreas";

const set: TacticsSet = {
    id: "set-1",
    name: "Calculation",
    description: "",
    exerciseIds: ["e1", "e2", "e3"],
    source: { kind: "embedded" },
    origin: "user",
    recommendedRating: { min: null, max: null },
    progress: {
        nextExerciseIndex: 2,
        autoAdvance: false,
        activeCycle: {
            number: 2,
            queue: [0, 1, 2],
            position: 1,
            failedIndexes: [],
            failures: 0,
            timeMs: 4_000,
        },
        cycles: [
            {
                id: "cycle-1",
                number: 1,
                exerciseCount: 3,
                completedCount: 2,
                failures: 1,
                timeMs: 9_000,
                completedAt: "2026-09-10T12:00:00.000Z",
            },
        ],
    },
    config: {
        acceptanceThresholdCp: 30,
        mode: "woodpecker",
        startingActor: "student",
        variationPolicy: "opponentResponses",
        validationMode: "auto",
    },
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-12T12:00:00.000Z",
};

function tacticsState(): TacticsState {
    return {
        sets: { [set.id]: set },
        exercises: {},
        attempts: [
            {
                id: "a1",
                setId: set.id,
                exerciseId: "e1",
                playedMove: "e2e4",
                outcome: "correct",
                timeMs: 1_000,
                cycleNumber: 1,
                createdAt: "2026-09-10T10:00:00.000Z",
            },
            {
                id: "a2",
                setId: set.id,
                exerciseId: "e2",
                playedMove: "d2d4",
                outcome: "incorrect",
                timeMs: 3_000,
                cycleNumber: 1,
                createdAt: "2026-09-10T10:05:00.000Z",
            },
            {
                id: "a3",
                setId: set.id,
                exerciseId: "e2",
                playedMove: "g1f3",
                outcome: "correct",
                timeMs: 2_000,
                cycleNumber: 1,
                createdAt: "2026-09-10T10:06:00.000Z",
            },
            {
                id: "a4",
                setId: set.id,
                exerciseId: "e1",
                playedMove: null,
                outcome: "unsupported",
                timeMs: 500,
                cycleNumber: 2,
                createdAt: "2026-09-12T10:00:00.000Z",
            },
            {
                id: "a5",
                setId: set.id,
                exerciseId: "e1",
                playedMove: "e2e4",
                outcome: "correct",
                timeMs: 1_500,
                cycleNumber: 2,
                createdAt: "2026-09-12T10:01:00.000Z",
            },
        ],
    };
}

describe("tactics set statistics", () => {
    it("keeps the accuracy sample explicit and separates current and completed cycles", () => {
        const statistics = getTacticsSetStatistics(tacticsState(), set.id);

        expect(statistics).not.toBeNull();
        expect(statistics?.overall).toMatchObject({
            attempts: 5,
            evaluated: 4,
            correct: 3,
            incorrect: 1,
            unsupported: 1,
            accuracyPercent: 75,
            totalTimeMs: 8_000,
            averageTimeMs: 1_600,
        });
        expect(statistics).toMatchObject({
            totalExercises: 3,
            attemptedExercises: 2,
            solvedExercises: 2,
            attemptedPercent: 66.7,
            solvedPercent: 66.7,
        });
        expect(statistics?.activeCycle).toMatchObject({
            number: 2,
            completedCount: 1,
            failures: 0,
            evaluated: 1,
            accuracyPercent: 100,
            completedAt: null,
        });
        expect(statistics?.completedCycles).toEqual([
            expect.objectContaining({
                number: 1,
                completedCount: 2,
                failures: 1,
                evaluated: 3,
                accuracyPercent: 66.7,
                averageTimeMs: 3_000,
            }),
        ]);
    });

    it("groups evolution by active date and excludes unsupported attempts from percentages", () => {
        const statistics = getTacticsSetStatistics(tacticsState(), set.id);

        expect(statistics?.evolution).toEqual([
            expect.objectContaining({
                date: "2026-09-10",
                attempts: 3,
                evaluated: 3,
                correct: 2,
                accuracyPercent: 66.7,
                averageTimeMs: 2_000,
            }),
            expect.objectContaining({
                date: "2026-09-12",
                attempts: 2,
                evaluated: 1,
                correct: 1,
                unsupported: 1,
                accuracyPercent: 100,
                averageTimeMs: 1_000,
            }),
        ]);
    });

    it("returns no fabricated percentage when a set only has unsupported attempts", () => {
        const state = tacticsState();
        state.attempts = [state.attempts[3]];

        expect(getTacticsSetStatistics(state, set.id)?.overall).toMatchObject({
            attempts: 1,
            evaluated: 0,
            unsupported: 1,
            accuracyPercent: null,
        });
        expect(getTacticsSetStatistics(state, "missing")).toBeNull();
    });
});
