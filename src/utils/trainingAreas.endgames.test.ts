import finalPart1 from "../../src-tauri/resources/endgames/FinalesParte1.pgn?raw";
import finalPart2 from "../../src-tauri/resources/endgames/FinalesParte2.pgn?raw";
import finalPart3 from "../../src-tauri/resources/endgames/FinalesParte3.pgn?raw";
import { describe, expect, it } from "vitest";
import {
    addEndgameSet,
    createEmptyTrainingAreas,
    endgameOutcomeGuessFromObjective,
    endgameObjectiveFromTablebase,
    installBundledEndgameSets,
    isEndgamePositionCompleted,
    parseEndgameRecordMetadata,
    persistedTrainingAreasSchema,
    recordEndgameAttempt,
    recordEndgameRecognitionAttempt,
    updateEndgameObjective,
    updateEndgameStudentColor,
} from "./trainingAreas";

const whiteToMoveRecord = {
    fen: "8/8/8/8/8/8/4K3/6k1 w - - 0 1",
    moves: [],
    title: "Final de prueba",
    hasExplicitFen: true,
};

describe("endgame student color", () => {
    it("ships every included position with a fixed objective and student color", async () => {
        const files = [
            [finalPart1, 63],
            [finalPart2, 63],
            [finalPart3, 54],
        ] as const;

        for (const [raw, expectedCount] of files) {
            const records = raw
                .split(/(?=^\[Event\s+")/m)
                .map(parseEndgameRecordMetadata)
                .filter((record) => record.objective !== undefined);

            expect(records).toHaveLength(expectedCount);
            expect(
                records.every(
                    (record) => record.objective === "win" || record.objective === "draw",
                ),
            ).toBe(true);
            expect(records.every((record) => record.studentColor !== undefined)).toBe(true);
        }
    });

    it("loads fixed objective and student color metadata from bundled PGN records", () => {
        const metadata = parseEndgameRecordMetadata(`[Event "Final configurado"]
[Result "*"]
[SetUp "1"]
[FEN "8/8/8/8/8/8/4K3/6k1 w - - 0 1"]
[ChessLabEndgameObjective "draw"]
[ChessLabEndgameStudentColor "black"]

*`);

        const endgames = addEndgameSet(createEmptyTrainingAreas().endgames, "Incluidos", "", [
            {
                ...whiteToMoveRecord,
                endgameObjective: metadata.objective,
                endgameStudentColor: metadata.studentColor,
            },
        ]);
        const position = Object.values(endgames.positions)[0];

        expect(position).toMatchObject({
            objective: "draw",
            objectiveSource: "manual",
            studentColor: "black",
        });
    });

    it("refreshes bundled metadata on a content upgrade without losing progress or duplicating sets", () => {
        const initial = createEmptyTrainingAreas();
        const legacyBundled = addEndgameSet(
            initial.endgames,
            "Finales incluidos · Parte 1",
            "Anterior",
            [whiteToMoveRecord],
            { origin: "bundled" },
        );
        const bundledSetId = Object.keys(legacyBundled.sets)[0];
        const positionId = legacyBundled.sets[bundledSetId].positionIds[0];
        const withProgress = {
            ...legacyBundled,
            bundledContentVersion: 1,
            positions: {
                ...legacyBundled.positions,
                [positionId]: {
                    ...legacyBundled.positions[positionId],
                    progress: {
                        ...legacyBundled.positions[positionId].progress,
                        attempts: 3,
                        successes: 2,
                        completed: true,
                    },
                },
            },
        };
        const withUserSet = addEndgameSet(withProgress, "Propio", "No modificar", [
            whiteToMoveRecord,
        ]);

        const upgraded = installBundledEndgameSets(
            withUserSet,
            [
                {
                    name: "Contenido incluido · FinalesParte1.pgn",
                    description: "Actualizado",
                    records: [
                        {
                            ...whiteToMoveRecord,
                            endgameObjective: "win",
                            endgameStudentColor: "black",
                            sourcePgn: '[ChessLabEndgameObjective "win"]',
                        },
                    ],
                },
            ],
            2,
        );

        expect(upgraded.bundledContentVersion).toBe(2);
        expect(Object.values(upgraded.sets).filter((set) => set.origin === "bundled")).toHaveLength(
            1,
        );
        expect(Object.values(upgraded.sets).filter((set) => set.origin === "user")).toHaveLength(1);
        expect(upgraded.sets[bundledSetId].positionIds).toEqual([positionId]);
        expect(upgraded.positions[positionId]).toMatchObject({
            objective: "win",
            objectiveSource: "manual",
            studentColor: "black",
            progress: { attempts: 3, successes: 2, completed: true },
        });
        expect(installBundledEndgameSets(upgraded, [], 2)).toBe(upgraded);
    });

    it("defaults to the FEN side to move without coupling future edits to it", () => {
        const initial = createEmptyTrainingAreas();
        const endgames = addEndgameSet(initial.endgames, "Prueba", "", [whiteToMoveRecord]);
        const positionId = Object.keys(endgames.positions)[0];

        expect(endgames.positions[positionId].studentColor).toBe("white");

        const updated = updateEndgameStudentColor(endgames, positionId, "black");
        expect(updated.positions[positionId].studentColor).toBe("black");
        expect(updated.positions[positionId].fen).toContain(" w ");
    });

    it("migrates existing objectives and derives only the missing student color", () => {
        const initial = createEmptyTrainingAreas();
        const withSet = addEndgameSet(initial.endgames, "Prueba", "", [whiteToMoveRecord]);
        const positionId = Object.keys(withSet.positions)[0];
        const configured = updateEndgameObjective(withSet, positionId, "draw", "manual");
        const legacy = JSON.parse(
            JSON.stringify({ ...initial, schemaVersion: 9, endgames: configured }),
        ) as Record<string, unknown>;
        delete (legacy.endgames as { positions: Record<string, Record<string, unknown>> })
            .positions[positionId].studentColor;

        const migrated = persistedTrainingAreasSchema.parse(legacy);

        expect(migrated.endgames.positions[positionId]).toMatchObject({
            objective: "draw",
            objectiveSource: "manual",
            studentColor: "white",
        });
    });

    it("turns included side-to-move losses into wins for the student playing second", () => {
        const initial = createEmptyTrainingAreas();
        const withSet = addEndgameSet(initial.endgames, "Incluidos", "", [whiteToMoveRecord], {
            origin: "bundled",
        });
        const positionId = Object.keys(withSet.positions)[0];
        const configured = updateEndgameObjective(withSet, positionId, "loss", "manual");
        const legacy = JSON.parse(
            JSON.stringify({ ...initial, schemaVersion: 9, endgames: configured }),
        ) as Record<string, unknown>;
        delete (legacy.endgames as { positions: Record<string, Record<string, unknown>> })
            .positions[positionId].studentColor;

        const migrated = persistedTrainingAreasSchema.parse(legacy);

        expect(migrated.endgames.positions[positionId]).toMatchObject({
            objective: "win",
            studentColor: "black",
        });
    });

    it("translates tablebase categories to the student's perspective", () => {
        expect(endgameObjectiveFromTablebase("win", "white", "white")).toBe("win");
        expect(endgameObjectiveFromTablebase("win", "white", "black")).toBe("loss");
        expect(endgameObjectiveFromTablebase("loss", "white", "black")).toBe("win");
        expect(endgameObjectiveFromTablebase("draw", "white", "black")).toBe("draw");
    });

    it("turns the training objective into an absolute board result", () => {
        expect(endgameOutcomeGuessFromObjective("win", "white")).toBe("white");
        expect(endgameOutcomeGuessFromObjective("win", "black")).toBe("black");
        expect(endgameOutcomeGuessFromObjective("loss", "white")).toBe("black");
        expect(endgameOutcomeGuessFromObjective("loss", "black")).toBe("white");
        expect(endgameOutcomeGuessFromObjective("draw", "black")).toBe("draw");
        expect(endgameOutcomeGuessFromObjective("unknown", "white")).toBeNull();
    });

    it("records recognition separately from playing the endgame", () => {
        const initial = createEmptyTrainingAreas();
        const withSet = addEndgameSet(initial.endgames, "Prueba", "", [
            { ...whiteToMoveRecord, endgameObjective: "win", endgameStudentColor: "white" },
        ]);
        const positionId = Object.keys(withSet.positions)[0];

        const correct = recordEndgameRecognitionAttempt(withSet, positionId, {
            guess: "white",
            timeMs: 1200,
        });
        const unsure = recordEndgameRecognitionAttempt(correct, positionId, {
            guess: null,
            timeMs: 800,
        });

        expect(unsure.positions[positionId].progress).toMatchObject({
            attempts: 0,
            successes: 0,
            completed: false,
            recognition: {
                attempts: 2,
                successes: 1,
                failures: 1,
                totalTimeMs: 2000,
                lastGuess: null,
                lastCorrect: false,
            },
        });
    });

    it("only completes a position after a successful played attempt", () => {
        const initial = createEmptyTrainingAreas();
        const withSet = addEndgameSet(initial.endgames, "Prueba", "", [
            { ...whiteToMoveRecord, endgameObjective: "win", endgameStudentColor: "white" },
        ]);
        const positionId = Object.keys(withSet.positions)[0];
        const recognized = recordEndgameRecognitionAttempt(withSet, positionId, {
            guess: "white",
            timeMs: 500,
        });
        const failedPlay = recordEndgameAttempt(recognized, positionId, {
            outcome: "0-1",
            success: false,
            timeMs: 1_000,
        });
        const successfulPlay = recordEndgameAttempt(failedPlay, positionId, {
            outcome: "1-0",
            success: true,
            timeMs: 1_000,
        });

        expect(isEndgamePositionCompleted(recognized.positions[positionId])).toBe(false);
        expect(isEndgamePositionCompleted(failedPlay.positions[positionId])).toBe(false);
        expect(isEndgamePositionCompleted(successfulPlay.positions[positionId])).toBe(true);
    });

    it("migrates existing endgame progress with empty recognition statistics", () => {
        const initial = createEmptyTrainingAreas();
        const withSet = addEndgameSet(initial.endgames, "Prueba", "", [whiteToMoveRecord]);
        const positionId = Object.keys(withSet.positions)[0];
        const legacy = JSON.parse(
            JSON.stringify({ ...initial, schemaVersion: 10, endgames: withSet }),
        ) as Record<string, unknown>;
        delete (
            legacy.endgames as {
                positions: Record<string, { progress: Record<string, unknown> }>;
            }
        ).positions[positionId].progress.recognition;

        const migrated = persistedTrainingAreasSchema.parse(legacy);

        expect(migrated.schemaVersion).toBe(11);
        expect(migrated.endgames.positions[positionId].progress.recognition).toMatchObject({
            attempts: 0,
            successes: 0,
            failures: 0,
            lastGuess: null,
            lastCorrect: null,
        });
    });
});
