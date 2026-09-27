import { useLocation, useNavigate } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    activeTabAtom,
    currentOpeningPracticeQueueAtom,
    currentPracticeTabAtom,
    currentPracticeUnitAtom,
    currentTabSelectedAtom,
    tabsAtom,
} from "@/state/atoms";
import { trainingAreasAtom } from "@/state/trainingAreas";
import { openFile } from "@/utils/files";
import {
    getOpeningLearningSummary,
    isOpeningLineLearned,
    openingLearnBatchSize,
    trainableOpeningLines,
} from "@/utils/openingLearning";
import { getDueOpeningLines } from "@/utils/openingReview";
import type { OpeningLine, OpeningRepertoire, OpeningVariant } from "@/utils/trainingAreas";

/** `review` is a practice session limited to the lines whose spaced review is due. */
type SessionMode = "practice" | "learn" | "review";

export function useOpeningPractice() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const pathname = useLocation({ select: (location) => location.pathname });
    const [areas] = useAtom(trainingAreasAtom);
    const [, setTabs] = useAtom(tabsAtom);
    const [, setActiveTab] = useAtom(activeTabAtom);
    const [, setPracticeTab] = useAtom(currentPracticeTabAtom);
    const [, setSelectedPanel] = useAtom(currentTabSelectedAtom);
    const [, setPracticeUnit] = useAtom(currentPracticeUnitAtom);
    const [, setOpeningPracticeQueue] = useAtom(currentOpeningPracticeQueueAtom);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const openingReturnTarget = (() => {
        if (pathname === "/training/openings/manage") return { view: "manage" as const };
        const sectionMatch = pathname.match(/^\/training\/openings\/([^/]+)\/([^/]+)\/?$/);
        if (sectionMatch) {
            return {
                view: "section" as const,
                repertoireId: decodeURIComponent(sectionMatch[1]),
                variantId: decodeURIComponent(sectionMatch[2]),
            };
        }
        const repertoireMatch = pathname.match(/^\/training\/openings\/([^/]+)\/?$/);
        if (repertoireMatch) {
            return {
                view: "repertoire" as const,
                repertoireId: decodeURIComponent(repertoireMatch[1]),
            };
        }
        return { view: "library" as const };
    })();

    /** Lines a session starts with: pending lines to learn, or already learned lines to practice. */
    function sessionLines(variantIds: string[], mode: SessionMode): OpeningLine[] {
        if (mode === "review") return getDueOpeningLines(areas.openings, variantIds);
        const lines = trainableOpeningLines(areas.openings, variantIds);
        return mode === "learn"
            ? getOpeningLearningSummary(lines).pending.slice(
                  0,
                  openingLearnBatchSize(areas.openings),
              )
            : lines.filter(isOpeningLineLearned);
    }

    function reportEmptySession(mode: SessionMode) {
        setError(
            mode === "review"
                ? t("OpeningReview.NothingDue", "There are no reviews due here right now.")
                : mode === "learn"
                  ? t(
                        "OpeningLearn.NothingToLearn",
                        "Every trainable line here is already learned.",
                    )
                  : t(
                        "OpeningLearn.LearnFirst",
                        "There are no learned lines here yet. Use “Learn” first; you can still train any single line from its section.",
                    ),
        );
    }

    async function openVariant(
        repertoire: OpeningRepertoire,
        variant: OpeningVariant,
        mode: "analysis" | SessionMode | "build",
        selectedLineIds?: string[],
    ): Promise<boolean> {
        let lineIds: string[] = [];
        if (mode === "practice" || mode === "learn" || mode === "review") {
            lineIds = (
                selectedLineIds ?? sessionLines([variant.id], mode).map((line) => line.id)
            ).filter((lineId) => areas.openings.lines[lineId]?.trainable);
            if (lineIds.length === 0) {
                reportEmptySession(mode);
                return false;
            }
        }
        setBusy(true);
        setError(null);
        try {
            await navigate({ to: "/" });
            await openFile(
                {
                    type: "file",
                    name: `${repertoire.name} · ${variant.name}`,
                    path: repertoire.path,
                    numGames: repertoire.variantIds.length,
                    metadata: { type: "repertoire", tags: [] },
                    lastModified: Date.now(),
                },
                setTabs,
                setActiveTab,
                { gameNumber: variant.trainingRecordIndex },
            );

            if (mode !== "analysis") setPracticeUnit("line");
            if (mode === "analysis") setSelectedPanel("info");
            if (mode === "build") setPracticeTab("build");
            if (mode === "practice" || mode === "learn" || mode === "review") {
                setPracticeTab("train");
                setOpeningPracticeQueue({
                    mode: mode === "learn" ? "learn" : "practice",
                    gameNumbers: lineIds.map(() => variant.trainingRecordIndex),
                    currentIndex: 0,
                    repertoireId: repertoire.id,
                    variantIds: lineIds.map(() => variant.id),
                    lineIds,
                    returnTarget: openingReturnTarget,
                });
            }
            return true;
        } catch (cause) {
            setError(
                cause instanceof Error
                    ? cause.message
                    : t(
                          "Training.Copy.Couldnotopentherepertoire.e1bcc7b9",
                          "Could not open the repertoire file.",
                      ),
            );
            return false;
        } finally {
            setBusy(false);
        }
    }

    async function startRepertoireSession(repertoire: OpeningRepertoire, mode: SessionMode) {
        const entries = sessionLines(repertoire.variantIds, mode).flatMap((line) => {
            const variant = areas.openings.variants[line.variantId];
            return variant ? [{ variant, lineId: line.id }] : [];
        });
        if (entries.length === 0) {
            reportEmptySession(mode);
            return;
        }

        const first = entries[0];
        const opened = await openVariant(repertoire, first.variant, mode, [first.lineId]);
        if (!opened) return;
        setOpeningPracticeQueue({
            mode: mode === "learn" ? "learn" : "practice",
            gameNumbers: entries.map(({ variant }) => variant.trainingRecordIndex),
            currentIndex: 0,
            repertoireId: repertoire.id,
            variantIds: entries.map(({ variant }) => variant.id),
            lineIds: entries.map(({ lineId }) => lineId),
            returnTarget: openingReturnTarget,
        });
    }

    return {
        busy,
        error,
        clearError: () => setError(null),
        practiceLine: (repertoire: OpeningRepertoire, variant: OpeningVariant, lineId: string) =>
            openVariant(repertoire, variant, "practice", [lineId]),
        practiceRepertoire: (repertoire: OpeningRepertoire) =>
            startRepertoireSession(repertoire, "practice"),
        practiceVariant: (repertoire: OpeningRepertoire, variant: OpeningVariant) =>
            openVariant(repertoire, variant, "practice"),
        learnLine: (repertoire: OpeningRepertoire, variant: OpeningVariant, lineId: string) =>
            openVariant(repertoire, variant, "learn", [lineId]),
        learnRepertoire: (repertoire: OpeningRepertoire) =>
            startRepertoireSession(repertoire, "learn"),
        learnVariant: (repertoire: OpeningRepertoire, variant: OpeningVariant) =>
            openVariant(repertoire, variant, "learn"),
        reviewRepertoire: (repertoire: OpeningRepertoire) =>
            startRepertoireSession(repertoire, "review"),
        reviewVariant: (repertoire: OpeningRepertoire, variant: OpeningVariant) =>
            openVariant(repertoire, variant, "review"),
        analyzeVariant: (repertoire: OpeningRepertoire, variant: OpeningVariant) =>
            openVariant(repertoire, variant, "analysis"),
        buildVariant: (repertoire: OpeningRepertoire, variant: OpeningVariant) =>
            openVariant(repertoire, variant, "build"),
    };
}
