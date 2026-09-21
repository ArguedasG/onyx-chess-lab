import {
    getTacticsCompletedIndexes,
    getTacticsExerciseIndex,
    getTacticsSetSize,
    type TacticsAttempt,
    type TacticsCycleSummary,
    type TacticsState,
} from "./trainingAreas";

export type TacticsAttemptStatistics = {
    attempts: number;
    evaluated: number;
    correct: number;
    incorrect: number;
    unsupported: number;
    accuracyPercent: number | null;
    totalTimeMs: number;
    averageTimeMs: number | null;
};

export type TacticsCycleStatistics = {
    number: number;
    exerciseCount: number;
    completedCount: number;
    failures: number;
    evaluated: number;
    accuracyPercent: number | null;
    timeMs: number;
    averageTimeMs: number | null;
    completedAt: string | null;
};

export type TacticsEvolutionPoint = TacticsAttemptStatistics & {
    date: string;
};

export type TacticsSetStatistics = {
    totalExercises: number;
    attemptedExercises: number;
    solvedExercises: number;
    attemptedPercent: number;
    solvedPercent: number;
    overall: TacticsAttemptStatistics;
    activeCycle: TacticsCycleStatistics | null;
    completedCycles: TacticsCycleStatistics[];
    evolution: TacticsEvolutionPoint[];
};

function percentage(part: number, total: number): number | null {
    if (total === 0) return null;
    return Math.round((part / total) * 1_000) / 10;
}

function summarizeTacticsAttempts(attempts: TacticsAttempt[]): TacticsAttemptStatistics {
    const correct = attempts.filter((attempt) => attempt.outcome === "correct").length;
    const incorrect = attempts.filter((attempt) => attempt.outcome === "incorrect").length;
    const unsupported = attempts.filter((attempt) => attempt.outcome === "unsupported").length;
    const evaluated = correct + incorrect;
    const totalTimeMs = attempts.reduce((total, attempt) => total + attempt.timeMs, 0);
    return {
        attempts: attempts.length,
        evaluated,
        correct,
        incorrect,
        unsupported,
        accuracyPercent: percentage(correct, evaluated),
        totalTimeMs,
        averageTimeMs: attempts.length > 0 ? totalTimeMs / attempts.length : null,
    };
}

function summarizeTacticsCycle(
    cycle: Pick<
        TacticsCycleSummary,
        "number" | "exerciseCount" | "completedCount" | "failures" | "timeMs"
    >,
    completedAt: string | null,
): TacticsCycleStatistics {
    const evaluated = cycle.completedCount + cycle.failures;
    return {
        ...cycle,
        evaluated,
        accuracyPercent: percentage(cycle.completedCount, evaluated),
        averageTimeMs: evaluated > 0 ? cycle.timeMs / evaluated : null,
        completedAt,
    };
}

export function getTacticsSetStatistics(
    state: TacticsState,
    setId: string,
): TacticsSetStatistics | null {
    const set = state.sets[setId];
    if (!set) return null;

    const attempts = state.attempts.filter((attempt) => attempt.setId === setId);
    const totalExercises = getTacticsSetSize(set);
    const attemptedExercises = new Set(
        attempts
            .map((attempt) => getTacticsExerciseIndex(set, attempt.exerciseId))
            .filter((index) => index >= 0 && index < totalExercises),
    ).size;
    const solvedExercises = getTacticsCompletedIndexes(state, setId).length;
    const evolutionByDate = new Map<string, TacticsAttempt[]>();

    for (const attempt of attempts) {
        const date = attempt.createdAt.slice(0, 10);
        const existing = evolutionByDate.get(date);
        if (existing) existing.push(attempt);
        else evolutionByDate.set(date, [attempt]);
    }

    const activeCycle = set.progress.activeCycle;
    const activeCycleCompleted = activeCycle
        ? getTacticsCompletedIndexes(state, setId, activeCycle.number).length
        : 0;

    return {
        totalExercises,
        attemptedExercises,
        solvedExercises,
        attemptedPercent: percentage(attemptedExercises, totalExercises) ?? 0,
        solvedPercent: percentage(solvedExercises, totalExercises) ?? 0,
        overall: summarizeTacticsAttempts(attempts),
        activeCycle: activeCycle
            ? summarizeTacticsCycle(
                  {
                      number: activeCycle.number,
                      exerciseCount: totalExercises,
                      completedCount: activeCycleCompleted,
                      failures: activeCycle.failures,
                      timeMs: activeCycle.timeMs,
                  },
                  null,
              )
            : null,
        completedCycles: set.progress.cycles
            .map((cycle) => summarizeTacticsCycle(cycle, cycle.completedAt))
            .sort((left, right) => left.number - right.number),
        evolution: Array.from(evolutionByDate.entries())
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([date, dailyAttempts]) => ({
                date,
                ...summarizeTacticsAttempts(dailyAttempts),
            })),
    };
}
