import { useEffect, useRef } from "react";

export function useInitialOpponentMove(
    startingActor: "student" | "opponent",
    playOpponent: () => void | Promise<void>,
): void {
    const requested = useRef(false);

    useEffect(() => {
        if (startingActor !== "opponent" || requested.current) return;
        requested.current = true;
        void playOpponent();
    }, [playOpponent, startingActor]);
}
