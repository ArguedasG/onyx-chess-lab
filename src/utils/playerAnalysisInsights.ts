import { isNormal, parseUci } from "chessops";
import type { PlayerAnalysisCriticalPosition, PlayerEngineAnalysis } from "@/utils/playerAnalysis";
import { positionFromFen } from "@/utils/chessops";
import type { TrainingAreasState } from "@/utils/trainingAreas";

export type PlayerTacticalMotif = "movedPiecePunished" | "missedCapture" | "missedPromotion";

export type PlayerTacticalInsight = {
    motif: PlayerTacticalMotif;
    confidence: "high";
    critical: PlayerAnalysisCriticalPosition;
};

export type PlayerEndgameFamily = "pawn" | "rook" | "minorPiece" | "queen" | "mixed";

export type PlayerEndgameInsight = {
    family: PlayerEndgameFamily;
    pieceCount: number;
    tablebaseEligible: boolean;
    critical: PlayerAnalysisCriticalPosition;
};

function parsedNormalMove(uci: string | undefined) {
    const move = uci ? parseUci(uci) : undefined;
    return move && isNormal(move) ? move : null;
}

/**
 * A deliberately small catalogue. Every returned label follows directly from
 * board occupancy and an engine principal variation; ambiguous positions stay
 * unclassified.
 */
export function classifyPlayerTacticalMotif(
    critical: PlayerAnalysisCriticalPosition,
): PlayerTacticalMotif | null {
    const [before] = positionFromFen(critical.fen);
    const [after] = positionFromFen(critical.postMoveFen);
    const played = parsedNormalMove(critical.playedMove);
    const best = parsedNormalMove(critical.bestLine[0]);
    const punishment = parsedNormalMove(critical.punishmentLine[0]);

    if (after && played && punishment && punishment.to === played.to) {
        const punishedPiece = after.board.get(played.to);
        if (punishedPiece?.color === critical.playerColor) return "movedPiecePunished";
    }
    if (best?.promotion) return "missedPromotion";
    if (before && best) {
        const captured = before.board.get(best.to);
        if (captured && captured.color !== critical.playerColor) return "missedCapture";
    }
    return null;
}

export function playerTacticalInsights(criticalPositions: PlayerAnalysisCriticalPosition[]) {
    const insights = criticalPositions.flatMap((critical): PlayerTacticalInsight[] => {
        const motif = classifyPlayerTacticalMotif(critical);
        return motif ? [{ motif, confidence: "high", critical }] : [];
    });
    const counts = new Map<PlayerTacticalMotif, number>();
    for (const insight of insights) counts.set(insight.motif, (counts.get(insight.motif) ?? 0) + 1);
    return {
        insights,
        counts,
        classified: insights.length,
        total: criticalPositions.length,
        coveragePercent: criticalPositions.length
            ? (insights.length / criticalPositions.length) * 100
            : 0,
    };
}

export function classifyPlayerEndgame(
    critical: PlayerAnalysisCriticalPosition,
): PlayerEndgameInsight | null {
    const [position] = positionFromFen(critical.fen);
    if (!position) return null;
    const pieceCount = position.board.occupied.size();
    // The legacy phase classifier excludes every queen ending. Include sparse
    // positions explicitly so material families do not inherit that blind spot.
    if (critical.phase !== "endgame" && pieceCount > 10) return null;
    const groups = [
        position.board.queen.nonEmpty(),
        position.board.rook.nonEmpty(),
        position.board.bishop.nonEmpty() || position.board.knight.nonEmpty(),
    ].filter(Boolean).length;
    const family: PlayerEndgameFamily =
        groups > 1
            ? "mixed"
            : position.board.queen.nonEmpty()
              ? "queen"
              : position.board.rook.nonEmpty()
                ? "rook"
                : position.board.bishop.nonEmpty() || position.board.knight.nonEmpty()
                  ? "minorPiece"
                  : "pawn";
    return { family, pieceCount, tablebaseEligible: pieceCount <= 7, critical };
}

export function playerEndgameInsights(criticalPositions: PlayerAnalysisCriticalPosition[]) {
    const candidates = criticalPositions.filter((critical) => {
        if (critical.phase === "endgame") return true;
        const [position] = positionFromFen(critical.fen);
        return position !== null && position.board.occupied.size() <= 10;
    });
    const insights = candidates.flatMap((critical): PlayerEndgameInsight[] => {
        const insight = classifyPlayerEndgame(critical);
        return insight ? [insight] : [];
    });
    const counts = new Map<PlayerEndgameFamily, number>();
    for (const insight of insights)
        counts.set(insight.family, (counts.get(insight.family) ?? 0) + 1);
    return {
        insights,
        counts,
        classified: insights.length,
        total: candidates.length,
        tablebaseEligible: insights.filter((insight) => insight.tablebaseEligible).length,
    };
}

const sourceKey = (databasePath: string, gameId: number, ply: number | null) =>
    `${databasePath}\u0000${gameId}\u0000${ply ?? -1}`;

const normalizedFen = (fen: string) => fen.split(" ").slice(0, 4).join(" ");

const comparableDate = (value: string | null | undefined) =>
    value?.slice(0, 10).replaceAll(".", "-");

export function playerTrainingObservation(
    engine: PlayerEngineAnalysis,
    training: TrainingAreasState,
) {
    const criticalBySource = new Map(
        engine.criticalPositions.map((critical) => [
            sourceKey(critical.databasePath, critical.gameId, critical.ply),
            critical,
        ]),
    );
    const trainedFens = new Map<string, string>();
    const linkedExerciseIds = new Set<string>();
    for (const exercise of Object.values(training.tactics.exercises)) {
        const source = exercise.source.playerAnalysis;
        if (!source) continue;
        const critical = criticalBySource.get(
            sourceKey(source.databasePath, source.gameId, source.ply),
        );
        if (!critical) continue;
        const attempts = training.tactics.attempts.filter(
            (attempt) => attempt.exerciseId === exercise.id,
        );
        if (!attempts.length) continue;
        linkedExerciseIds.add(exercise.id);
        const firstAttempt = attempts.map((attempt) => attempt.createdAt).sort()[0];
        const fen = normalizedFen(critical.fen);
        const previous = trainedFens.get(fen);
        if (!previous || firstAttempt < previous) trainedFens.set(fen, firstAttempt);
    }
    const linkedAttempts = training.tactics.attempts.filter((attempt) =>
        linkedExerciseIds.has(attempt.exerciseId),
    );
    const before: PlayerAnalysisCriticalPosition[] = [];
    const after: PlayerAnalysisCriticalPosition[] = [];
    for (const critical of engine.criticalPositions) {
        const trainedAt = trainedFens.get(normalizedFen(critical.fen));
        const playedAt = comparableDate(critical.gameDate);
        if (!trainedAt || !playedAt) continue;
        if (playedAt < comparableDate(trainedAt)!) before.push(critical);
        else after.push(critical);
    }
    const averageLoss = (values: PlayerAnalysisCriticalPosition[]) =>
        values.length
            ? values.reduce((sum, critical) => sum + critical.cpLoss, 0) / values.length
            : null;
    const evaluatedAttempts = linkedAttempts.filter((attempt) => attempt.outcome !== "unsupported");
    return {
        linkedPositions: trainedFens.size,
        attempts: linkedAttempts.length,
        correctAttempts: evaluatedAttempts.filter((attempt) => attempt.outcome === "correct")
            .length,
        evaluatedAttempts: evaluatedAttempts.length,
        beforeErrors: before.length,
        afterErrors: after.length,
        beforeAverageLoss: averageLoss(before),
        afterAverageLoss: averageLoss(after),
        comparisonAvailable: before.length > 0 && after.length > 0,
    };
}
