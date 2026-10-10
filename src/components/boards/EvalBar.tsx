import type { Color } from "@lichess-org/chessground/types";
import { Box, Tooltip, useMantineTheme } from "@mantine/core";
import { useAtom } from "jotai";
import type { Score } from "@/bindings";
import { currentEvalBarDisplayAtom, currentEvalOpenAtom } from "@/state/atoms";
import { formatScore, getWinChance } from "@/utils/score";

export const EVAL_BAR_WIDTH = 12;

function EvalBar({ score, orientation }: { score: Score | null; orientation: Color }) {
  const theme = useMantineTheme();
  const [evalDisplay, setEvalDisplay] = useAtom(currentEvalBarDisplayAtom);
  const [, setEvalOpen] = useAtom(currentEvalOpenAtom);

  const handleClick = () => {
    if (setEvalDisplay) {
      setEvalDisplay(evalDisplay === "cp" ? "wdl" : "cp");
    }
  };

  let ScoreBars = null;
  if (score) {
    const scoreValue = score.value;
    const wdl = score.wdl;

    if (evalDisplay === "wdl" && wdl) {
      const [w, d, l] = wdl;
      const whiteWin = w / 10;
      const draw = d / 10;
      const blackWin = l / 10;

      const sections = [
        {
          key: "black",
          height: blackWin,
          bg: theme.colors.dark[4],
        },
        {
          key: "draw",
          height: draw,
          bg: theme.colors.gray[5],
        },
        {
          key: "white",
          height: whiteWin,
          bg: theme.colors.gray[2],
        },
      ];

      if (orientation === "black") {
        sections.reverse();
      }

      ScoreBars = sections.map((section) => (
        <Box
          key={section.key}
          style={{
            height: `${section.height}%`,
            backgroundColor: section.bg,
            transition: "height 0.2s ease",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        ></Box>
      ));
    } else {
      const progress =
        scoreValue.type === "cp" ? getWinChance(scoreValue.value) : scoreValue.value > 0 ? 100 : 0;

      ScoreBars = [
        <Box
          key="black"
          style={{
            height: `${100 - progress}%`,
            backgroundColor: theme.colors.dark[4],
            transition: "height 0.2s ease",
            display: "flex",
            flexDirection: "column",
          }}
        ></Box>,
        <Box
          key="white"
          style={{
            height: `${progress}%`,
            backgroundColor: theme.colors.gray[2],
            transition: "height 0.2s ease",
            display: "flex",
            flexDirection: "column",
          }}
        ></Box>,
      ];

      if (orientation === "black") {
        ScoreBars = ScoreBars.reverse();
      }
    }
  }

  return (
    <Tooltip
      position="right"
      color={score && score.value.value < 0 ? "dark" : undefined}
      label={score ? formatScore(score.value) : undefined}
      disabled={!score}
    >
      <Box
        onClick={handleClick}
        onContextMenu={(e) => {
          setEvalOpen(false);
          e.preventDefault();
        }}
        style={{
          // Thin and rounded; the exact score is in the tooltip and the engine strip.
          width: EVAL_BAR_WIDTH,
          height: "100%",
          borderRadius: EVAL_BAR_WIDTH / 2,
          overflow: "hidden",
        }}
      >
        {ScoreBars}
      </Box>
    </Tooltip>
  );
}

export default EvalBar;
