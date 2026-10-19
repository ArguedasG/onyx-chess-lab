import { describe, expect, it } from "vitest";
import {
    generatedPlayerId,
    generatedPlayerSpec,
    parseGeneratedPlayerId,
} from "./botGeneratedPlayers";
import { getHumanBotProfile } from "./humanBots";

describe("generated players", () => {
    it("are the same player for the same seed and rating", () => {
        expect(generatedPlayerSpec(42, 1630)).toEqual(generatedPlayerSpec(42, 1630));
        expect(generatedPlayerSpec(42, 1630).elo).toBe(1650);
        const names = new Set(
            Array.from({ length: 30 }, (_, seed) => generatedPlayerSpec(seed, 1500).name),
        );
        expect(names.size).toBeGreaterThan(15);
    });

    it("rebuild from their id as full profiles with a repertoire", () => {
        const id = generatedPlayerId(7, 2000);
        expect(parseGeneratedPlayerId(id)).toEqual({ seed: 7, elo: 2000 });
        expect(parseGeneratedPlayerId("billy")).toBeNull();
        const profile = getHumanBotProfile(id);
        expect(profile.id).toBe(id);
        expect(profile.elo).toBe(2000);
        expect(profile.repertoire.lines.length).toBeGreaterThan(0);
        expect(getHumanBotProfile(id)).toEqual(profile);
    });
});
