import { notifications } from "@mantine/notifications";
import { useNavigate } from "@tanstack/react-router";
import { INITIAL_FEN } from "chessops/fen";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { LocalEngine } from "@/utils/engines";
import {
    enginesAtom,
    gameInputColorAtom,
    gamePlayer1SettingsAtom,
    gamePlayer2SettingsAtom,
    gameSameTimeControlAtom,
    sessionsAtom,
    tabsAtom,
    activeTabAtom,
} from "@/state/atoms";
import { DEFAULT_HUMAN_BOT_PROFILE_ID, isMaiaEngine } from "@/utils/humanBots";
import { twinIdOfParticipant } from "@/utils/preparation/savedTwins";
import { accountPlayerNames } from "@/utils/players/accountSources";
import { createTab } from "@/utils/tabs";
import { defaultTree } from "@/utils/treeReducer";
import {
    type Tournament,
    type TournamentGame,
    USER_PARTICIPANT_ID,
} from "@/utils/tournaments/types";

/** Headers that tie a game on the board to its tournament. */
export const TOURNAMENT_HEADERS = {
    id: "ChessLabTournamentId",
    game: "ChessLabTournamentGameId",
    rated: "ChessLabTournamentRated",
    autoStart: "ChessLabTournamentAutoStart",
} as const;

/** The user's name in tournaments: the name of their player card, as in the bot databases. */
export function useTournamentUserName(): string {
    const { t } = useTranslation();
    const sessions = useAtomValue(sessionsAtom);
    return accountPlayerNames(sessions)[0] ?? t("Tournaments.You", "You");
}

/**
 * Opens a board tab with the user's tournament game already set up and started: the opponent,
 * the clock and the colors come from the pairing, so nothing can be changed by mistake.
 */
export function useTournamentGameLauncher() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const engines = useAtomValue(enginesAtom);
    const setPlayer1 = useSetAtom(gamePlayer1SettingsAtom);
    const setPlayer2 = useSetAtom(gamePlayer2SettingsAtom);
    const setInputColor = useSetAtom(gameInputColorAtom);
    const setSameTimeControl = useSetAtom(gameSameTimeControlAtom);
    const setTabs = useSetAtom(tabsAtom);
    const setActiveTab = useSetAtom(activeTabAtom);
    const userName = useTournamentUserName();

    return useCallback(
        async (tournament: Tournament, game: TournamentGame) => {
            const maia = (engines ?? []).find(
                (engine): engine is LocalEngine =>
                    engine.type === "local" && Boolean(engine.path) && isMaiaEngine(engine),
            );
            if (!maia) {
                notifications.show({
                    color: "yellow",
                    title: t("Tournaments.NoMaia", "Maia 3 is needed to play"),
                    message: t(
                        "HumanBots.NoMaiaEngine",
                        "No Maia 3 engine was found. Add it from the Engines section first.",
                    ),
                });
                return;
            }
            const userWhite = game.white === USER_PARTICIPANT_ID;
            const opponentId = userWhite ? game.black : game.white;
            if (!opponentId) return;
            const clock = {
                seconds: tournament.clock.seconds,
                increment: tournament.clock.increment,
            };
            setPlayer1({ type: "human", name: userName, timeControl: clock });
            // A twin plays the profile of the tournament's rhythm; the board finds it by id.
            const twinId = twinIdOfParticipant(opponentId);
            const opponent = tournament.participants.find((entry) => entry.id === opponentId);
            setPlayer2({
                type: "humanBot",
                engine: maia,
                profileId: twinId ? DEFAULT_HUMAN_BOT_PROFILE_ID : opponentId,
                humanTiming: true,
                timeControl: clock,
                twin: twinId
                    ? {
                          id: twinId,
                          name: opponent?.name ?? twinId,
                          elo: opponent?.rating ?? 1500,
                          profile: "auto",
                      }
                    : undefined,
            });
            setInputColor(userWhite ? "white" : "black");
            setSameTimeControl(true);

            const base = defaultTree(INITIAL_FEN).headers;
            await navigate({ to: "/" });
            await createTab({
                tab: { name: tournament.name, type: "play" },
                setTabs,
                setActiveTab,
                pgn: "",
                headers: {
                    ...base,
                    event: tournament.name,
                    round: String(game.round),
                    other: {
                        ...base.other,
                        [TOURNAMENT_HEADERS.id]: tournament.id,
                        [TOURNAMENT_HEADERS.game]: game.id,
                        [TOURNAMENT_HEADERS.rated]: tournament.rated ? "1" : "0",
                        [TOURNAMENT_HEADERS.autoStart]: "1",
                    },
                },
            });
        },
        [
            engines,
            navigate,
            setActiveTab,
            setInputColor,
            setPlayer1,
            setPlayer2,
            setSameTimeControl,
            setTabs,
            t,
            userName,
        ],
    );
}
