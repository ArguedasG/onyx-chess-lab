import { Button, Group, Loader, Paper, SimpleGrid, Stack, Text } from "@mantine/core";
import { IconCheck, IconX } from "@tabler/icons-react";
import { parseUci } from "chessops";
import { makeSan } from "chessops/san";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import { findObjectiveEngine } from "@/components/boards/EndgameObjectiveWatch";
import { enginesAtom } from "@/state/atoms";
import { positionFromFen } from "@/utils/chessops";
import { getBestMovesOnce, type LocalEngine } from "@/utils/engines";
import { clampMaiaElo, isMaiaEngine } from "@/utils/humanBots";
import type { Puzzle } from "@/utils/puzzles";
import { MaiaSampler } from "@/utils/repertoireGenerator/engines";
import { canonicalUci, playUci } from "@/utils/repertoireGenerator/positions";

const SAMPLER_ID = "puzzle-candidates";
const DECOYS = 3;

type Option = { uci: string; san: string; correct: boolean };

/**
 * Wrong moves a person would consider (I-05): Maia at the puzzle's rating when it is installed,
 * which plays like players of that level, otherwise Stockfish's next best moves. A decoy is never
 * the solution and never mates.
 */
async function decoysFor(
  fen: string,
  solution: string,
  rating: number,
  maia: LocalEngine | null,
  stockfish: LocalEngine | null,
): Promise<string[]> {
  let ranked: string[] = [];
  if (maia) {
    const [frequencies] = await new MaiaSampler(
      maia,
      clampMaiaElo(rating),
      SAMPLER_ID,
      12,
    ).frequencies([fen]);
    ranked = [...(frequencies ?? [])].sort((a, b) => b.count - a.count).map((move) => move.uci);
  }
  if (ranked.length < DECOYS + 1 && stockfish) {
    const lines = await getBestMovesOnce(
      stockfish,
      { t: "Depth", c: 10 },
      {
        fen,
        moves: [],
        extraOptions: [
          { name: "MultiPV", value: "6" },
          { name: "Threads", value: "1" },
        ],
      },
    );
    ranked = [...ranked, ...lines.flatMap((line) => (line.uciMoves[0] ? [line.uciMoves[0]] : []))];
  }
  const [position] = positionFromFen(fen);
  if (position) {
    // Captures and checks first: the moves that tempt in a tactical position.
    const legal: string[] = [];
    for (const [from, targets] of position.allDests()) {
      for (const to of targets) {
        const uci = canonicalUci(fen, `${squareName(from)}${squareName(to)}`);
        if (uci) legal.push(uci);
      }
    }
    const tempting = legal.sort((a, b) => temptation(fen, b) - temptation(fen, a));
    ranked = [...ranked, ...tempting];
  }
  const target = canonicalUci(fen, solution) ?? solution;
  const decoys: string[] = [];
  for (const uci of ranked) {
    const canonical = canonicalUci(fen, uci);
    if (!canonical || canonical === target || decoys.includes(canonical)) continue;
    const after = playUci(fen, canonical);
    if (!after || positionFromFen(after.fen)[0]?.isCheckmate()) continue;
    decoys.push(canonical);
    if (decoys.length === DECOYS) break;
  }
  return decoys;
}

function squareName(square: number) {
  return `${"abcdefgh"[square % 8]}${Math.floor(square / 8) + 1}`;
}

function temptation(fen: string, uci: string) {
  const after = playUci(fen, uci);
  if (!after) return 0;
  return (
    (after.san.includes("x") ? 2 : 0) + (after.san.includes("+") ? 1 : 0) + Math.random() * 0.5
  );
}

function sanOf(fen: string, uci: string) {
  const [position] = positionFromFen(fen);
  const move = parseUci(uci);
  return position && move && position.isLegal(move) ? makeSan(position, move) : uci;
}

export default function PuzzleCandidates({
  puzzle,
  onCorrect,
  onWrong,
}: {
  puzzle: Puzzle;
  onCorrect: () => void;
  onWrong: () => void;
}) {
  const { t } = useTranslation();
  const engines = useAtomValue(enginesAtom);
  const maia = useMemo(
    () =>
      (engines ?? []).find(
        (engine): engine is LocalEngine =>
          engine.type === "local" && Boolean(engine.loaded) && isMaiaEngine(engine as LocalEngine),
      ) ?? null,
    [engines],
  );
  const stockfish = useMemo(() => findObjectiveEngine(engines), [engines]);
  const fen = useMemo(() => playUci(puzzle.fen, puzzle.moves[0])?.fen ?? null, [puzzle]);
  const [options, setOptions] = useState<Option[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => () => void commands.closeEngineSampler(SAMPLER_ID), []);

  useEffect(() => {
    if (!fen) return;
    let cancelled = false;
    setOptions(null);
    setChosen(null);
    setFailed(false);
    const solution = canonicalUci(fen, puzzle.moves[1]) ?? puzzle.moves[1];
    decoysFor(fen, solution, puzzle.rating, maia, stockfish)
      .then((decoys) => {
        if (cancelled) return;
        const all = [
          { uci: solution, san: sanOf(fen, solution), correct: true },
          ...decoys.map((uci) => ({ uci, san: sanOf(fen, uci), correct: false })),
        ];
        setOptions(all.sort(() => Math.random() - 0.5));
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [fen, maia, puzzle.moves, puzzle.rating, stockfish]);

  if (!fen || failed) return null;

  return (
    <Paper withBorder p="sm">
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          {t("Puzzle.Candidates.Question", "Which move?")}
        </Text>
        {!options ? (
          <Group gap="xs">
            <Loader size="xs" />
            <Text size="xs" c="dimmed">
              {t("Puzzle.Candidates.Preparing", "Preparing the candidates…")}
            </Text>
          </Group>
        ) : (
          <SimpleGrid cols={2} spacing="xs">
            {options.map((option) => {
              const revealed = chosen !== null;
              const color = !revealed
                ? "gray"
                : option.correct
                  ? "teal"
                  : option.uci === chosen
                    ? "red"
                    : "gray";
              return (
                <Button
                  key={option.uci}
                  variant={
                    revealed && (option.correct || option.uci === chosen) ? "light" : "default"
                  }
                  color={color}
                  leftSection={
                    revealed && option.correct ? (
                      <IconCheck size={14} />
                    ) : revealed && option.uci === chosen ? (
                      <IconX size={14} />
                    ) : undefined
                  }
                  disabled={revealed && !option.correct && option.uci !== chosen}
                  onClick={() => {
                    if (chosen) return;
                    setChosen(option.uci);
                    if (option.correct) onCorrect();
                    else onWrong();
                  }}
                >
                  {option.san}
                </Button>
              );
            })}
          </SimpleGrid>
        )}
      </Stack>
    </Paper>
  );
}
