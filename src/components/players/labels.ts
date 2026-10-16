import type { PlayerAnalysisTimeControl } from "@/utils/playerAnalysis";

export type LabelT = (key: string, fallback: string, options?: Record<string, unknown>) => string;

export function formatScore(value: number | null | undefined): string {
    return value == null ? "—" : `${value.toFixed(1)}%`;
}

export function formatCp(value: number | null): string {
    return value == null ? "—" : `${value.toFixed(1)} cp`;
}

export function findingTitle(
    category: "opening" | "color" | "timeControl" | "rating" | "trend",
    subject: string,
    t: LabelT,
): string {
    const labels = {
        opening: ["PlayerAnalysis.FindingOpening", "Opening to review: {{subject}}"],
        color: ["PlayerAnalysis.FindingColor", "Results to review with {{subject}}"],
        timeControl: ["PlayerAnalysis.FindingTime", "Time control to review: {{subject}}"],
        rating: ["PlayerAnalysis.FindingRating", "Opponent group to review: {{subject}}"],
        trend: ["PlayerAnalysis.FindingTrend", "Trend to review: {{subject}}"],
    } as const;
    const [key, fallback] = labels[category];
    return t(key, fallback, { subject });
}

export function priorityLabel(value: "high" | "medium" | "low", t: LabelT): string {
    return {
        high: t("PlayerAnalysis.PriorityHigh", "High"),
        medium: t("PlayerAnalysis.PriorityMedium", "Medium"),
        low: t("PlayerAnalysis.PriorityLow", "Low"),
    }[value];
}

export function phaseLabel(value: "opening" | "middlegame" | "endgame", t: LabelT): string {
    return {
        opening: t("PlayerAnalysis.PhaseOpening", "Opening"),
        middlegame: t("PlayerAnalysis.PhaseMiddlegame", "Middlegame"),
        endgame: t("PlayerAnalysis.PhaseEndgame", "Endgame"),
    }[value];
}

export function classificationLabel(
    value: "inaccuracy" | "mistake" | "blunder",
    t: LabelT,
): string {
    return {
        inaccuracy: t("PlayerAnalysis.Inaccuracy", "Inaccuracy"),
        mistake: t("PlayerAnalysis.Mistake", "Mistake"),
        blunder: t("PlayerAnalysis.Blunder", "Blunder"),
    }[value];
}

export function timeControlLabel(value: PlayerAnalysisTimeControl, t: LabelT): string {
    return {
        ultra_bullet: t("TimeControl.UltraBullet", "Ultra bullet"),
        bullet: t("TimeControl.Bullet", "Bullet"),
        blitz: t("TimeControl.Blitz", "Blitz"),
        rapid: t("TimeControl.Rapid", "Rapid"),
        classical: t("TimeControl.Classical", "Classical"),
        correspondence: t("TimeControl.Correspondence", "Correspondence"),
        daily: t("PlayerAnalysis.TimeDaily", "Daily"),
        unknown: t("PlayerAnalysis.TimeUnknown", "Unknown"),
    }[value];
}
