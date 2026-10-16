import type { TFunction } from "i18next";

export function categoryName(category: string, t: TFunction): string {
    const names: Record<string, string> = {
        allowedMate: t("Leaks.allowedMate", "Allowed a mate"),
        missedMate: t("Leaks.missedMate", "Missed a mate"),
        hangingPiece: t("Leaks.hangingPiece", "Hanging piece"),
        allowedFork: t("Leaks.allowedFork", "Allowed a fork"),
        missedFork: t("Leaks.missedFork", "Missed a fork"),
        missedCapture: t("Leaks.missedCapture", "Missed a capture"),
        missedPromotion: t("Leaks.missedPromotion", "Missed a promotion"),
        conversion: t("Leaks.conversion", "Advantage thrown away"),
        collapse: t("Leaks.collapse", "Collapse when worse"),
        timeTrouble: t("Leaks.timeTrouble", "Time trouble"),
        opening: t("Leaks.opening", "Opening slip"),
        endgame: t("Leaks.endgame", "Endgame slip"),
        unclassified: t("Leaks.unclassified", "Unclassified"),
    };
    return names[category] ?? category;
}

/** The rule of each category, as the interface explains it. */
export function categoryRule(category: string, t: TFunction): string {
    const rules: Record<string, string> = {
        allowedMate: t(
            "Leaks.Rule.allowedMate",
            "The engine's reply line ends in mate against you. A mistake or worse (10+ points of winning chances).",
        ),
        missedMate: t("Leaks.Rule.missedMate", "The engine's best line was a forced mate for you."),
        hangingPiece: t(
            "Leaks.Rule.hangingPiece",
            "The opponent's best reply takes a piece of yours (a knight or more) that nothing can take back.",
        ),
        allowedFork: t(
            "Leaks.Rule.allowedFork",
            "The opponent's best reply puts a piece on a square that attacks two of your pieces worth a knight or more (or the king).",
        ),
        missedFork: t(
            "Leaks.Rule.missedFork",
            "The engine's best move was a fork of two enemy pieces worth a knight or more (or the king).",
        ),
        missedCapture: t(
            "Leaks.Rule.missedCapture",
            "The engine's best move captured an enemy piece worth a knight or more.",
        ),
        missedPromotion: t("Leaks.Rule.missedPromotion", "The engine's best move was a promotion."),
        conversion: t(
            "Leaks.Rule.conversion",
            "From 80% winning chances or more, the move left you below 60%.",
        ),
        collapse: t(
            "Leaks.Rule.collapse",
            "In a worse but defendable position (10–40% winning chances), a mistake or worse.",
        ),
        timeTrouble: t("Leaks.Rule.timeTrouble", "Less than 10% of the base time on your clock."),
        opening: t("Leaks.Rule.opening", "In the first ten moves, with no more specific category."),
        endgame: t("Leaks.Rule.endgame", "In the endgame, with no more specific category."),
        unclassified: t(
            "Leaks.Rule.unclassified",
            "No rule above can be checked for this error: it keeps its loss, without a cause.",
        ),
    };
    return rules[category] ?? "";
}
