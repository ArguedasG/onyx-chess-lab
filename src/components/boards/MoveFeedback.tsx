import { Portal } from "@mantine/core";
import { IconCheck, IconX } from "@tabler/icons-react";
import classes from "./MoveFeedback.module.css";

export type MoveFeedbackState = {
  /** Destination square, e.g. "d4". */
  square: string;
  correct: boolean;
  /** Keeps the badge instead of fading it (the puzzle's final verdict). */
  persistent?: boolean;
  /** Changes on every move so the animation restarts. */
  key: number;
};

/** Destination square of a UCI move; castling written king-to-rook lands on the king's square. */
export function feedbackSquare(uci: string) {
  const castling: Record<string, string> = { e1h1: "g1", e1a1: "c1", e8h8: "g8", e8a8: "c8" };
  return castling[uci] ?? uci.slice(2, 4);
}

/**
 * A check or cross that pops onto the top-right corner of the move's destination square.
 * It is drawn inside the board element, so it follows the board's size and orientation.
 */
export default function MoveFeedback({
  board,
  feedback,
  orientation,
}: {
  board: HTMLElement | null;
  feedback: MoveFeedbackState | null;
  orientation: "white" | "black";
}) {
  if (!board || !feedback) return null;
  const file = feedback.square.charCodeAt(0) - 97;
  const rank = Number(feedback.square[1]) - 1;
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  const column = orientation === "white" ? file : 7 - file;
  const row = orientation === "white" ? 7 - rank : rank;
  const size = "calc(100% / 8 * 0.42)";

  return (
    <Portal target={board}>
      <div
        key={feedback.key}
        className={`${classes.badge} ${feedback.correct ? classes.correct : classes.incorrect} ${
          feedback.persistent ? classes.persistent : ""
        }`}
        style={{
          left: `calc(${(column + 0.86) * 12.5}%)`,
          top: `calc(${(row + 0.14) * 12.5}%)`,
          width: size,
          height: size,
        }}
        role="img"
        aria-label={feedback.correct ? "✓" : "✗"}
      >
        {feedback.correct ? <IconCheck size="65%" stroke={3} /> : <IconX size="65%" stroke={3} />}
      </div>
    </Portal>
  );
}
