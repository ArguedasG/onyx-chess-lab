import { describe, expect, it } from "vitest";
import { lichessPuzzleTag, savePuzzleToSet, setHasPuzzle } from "./puzzleSets";
import { addTacticsSet, type TacticsState } from "./trainingAreas";

// After 1.e4 e5 2.Nf3: Black's ...Nc6 is the "opponent's" move, then White plays Bb5.
const PUZZLE = {
    id: "00abc",
    fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
    moves: ["b8c6", "f1b5"],
    rating: 1500,
    themes: ["opening"],
};

const empty: TacticsState = { sets: {}, exercises: {}, attempts: [] };

describe("savePuzzleToSet", () => {
    it("creates a new set where the opponent moves first", () => {
        const result = savePuzzleToSet(empty, { name: "Saved", description: "" }, PUZZLE);
        const set = result.state.sets[result.setId];
        expect(result.added).toBe(true);
        expect(set.config.startingActor).toBe("opponent");
        const exercise = result.state.exercises[set.exerciseIds[0]];
        expect(exercise.fen).toBe(PUZZLE.fen);
        expect(exercise.solutionMoves).toEqual(PUZZLE.moves);
        expect(exercise.tags).toEqual([lichessPuzzleTag(PUZZLE.id), "opening"]);
    });

    it("plays the opponent's move for a set where the student starts", () => {
        const withSet = addTacticsSet(empty, "Mine", "", []);
        const setId = Object.keys(withSet.sets)[0];
        const result = savePuzzleToSet(withSet, { setId }, PUZZLE);
        const exercise = result.state.exercises[result.state.sets[setId].exerciseIds[0]];
        expect(exercise.fen).toBe(
            "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
        );
        expect(exercise.solutionMoves).toEqual(["f1b5"]);
    });

    it("does not save the same puzzle twice", () => {
        const first = savePuzzleToSet(empty, { name: "Saved", description: "" }, PUZZLE);
        const again = savePuzzleToSet(first.state, { setId: first.setId }, PUZZLE);
        expect(again.added).toBe(false);
        expect(again.state).toBe(first.state);
        expect(setHasPuzzle(first.state, first.setId, PUZZLE.id)).toBe(true);
    });
});
