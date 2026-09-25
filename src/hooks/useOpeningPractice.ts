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
import type { OpeningRepertoire, OpeningVariant } from "@/utils/trainingAreas";

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

    async function openVariant(
        repertoire: OpeningRepertoire,
        variant: OpeningVariant,
        mode: "analysis" | "practice" | "build",
        selectedLineIds?: string[],
    ): Promise<boolean> {
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
            if (mode === "practice") {
                const lineIds = (selectedLineIds ?? variant.lineIds).filter(
                    (lineId) => areas.openings.lines[lineId]?.trainable,
                );
                setPracticeTab("train");
                setOpeningPracticeQueue({
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

    async function practiceRepertoire(repertoire: OpeningRepertoire) {
        const entries = repertoire.variantIds.flatMap((variantId) => {
            const variant = areas.openings.variants[variantId];
            if (!variant || variant.contentType !== "theory") return [];
            return variant.lineIds
                .filter((lineId) => areas.openings.lines[lineId]?.trainable)
                .map((lineId) => ({ variant, lineId }));
        });
        if (entries.length === 0) {
            setError(
                t(
                    "Training.Copy.Thisrepertoirehasnotrainable.717541d6",
                    "This repertoire has no trainable lines.",
                ),
            );
            return;
        }

        const first = entries[0];
        const opened = await openVariant(repertoire, first.variant, "practice", [first.lineId]);
        if (!opened) return;
        setOpeningPracticeQueue({
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
        practiceRepertoire,
        practiceVariant: (repertoire: OpeningRepertoire, variant: OpeningVariant) =>
            openVariant(repertoire, variant, "practice"),
        analyzeVariant: (repertoire: OpeningRepertoire, variant: OpeningVariant) =>
            openVariant(repertoire, variant, "analysis"),
        buildVariant: (repertoire: OpeningRepertoire, variant: OpeningVariant) =>
            openVariant(repertoire, variant, "build"),
    };
}
