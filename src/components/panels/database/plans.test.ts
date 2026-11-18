import { describe, expect, it } from "vitest";
import type { PlanMove, PositionPlans } from "@/bindings";
import {
    planMoveDelta,
    planMoveName,
    planShapes,
    planViewName,
    typicalPlan,
    visiblePlanMoves,
} from "./plans";

function move(partial: Partial<PlanMove> & Pick<PlanMove, "from" | "to">): PlanMove {
    return {
        piece: "P",
        castle: null,
        promotion: null,
        games: 0,
        captures: 0,
        typicalMove: 1,
        ratedGames: 0,
        score: 0,
        expected: 0,
        together: [],
        ...partial,
    };
}

// 100 games after 1.e4 e5 2.Nc3 Nc6 3.Bc4 Nf6, white to move (the Vienna of the reference app).
const plans: PositionPlans = {
    total: 100,
    scanned: 100,
    games: 100,
    ratedGames: 100,
    score: 0.55,
    expected: 0.5,
    elapsedMs: 12,
    moves: [
        move({
            from: "d2",
            to: "d3",
            games: 90,
            typicalMove: 4,
            together: [90, 40, 30, 30, 28, 5],
        }),
        move({
            piece: "N",
            from: "g1",
            to: "f3",
            games: 46,
            typicalMove: 6,
            together: [40, 46, 2, 25, 26, 0],
        }),
        move({
            piece: "N",
            from: "g1",
            to: "e2",
            games: 32,
            typicalMove: 5,
            together: [30, 2, 32, 20, 3, 0],
        }),
        move({
            from: "f2",
            to: "f4",
            games: 32,
            typicalMove: 5,
            together: [30, 25, 20, 32, 22, 0],
        }),
        move({
            piece: "K",
            from: "e1",
            to: "g1",
            castle: "O-O",
            games: 29,
            typicalMove: 7,
            ratedGames: 29,
            together: [28, 26, 3, 22, 29, 0],
        }),
        move({
            piece: "B",
            from: "c4",
            to: "f7",
            games: 6,
            captures: 6,
            typicalMove: 4,
            together: [5, 0, 0, 0, 0, 6],
        }),
    ],
};

describe("plans", () => {
    it("names moves apart from their order", () => {
        expect(plans.moves.map(planViewName)).toEqual([
            "d2-d3",
            "Ng1-f3",
            "Ng1-e2",
            "f2-f4",
            "O-O",
            "Bc4×f7",
        ]);
        expect(planViewName(move({ from: "e7", to: "e8", promotion: "Q" }))).toBe("e7-e8=Q");
    });

    it("filters by share and, if asked, captures", () => {
        expect(visiblePlanMoves(plans, 0.2, false)).toEqual([0, 1, 2, 3, 4]);
        expect(visiblePlanMoves(plans, 0.05, false)).toEqual([0, 1, 2, 3, 4, 5]);
        expect(visiblePlanMoves(plans, 0.05, true)).toEqual([0, 1, 2, 3, 4]);
    });

    it("draws one knight route and orders the plan by when it is played", () => {
        const plan = typicalPlan(plans, visiblePlanMoves(plans, 0.2, false));
        // Ne2 clashes with Nf3 (same knight, other square); the rest are played together.
        expect(plan.map((i) => planViewName(plans.moves[i]))).toEqual([
            "d2-d3",
            "f2-f4",
            "Ng1-f3",
            "O-O",
        ]);
        const shapes = planShapes(plans, plan, true, 2);
        expect(shapes.map((shape) => shape.label?.text)).toEqual(["1", "2", "3", "4", undefined]);
        expect(shapes[4]).toMatchObject({ orig: "g1", dest: "e2", brush: "yellow" });
    });

    it("leaves out moves of another plan", () => {
        // A move that meets d3 in only 5 of its 40 games belongs to other games: it is left out.
        const rare = { ...plans, moves: plans.moves.map((m) => ({ ...m })) };
        rare.moves[5] = { ...rare.moves[5], captures: 0, games: 40, together: [5, 0, 0, 0, 0, 40] };
        const plan = typicalPlan(rare, [0, 5, 1]);
        expect(plan.map((i) => planViewName(rare.moves[i]))).toEqual(["d2-d3", "Ng1-f3"]);
    });

    it("scores against the ratings only with enough games", () => {
        const castle = { ...plans.moves[4], ratedGames: 40, score: 0.7, expected: 0.55 };
        // (0.70 - 0.55) - (0.55 - 0.50) = 0.10
        expect(planMoveDelta(castle, plans)).toBeCloseTo(10);
        expect(planMoveDelta(plans.moves[4], plans)).toBeNull();
    });

    it("tells pieces of a pawn-structure search by destination, as circles that never clash", () => {
        const structure: PositionPlans = {
            ...plans,
            moves: [
                move({ piece: "N", from: "", to: "f3", games: 60, together: [60, 40] }),
                move({ piece: "N", from: "", to: "d2", games: 50, together: [40, 50] }),
            ],
        };
        expect(structure.moves.map((m) => planMoveName(m))).toEqual(["N→f3", "N→d2"]);
        const plan = typicalPlan(structure, [0, 1]);
        expect(plan).toEqual([0, 1]);
        expect(planShapes(structure, plan, true, null)[0]).toEqual({
            orig: "f3",
            brush: "blue",
            label: { text: "1" },
        });
    });
});
