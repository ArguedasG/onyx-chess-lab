import { useNavigate } from "@tanstack/react-router";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
    activeTabAtom,
    importModalOpenAtom,
    lastBoardTabAtom,
    reuseEmptyAnalysisTabAtom,
    tabsAtom,
} from "@/state/atoms";
import {
    boardTabToShow,
    createOrReuseBoardTab,
    createTab,
    startTab,
    unusedTabLike,
} from "@/utils/tabs";

export function useBoardShellActions() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [tabs, setTabs] = useAtom(tabsAtom);
    const [activeTab, setActiveTab] = useAtom(activeTabAtom);
    const reuseEmpty = useAtomValue(reuseEmptyAnalysisTabAtom);
    const setImportModalOpen = useSetAtom(importModalOpenAtom);
    const lastBoardTab = useAtomValue(lastBoardTabAtom);

    const openMode = useCallback(
        async (type: "analysis" | "play" | "generator", name: string, allowReuse: boolean) => {
            await navigate({ to: "/" });
            return createOrReuseBoardTab({
                tabs,
                activeTab,
                type,
                name,
                reuseEmpty: allowReuse,
                setTabs,
                setActiveTab,
            });
        },
        [activeTab, navigate, setActiveTab, setTabs, tabs],
    );

    /**
     * The board used last, from anywhere (the home screen, a section page). The tab is chosen
     * before going to "/", so the workspace does not fall back to another one on the way.
     */
    const openBoard = useCallback(async () => {
        const board = boardTabToShow(tabs, lastBoardTab);
        if (board) {
            setActiveTab(board.value);
            await navigate({ to: "/" });
            return;
        }
        await navigate({ to: "/" });
        await createTab({
            tab: { name: "Home.Card.AnalysisBoard.Title", type: "analysis" },
            setTabs,
            setActiveTab,
        });
    }, [lastBoardTab, navigate, setActiveTab, setTabs, tabs]);

    /** A game still in its setup is shown again rather than opening a second one. */
    const startGame = useCallback(async () => {
        const waiting = unusedTabLike(tabs, null, "play");
        if (waiting) {
            setActiveTab(waiting.value);
            await navigate({ to: "/" });
            return;
        }
        await openMode("play", t("Home.NewGame", "New Game"), reuseEmpty);
    }, [navigate, openMode, reuseEmpty, setActiveTab, t, tabs]);

    const importGame = useCallback(async () => {
        await openMode("analysis", t("Home.Card.AnalysisBoard.Title"), reuseEmpty);
        setImportModalOpen(true);
    }, [openMode, reuseEmpty, setImportModalOpen, t]);

    const openLaboratory = useCallback(
        () => openMode("generator", t("ModelGame.Title", "Model Game Generator"), true),
        [openMode, t],
    );

    const openTraining = useCallback(() => navigate({ to: "/training" }), [navigate]);

    /** The home screen: the open one if there is one, otherwise a new home tab. */
    const openHome = useCallback(async () => {
        await navigate({ to: "/" });
        const home = tabs.find((tab) => tab.type === "new");
        if (home) setActiveTab(home.value);
        else await createTab({ tab: startTab("home"), setTabs, setActiveTab });
    }, [navigate, setActiveTab, setTabs, tabs]);

    return { openHome, openBoard, startGame, importGame, openLaboratory, openTraining };
}
