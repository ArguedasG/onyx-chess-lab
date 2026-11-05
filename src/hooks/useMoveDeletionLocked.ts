import { useAtomValue } from "jotai";
import { currentGameStateAtom, currentTabAtom } from "@/state/atoms";

/**
 * While a game is being played the moves belong to the game controller: deleting one only from
 * the notation would leave the board and the game out of step (En Croissant #874). Taking back a
 * move goes through the game's own button instead.
 */
export function useMoveDeletionLocked(): boolean {
    const tab = useAtomValue(currentTabAtom);
    const gameState = useAtomValue(currentGameStateAtom);
    return tab?.type === "play" && gameState === "playing";
}
