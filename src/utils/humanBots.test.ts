import { describe, expect, it } from "vitest";
import { buildHumanBotPlay, getHumanBotProfile, humanBotStyleWeights } from "./humanBots";

describe("human bot play styles", () => {
    it("turns the decision style into weights", () => {
        // Luna: high aggression and high complexity -> aggressive and complicating (Salvaje).
        expect(humanBotStyleWeights(getHumanBotProfile("luna"))).toEqual({
            aggression: 1,
            simplification: -1,
        });
        // Gabriel: low and low -> defensive and simplifying (Guardián).
        expect(humanBotStyleWeights(getHumanBotProfile("gabriel"))).toEqual({
            aggression: -1,
            simplification: 1,
        });
    });

    it("plays without style when there is no verifier", () => {
        const play = buildHumanBotPlay(getHumanBotProfile("vera"), null);
        expect(play.verifierPath).toBeNull();
        expect(play.elo).toBe(1500);
    });
});
