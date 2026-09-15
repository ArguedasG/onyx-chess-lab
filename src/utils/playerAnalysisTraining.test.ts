import { expect, it } from "vitest";
import {
    addTacticsExerciseToSet,
    addTacticsSet,
    createEmptyTrainingAreas,
    persistedTrainingAreasSchema,
    TRAINING_AREAS_SCHEMA_VERSION,
    type ParsedTrainingRecord,
} from "./trainingAreas";

const record: ParsedTrainingRecord = {
    title: "Player – Opponent · blunder",
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    moves: ["e2e4", "e7e5"],
    hasExplicitFen: true,
    playerAnalysis: {
        databasePath: "lichess.db3",
        gameId: 42,
        ply: 12,
        cpLoss: 250,
        classification: "blunder",
        mode: "improveDecision",
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        sideToMove: "white",
        solution: ["e2e4", "e7e5"],
    },
};

it("adds a Player Analysis position to an embedded user set and deduplicates its origin", () => {
    const empty = createEmptyTrainingAreas();
    const tactics = addTacticsSet(empty.tactics, "My errors", "", []);
    const setId = Object.keys(tactics.sets)[0];
    const added = addTacticsExerciseToSet(tactics, setId, record, ["player-analysis", "blunder"]);
    const duplicate = addTacticsExerciseToSet(added, setId, record, ["player-analysis"]);
    expect(added.sets[setId].exerciseIds).toHaveLength(1);
    expect(duplicate.sets[setId].exerciseIds).toHaveLength(1);
    const exercise = duplicate.exercises[duplicate.sets[setId].exerciseIds[0]];
    expect(exercise.source.playerAnalysis).toEqual(record.playerAnalysis);
    expect(exercise.tags).toContain("player-analysis");
});

it("keeps the two exercise perspectives as distinct positions", () => {
    const empty = createEmptyTrainingAreas();
    const tactics = addTacticsSet(empty.tactics, "My errors", "", []);
    const setId = Object.keys(tactics.sets)[0];
    const improved = addTacticsExerciseToSet(tactics, setId, record);
    const punishmentRecord: ParsedTrainingRecord = {
        ...record,
        fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
        moves: ["e7e5"],
        playerAnalysis: {
            ...record.playerAnalysis!,
            ply: 12,
            mode: "punishError",
            fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
            sideToMove: "black",
            solution: ["e7e5"],
        },
    };
    const withBoth = addTacticsExerciseToSet(improved, setId, punishmentRecord);
    expect(withBoth.sets[setId].exerciseIds).toHaveLength(2);
});

it("migrates training state v8 through the current schema", () => {
    const current = createEmptyTrainingAreas();
    const migrated = persistedTrainingAreasSchema.parse({ ...current, schemaVersion: 8 });
    expect(migrated.schemaVersion).toBe(TRAINING_AREAS_SCHEMA_VERSION);
    expect(migrated.tactics.sets).toEqual({});
});

it("adds perspective provenance when migrating Player Analysis exercises from v11", () => {
    const current = createEmptyTrainingAreas();
    const tactics = addTacticsSet(current.tactics, "My errors", "", []);
    const setId = Object.keys(tactics.sets)[0];
    const legacy = addTacticsExerciseToSet(tactics, setId, record);
    const exerciseId = legacy.sets[setId].exerciseIds[0];
    const playerAnalysis = legacy.exercises[exerciseId].source.playerAnalysis!;
    const legacyState = {
        ...current,
        schemaVersion: 11,
        tactics: {
            ...legacy,
            exercises: {
                ...legacy.exercises,
                [exerciseId]: {
                    ...legacy.exercises[exerciseId],
                    source: {
                        ...legacy.exercises[exerciseId].source,
                        playerAnalysis: {
                            databasePath: playerAnalysis.databasePath,
                            gameId: playerAnalysis.gameId,
                            ply: playerAnalysis.ply,
                            cpLoss: playerAnalysis.cpLoss,
                            classification: playerAnalysis.classification,
                        },
                    },
                },
            },
        },
    };

    const migrated = persistedTrainingAreasSchema.parse(legacyState);
    expect(migrated.tactics.exercises[exerciseId].source.playerAnalysis).toMatchObject({
        mode: "improveDecision",
        fen: record.fen,
        sideToMove: "white",
        solution: record.moves,
    });
});
