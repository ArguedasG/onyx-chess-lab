import { describe, expect, it } from "vitest";
import {
    addSetsToTacticsCourse,
    addTacticsFileSet,
    buildTacticsCourseQueue,
    createEmptyTrainingAreas,
    deleteTacticsCourse,
    getTacticsCourseProgress,
    groupTacticsSetsByCourse,
    moveTacticsSetInCourse,
    nextTacticsCourseSet,
    renameTacticsCourse,
    setTacticsSetCourse,
    type TacticsSet,
    type TacticsState,
    ungroupTacticsCourse,
} from "./trainingAreas";

const config: TacticsSet["config"] = {
    acceptanceThresholdCp: 30,
    mode: "guided",
    startingActor: "student",
    variationPolicy: "opponentResponses",
    validationMode: "auto",
};

function withSet(
    state: TacticsState,
    name: string,
    recordCount: number,
    course?: TacticsSet["course"],
): TacticsState {
    return addTacticsFileSet(state, {
        name,
        description: "",
        path: `C:/course/${name}.pgn`,
        filename: `${name}.pgn`,
        recordCount,
        config,
        course,
    });
}

function setNamed(state: TacticsState, name: string): TacticsSet {
    const set = Object.values(state.sets).find((candidate) => candidate.name === name);
    if (!set) throw new Error(`no set ${name}`);
    return set;
}

function course(): TacticsState {
    let state = createEmptyTrainingAreas().tactics;
    state = { ...state, sets: {} };
    // Added out of order on purpose: the course keeps its own order.
    state = withSet(state, "Pin", 10, { name: "Ratsma", order: 1 });
    state = withSet(state, "Double Attack", 20, { name: "Ratsma", order: 0 });
    state = withSet(state, "Loose", 5);
    return state;
}

describe("tactics courses", () => {
    it("groups sets by course, in theme order, and leaves the rest loose", () => {
        const { courses, loose } = groupTacticsSetsByCourse(Object.values(course().sets));
        expect(courses.map((group) => group.name)).toEqual(["Ratsma"]);
        expect(courses[0].sets.map((set) => set.name)).toEqual(["Double Attack", "Pin"]);
        expect(loose.map((set) => set.name)).toEqual(["Loose"]);
    });

    it("sums the progress of all the course's sets", () => {
        let state = course();
        const pin = setNamed(state, "Pin");
        state = {
            ...state,
            attempts: [
                {
                    id: "a1",
                    setId: pin.id,
                    exerciseId: "record-0",
                    playedMove: "e2e4",
                    outcome: "correct",
                    timeMs: 1000,
                    createdAt: "2026-11-06T00:00:00.000Z",
                },
            ],
        };
        const [group] = groupTacticsSetsByCourse(Object.values(state.sets)).courses;
        expect(getTacticsCourseProgress(state, group)).toMatchObject({
            total: 30,
            completed: 1,
            percent: 3,
        });
    });

    it("moves a set into a course at its end, and out of it", () => {
        let state = course();
        const loose = setNamed(state, "Loose");
        state = setTacticsSetCourse(state, loose.id, "Ratsma");
        expect(state.sets[loose.id].course).toEqual({ name: "Ratsma", order: 2 });
        state = setTacticsSetCourse(state, loose.id, "  ");
        expect(state.sets[loose.id].course).toBeUndefined();
    });

    it("renames a course and merges into an existing one after its themes", () => {
        let state = withSet(course(), "Mates", 3, { name: "Bain", order: 0 });
        state = renameTacticsCourse(state, "Ratsma", "Bain");
        const [group] = groupTacticsSetsByCourse(Object.values(state.sets)).courses;
        expect(group.name).toBe("Bain");
        expect(group.sets.map((set) => set.name)).toEqual(["Mates", "Double Attack", "Pin"]);
    });

    it("ungroups a course keeping its sets", () => {
        const state = ungroupTacticsCourse(course(), "Ratsma");
        expect(Object.keys(state.sets)).toHaveLength(3);
        expect(groupTacticsSetsByCourse(Object.values(state.sets)).courses).toEqual([]);
    });

    it("deletes a course with its sets only", () => {
        const state = deleteTacticsCourse(course(), "Ratsma");
        expect(Object.values(state.sets).map((set) => set.name)).toEqual(["Loose"]);
    });

    it("adds several sets in the order given, moving them from other courses", () => {
        let state = withSet(course(), "Mates", 3, { name: "Bain", order: 0 });
        const loose = setNamed(state, "Loose");
        const mates = setNamed(state, "Mates");
        state = addSetsToTacticsCourse(state, [mates.id, loose.id], "Ratsma");
        const [group] = groupTacticsSetsByCourse(Object.values(state.sets)).courses;
        expect(group.sets.map((set) => set.name)).toEqual([
            "Double Attack",
            "Pin",
            "Mates",
            "Loose",
        ]);
    });

    it("moves a set up and down inside its course", () => {
        let state = course();
        const pin = setNamed(state, "Pin");
        state = moveTacticsSetInCourse(state, pin.id, -1);
        const names = () =>
            groupTacticsSetsByCourse(Object.values(state.sets)).courses[0].sets.map(
                (set) => set.name,
            );
        expect(names()).toEqual(["Pin", "Double Attack"]);
        // Already first: nothing changes.
        expect(moveTacticsSetInCourse(state, pin.id, -1)).toBe(state);
        state = moveTacticsSetInCourse(state, pin.id, 1);
        expect(names()).toEqual(["Double Attack", "Pin"]);
    });

    it("continues with the first theme that still has exercises", () => {
        const state = course();
        const [group] = groupTacticsSetsByCourse(Object.values(state.sets)).courses;
        expect(nextTacticsCourseSet(state, group)?.name).toBe("Double Attack");
        const doubleAttack = setNamed(state, "Double Attack");
        const solvedAll: TacticsState = {
            ...state,
            attempts: Array.from({ length: 20 }, (_, index) => ({
                id: `a${index}`,
                setId: doubleAttack.id,
                exerciseId: `record-${index}`,
                playedMove: null,
                outcome: "correct" as const,
                timeMs: 1000,
                createdAt: "2026-11-06T00:00:00.000Z",
            })),
        };
        expect(nextTacticsCourseSet(solvedAll, group)?.name).toBe("Pin");
    });

    it("builds a mixed queue over all themes, filtered and limited", () => {
        let state = course();
        const pin = setNamed(state, "Pin");
        state = {
            ...state,
            attempts: [
                {
                    id: "a1",
                    setId: pin.id,
                    exerciseId: "record-3",
                    playedMove: "e2e4",
                    outcome: "incorrect",
                    timeMs: 1000,
                    createdAt: "2026-11-06T00:00:00.000Z",
                },
                {
                    id: "a2",
                    setId: pin.id,
                    exerciseId: "record-4",
                    playedMove: "e2e4",
                    outcome: "correct",
                    timeMs: 1000,
                    createdAt: "2026-11-06T00:00:00.000Z",
                },
            ],
        };
        const [group] = groupTacticsSetsByCourse(Object.values(state.sets)).courses;
        const all = buildTacticsCourseQueue(state, group, {
            source: "all",
            order: "course",
            size: 0,
        });
        expect(all.queue).toHaveLength(30);
        expect(all.queue[0]).toEqual({ setId: setNamed(state, "Double Attack").id, index: 0 });
        const pending = buildTacticsCourseQueue(state, group, {
            source: "pending",
            order: "course",
            size: 0,
        });
        expect(pending.queue).toHaveLength(29);
        const mistakes = buildTacticsCourseQueue(state, group, {
            source: "mistakes",
            order: "shuffle",
            size: 0,
        });
        expect(mistakes.queue).toEqual([{ setId: pin.id, index: 3 }]);
        const limited = buildTacticsCourseQueue(
            state,
            group,
            { source: "all", order: "shuffle", size: 5 },
            () => 0.5,
        );
        expect(limited.queue).toHaveLength(5);
        expect(new Set(limited.queue.map((item) => item.setId)).size).toBeGreaterThan(0);
    });

    it("leaves engine-checked themes out of the mixed queue", () => {
        let state = course();
        const pin = setNamed(state, "Pin");
        state = {
            ...state,
            sets: {
                ...state.sets,
                [pin.id]: { ...pin, config: { ...pin.config, validationMode: "engine" } },
            },
        };
        const [group] = groupTacticsSetsByCourse(Object.values(state.sets)).courses;
        const result = buildTacticsCourseQueue(state, group, {
            source: "all",
            order: "course",
            size: 0,
        });
        expect(result.queue).toHaveLength(20);
        expect(result.skippedSetIds).toEqual([pin.id]);
    });
});
