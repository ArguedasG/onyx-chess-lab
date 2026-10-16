import { notifications } from "@mantine/notifications";
import { useNavigate } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import { activeTabAtom, tabsAtom } from "@/state/atoms";
import { createTab } from "@/utils/tabs";
import { unwrap } from "@/utils/unwrap";

export type PlayerGameReturn = {
    path: "/players" | "/databases";
    profileId: string;
    playerName: string;
};

/**
 * Opens a game of a player card in its own analysis tab, at a ply when given. The tab remembers
 * the card, so its back arrow (or closing it) returns to the same card and view.
 */
export function useOpenPlayerGame(returnTo: PlayerGameReturn) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const setTabs = useSetAtom(tabsAtom);
    const setActiveTab = useSetAtom(activeTabAtom);
    const { path, profileId, playerName } = returnTo;

    return useCallback(
        async (databasePath: string, gameId: number, ply: number | null = null) => {
            try {
                const response = unwrap(
                    await commands.getGames(databasePath, {
                        game_id: gameId,
                        options: {
                            page: 1,
                            pageSize: 1,
                            skipCount: true,
                            sort: "id",
                            direction: "asc",
                        },
                    }),
                );
                const game = response.data[0];
                if (!game) throw new Error("Game not found");
                await createTab({
                    tab: {
                        name: `${game.white} - ${game.black}`,
                        type: "analysis",
                        returnPath: path,
                        returnPlayerAnalysis: { profileId, playerName },
                    },
                    setTabs,
                    setActiveTab,
                    pgn: game.moves,
                    headers: game,
                    position: Array(ply ?? 0).fill(0),
                    gameOrigin: { kind: "database", database: databasePath, gameId },
                    preserveNewTab: true,
                });
                navigate({ to: "/" });
            } catch (error) {
                notifications.show({
                    color: "red",
                    title: t("PlayerAnalysis.GameError", "Could not open the evidence game"),
                    message: error instanceof Error ? error.message : String(error),
                });
            }
        },
        [navigate, path, playerName, profileId, setActiveTab, setTabs, t],
    );
}
