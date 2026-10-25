import { Alert, Badge, Box, Button, Group, Progress, Stack, Text, ThemeIcon } from "@mantine/core";
import { Modal } from "@/components/common/Modal";
import {
  IconArrowRight,
  IconBulb,
  IconCheck,
  IconChessKnight,
  IconTrophy,
  IconX,
} from "@tabler/icons-react";
import { type Color, makeUci, type NormalMove, parseSquare, parseUci } from "chessops";
import { chessgroundDests } from "chessops/compat";
import { makeFen } from "chessops/fen";
import { makeSan } from "chessops/san";
import { useAtomValue } from "jotai";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Chessground } from "@/chessground/Chessground";
import { enginesAtom } from "@/state/atoms";
import { positionFromFen } from "@/utils/chessops";
import type { MistakeItem, MistakeResult } from "@/utils/mistakes/queue";
import { type EngineLine, explainMistake, mistakeShapes } from "@/utils/moveExplanation";
import {
  findRetroBest,
  findRetroRefutation,
  judgeRetroMove,
  pickReferenceEngine,
  type RetroBest,
  type RetroItem,
} from "@/utils/retro";
import MistakeExplanation from "../../panels/analysis/MistakeExplanation";
import { categoryName } from "./labels";

type Phase = "find" | "evaluating" | "wrong" | "correct" | "solution";

function sanOf(fen: string, uci: string) {
  const [position] = positionFromFen(fen);
  const move = parseUci(uci);
  if (!position || !move || !position.isLegal(move)) return uci;
  return makeSan(position, move);
}

/**
 * A review session of "My mistakes" (I-17): in each position of a past game, find a better move
 * than the one played. The engine judges it with the same tolerance as "Learn from your mistakes";
 * the result schedules the next review.
 */
export default function MistakeSession({
  items,
  onResult,
  onOpenGame,
  onClose,
}: {
  items: MistakeItem[];
  onResult: (item: MistakeItem, result: MistakeResult) => void;
  onOpenGame: (item: MistakeItem) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const engines = useAtomValue(enginesAtom);
  const engine = useMemo(() => pickReferenceEngine(engines ?? []), [engines]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("find");
  const [wrongTries, setWrongTries] = useState(0);
  const [attempt, setAttempt] = useState<{ uci: string; san: string } | null>(null);
  const [best, setBest] = useState<RetroBest | null>(null);
  const [refutation, setRefutation] = useState<EngineLine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<MistakeResult[]>([]);
  const item = items[index];
  const done = index >= items.length;

  const retroItem: RetroItem | null = item
    ? {
        path: [],
        fen: item.fen,
        uci: item.playedMove,
        san: sanOf(item.fen, item.playedMove),
        annotation: item.classification === "blunder" ? "??" : "?",
        best: best ?? undefined,
      }
    : null;
  const color: Color = item?.playerColor ?? "white";
  const [position] = useMemo(() => positionFromFen(item?.fen ?? ""), [item?.fen]);
  const dests = position && phase !== "evaluating" ? chessgroundDests(position) : new Map();
  const revealed = phase === "correct" || phase === "solution";
  const facts =
    item && revealed && retroItem
      ? {
          fen: item.fen,
          played: { uci: item.playedMove, san: retroItem.san },
          color,
          best: best ? { uci: [best.uci], san: [best.san], score: best.score } : undefined,
          refutation: refutation ?? undefined,
        }
      : null;

  async function reveal(current: RetroItem) {
    if (!engine) return;
    try {
      setRefutation((await findRetroRefutation(engine, current)) ?? null);
    } catch {
      // The explanation is optional; the answer is already known.
    }
  }

  async function play(orig: string, dest: string) {
    if (!item || !retroItem || !position || !engine) return;
    const from = parseSquare(orig);
    const to = parseSquare(dest);
    if (from === undefined || to === undefined) return;
    const move: NormalMove = { from, to };
    // Promotions become a queen, as most of them are.
    if (position.board.get(from)?.role === "pawn" && (to >> 3 === 7 || to >> 3 === 0))
      move.promotion = "queen";
    const uci = makeUci(move);
    const san = sanOf(item.fen, uci);
    setAttempt({ uci, san });
    setPhase("evaluating");
    setError(null);
    try {
      const verdict = await judgeRetroMove(engine, { fen: item.fen, item: retroItem, color, uci });
      setBest(verdict.best);
      if (verdict.correct) {
        setPhase("correct");
        void reveal({ ...retroItem, best: verdict.best });
      } else {
        setWrongTries((value) => value + 1);
        setPhase("wrong");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setPhase("find");
    }
  }

  async function showSolution() {
    if (!item || !retroItem || !engine) return;
    setPhase("evaluating");
    try {
      const verdict = best ?? (await findRetroBest(engine, item.fen));
      setBest(verdict);
      setAttempt(null);
      setPhase("solution");
      void reveal({ ...retroItem, best: verdict });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setPhase("find");
    }
  }

  function next() {
    if (!item) return;
    const result: MistakeResult =
      phase === "solution" ? "failed" : wrongTries > 0 ? "hard" : "solved";
    onResult(item, result);
    setResults((previous) => [...previous, result]);
    setIndex((value) => value + 1);
    setPhase("find");
    setWrongTries(0);
    setAttempt(null);
    setBest(null);
    setRefutation(null);
    setError(null);
  }

  const shownFen = useMemo(() => {
    // After a correct move the board shows it; a wrong one is taken back so the student retries.
    if (!item || !attempt || phase !== "correct") return item?.fen ?? "";
    const [after] = positionFromFen(item.fen);
    const move = parseUci(attempt.uci);
    if (!after || !move || !after.isLegal(move)) return item.fen;
    after.play(move);
    return makeFen(after.toSetup());
  }, [attempt, item, phase]);

  const solvedCount = results.filter((result) => result !== "failed").length;

  return (
    <Modal
      opened
      onClose={onClose}
      size="xl"
      centered
      title={
        <Group gap="xs">
          <Text fw={700}>{t("Mistakes.Session.Title", "Review my mistakes")}</Text>
          {!done && (
            <Badge variant="light">
              {t("Mistakes.Session.Count", "{{current}} of {{total}}", {
                current: index + 1,
                total: items.length,
              })}
            </Badge>
          )}
        </Group>
      }
    >
      {!engine ? (
        <Alert color="yellow">
          {t("Generator.NoEngine", "Install a reference engine such as Stockfish in Engines.")}
        </Alert>
      ) : done ? (
        <Stack align="center" gap="sm" py="lg">
          <ThemeIcon size={56} radius="xl" variant="light" color="teal">
            <IconTrophy size={30} />
          </ThemeIcon>
          <Text fw={700} size="lg">
            {t("Mistakes.Session.Done", "Session finished")}
          </Text>
          <Text c="dimmed">
            {t(
              "Mistakes.Session.DoneSummary",
              "{{solved}} of {{total}} found. They come back when they are due.",
              {
                solved: solvedCount,
                total: results.length,
              },
            )}
          </Text>
          <Button onClick={onClose}>{t("Common.Close", "Close")}</Button>
        </Stack>
      ) : (
        item && (
          <Stack gap="sm">
            <Progress value={(index / items.length) * 100} size="sm" />
            <Group gap={6}>
              <Badge variant="light" color={item.classification === "blunder" ? "red" : "orange"}>
                {item.classification === "blunder"
                  ? t("Mistakes.Blunder", "Blunder")
                  : item.classification === "mistake"
                    ? t("Mistakes.Mistake", "Mistake")
                    : t("Mistakes.Inaccuracy", "Inaccuracy")}
              </Badge>
              <Badge variant="outline" color="gray">
                {categoryName(item.category, t)}
              </Badge>
              <Text size="xs" c="dimmed" lineClamp={1}>
                {item.sources[0]?.gameLabel}
                {item.sources.length > 1 &&
                  ` · ${t("Mistakes.Session.Repeated", "in {{count}} games", { count: item.sources.length })}`}
              </Text>
            </Group>
            <Box
              style={{
                aspectRatio: "1 / 1",
                width: "100%",
                maxWidth: "min(620px, 62vh)",
                margin: "0 auto",
              }}
            >
              <Chessground
                fen={shownFen}
                orientation={color}
                turnColor={phase === "correct" ? (color === "white" ? "black" : "white") : color}
                movable={{
                  free: false,
                  color: phase === "find" || phase === "wrong" ? color : undefined,
                  dests: phase === "find" || phase === "wrong" ? dests : new Map(),
                  events: { after: (orig, dest) => void play(orig, dest) },
                }}
                drawable={{
                  enabled: true,
                  visible: true,
                  autoShapes: facts ? mistakeShapes(facts) : [],
                }}
              />
            </Box>
            {phase === "find" && (
              <Text size="sm" ta="center">
                {t(
                  "Mistakes.Session.Prompt",
                  "In the game you played {{move}}. Find a better move.",
                  { move: retroItem?.san },
                )}
              </Text>
            )}
            {phase === "evaluating" && (
              <Text size="sm" ta="center" c="dimmed">
                {t("Mistakes.Session.Evaluating", "The engine is checking…")}
              </Text>
            )}
            {phase === "wrong" && (
              <Group justify="center" gap="xs">
                <IconX size={16} color="var(--mantine-color-red-6)" />
                <Text size="sm">
                  {attempt?.uci === item.playedMove
                    ? t("Mistakes.Session.Same", "That is the move of the game. Try another one.")
                    : t("Mistakes.Session.Wrong", "{{move}} is not better. Try again.", {
                        move: attempt?.san,
                      })}
                </Text>
              </Group>
            )}
            {revealed && (
              <Stack gap={6}>
                <Group justify="center" gap="xs">
                  {phase === "correct" ? (
                    <IconCheck size={16} color="var(--mantine-color-teal-6)" />
                  ) : (
                    <IconBulb size={16} color="var(--mantine-color-yellow-6)" />
                  )}
                  <Text size="sm" fw={600}>
                    {phase === "correct"
                      ? t("Mistakes.Session.Correct", "{{move}} keeps the position.", {
                          move: attempt?.san,
                        })
                      : t("Mistakes.Session.Solution", "The engine's move: {{move}}.", {
                          move: best?.san,
                        })}
                  </Text>
                </Group>
                {facts && <MistakeExplanation sentences={explainMistake(facts)} />}
              </Stack>
            )}
            {error && <Alert color="red">{error}</Alert>}
            <Group justify="space-between">
              <Button
                variant="subtle"
                color="gray"
                size="xs"
                leftSection={<IconChessKnight size={14} />}
                onClick={() => onOpenGame(item)}
              >
                {t("Mistakes.Session.OpenGame", "Open the game")}
              </Button>
              <Group gap="xs">
                {(phase === "find" || phase === "wrong") && (
                  <Button variant="default" size="xs" onClick={() => void showSolution()}>
                    {t("Mistakes.Session.ShowSolution", "Show the solution")}
                  </Button>
                )}
                {revealed && (
                  <Button size="xs" rightSection={<IconArrowRight size={14} />} onClick={next}>
                    {index + 1 < items.length
                      ? t("Mistakes.Session.Next", "Next")
                      : t("Mistakes.Session.Finish", "Finish")}
                  </Button>
                )}
              </Group>
            </Group>
          </Stack>
        )
      )}
    </Modal>
  );
}
