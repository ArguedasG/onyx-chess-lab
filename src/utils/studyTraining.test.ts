import { afterEach, describe, expect, it, vi } from "vitest";
import { commands } from "@/bindings";
import { loadEmbeddedTacticsExercise } from "./tacticsTraining";
import {
    createStudyEndgameRecord,
    createStudyTacticsRecord,
    getStudyPositionCandidates,
} from "./studyTraining";
import type { Study, StudyChapter } from "./studies";
import {
    addEndgamePositionToSet,
    addEndgameSet,
    addTacticsExerciseToSet,
    addTacticsSet,
    createEmptyTrainingAreas,
} from "./trainingAreas";

const chapter: StudyChapter = {
    id: "chapter-1",
    title: "Bot game",
    pgn: '[Event "Bot game"]\n\n1. e4 e5 (1... c5) 2. Nf3 *',
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    revisions: [],
};
const study: Study = {
    id: "study-1",
    name: "Bots",
    description: "",
    chapterOrder: [chapter.id],
    chapters: { [chapter.id]: chapter },
    createdAt: chapter.createdAt,
    updatedAt: chapter.updatedAt,
};

function mockLex() {
    return vi.spyOn(commands, "lexPgn").mockImplementation(async (pgn) => {
        const copied = pgn.includes("OnyxStudyId");
        const fen = /^\[FEN "([^"]+)"\]$/im.exec(pgn)?.[1];
        return {
            status: "ok",
            data: [
                { type: "Header", value: { tag: "Event", value: "Bot game" } },
                ...(fen ? [{ type: "Header" as const, value: { tag: "FEN", value: fen } }] : []),
                ...(!copied ? [{ type: "San" as const, value: "e4" }] : []),
                { type: "San", value: "e5" },
                { type: "ParenOpen" },
                { type: "San", value: "c5" },
                { type: "ParenClose" },
                { type: "San", value: "Nf3" },
                { type: "Outcome", value: "*" },
            ],
        } as Awaited<ReturnType<typeof commands.lexPgn>>;
    });
}

afterEach(() => vi.restoreAllMocks());

describe("study training copies", () => {
    it("offers positions from the complete tree and preserves the selected subtree as provenance", async () => {
        mockLex();
        const candidates = await getStudyPositionCandidates(chapter.pgn, "tactics");
        const afterE4 = candidates.find((candidate) => candidate.path.join(",") === "0")!;
        expect(afterE4.hasVariations).toBe(true);

        const record = await createStudyTacticsRecord(study, chapter, afterE4.path);
        expect(record.studySource).toEqual({ studyId: study.id, chapterId: chapter.id, path: [0] });
        expect(record.moves).toEqual(["e7e5", "g1f3"]);
        expect(record.sourcePgn).toContain("c5");
        expect(record.sourcePgn).toContain('[OnyxStudyId "study-1"]');
    });

    it("uses the copied PGN variations when loading an embedded tactics exercise", async () => {
        mockLex();
        const record = await createStudyTacticsRecord(study, chapter, [0]);
        const tactics = addTacticsSet(createEmptyTrainingAreas().tactics, "Bots", "", [record], {
            config: { variationPolicy: "all", startingActor: "student" },
        });
        const set = Object.values(tactics.sets)[0];
        const exercise = tactics.exercises[set.exerciseIds[0]];
        const loaded = await loadEmbeddedTacticsExercise(exercise, set.config, 0);
        expect(loaded.solutionLines).toEqual([["e7e5", "g1f3"], ["c7c5"]]);
    });

    it("records an explicit endgame objective and student color without changing the chapter", async () => {
        mockLex();
        const record = await createStudyEndgameRecord(study, chapter, [0, 0], "draw", "black");
        expect(record.endgameObjective).toBe("draw");
        expect(record.endgameStudentColor).toBe("black");
        expect(record.studySource?.path).toEqual([0, 0]);
        expect(chapter.pgn).toContain("e5");
    });

    it("does not add the same reviewed study position twice to an existing set", async () => {
        mockLex();
        const tacticRecord = await createStudyTacticsRecord(study, chapter, [0]);
        let tactics = addTacticsSet(createEmptyTrainingAreas().tactics, "Bots", "", [tacticRecord]);
        const tacticsSet = Object.values(tactics.sets)[0];
        tactics = addTacticsExerciseToSet(tactics, tacticsSet.id, tacticRecord);
        expect(tactics.sets[tacticsSet.id].exerciseIds).toHaveLength(1);

        const endgameRecord = await createStudyEndgameRecord(
            study,
            chapter,
            [0, 0],
            "draw",
            "black",
        );
        let endgames = addEndgameSet(createEmptyTrainingAreas().endgames, "Bots", "", [
            endgameRecord,
        ]);
        const endgameSet = Object.values(endgames.sets)[0];
        endgames = addEndgamePositionToSet(endgames, endgameSet.id, endgameRecord);
        expect(endgames.sets[endgameSet.id].positionIds).toHaveLength(1);
    });
});
