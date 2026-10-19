import { Alert, Button, Group, Loader, Paper, Stack, Text } from "@mantine/core";
import { IconAlertTriangle, IconBulb, IconCircleCheck } from "@tabler/icons-react";
import type { DrawShape } from "@lichess-org/chessground/draw";
import type { Key } from "@lichess-org/chessground/types";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getBestMovesOnce, type LocalEngine } from "@/utils/engines";
import { type GuidedLevel, type GuidedMoment, guidedMoment } from "@/utils/guidedPlay";

/** Short and light, so the warning arrives while the player is still thinking. */
const SEARCH_MS = 700;
const SEARCH_OPTIONS = [
  { name: "Threads", value: "1" },
  { name: "Hash", value: "32" },
  { name: "MultiPV", value: "2" },
];

export type GuidedHint = "none" | "piece" | "move";

type GuidedState =
  | { status: "waiting" }
  | { status: "thinking" }
  | { status: "unavailable" }
  | { status: "ready"; moment: GuidedMoment };

/**
 * The guided play state of the position: searched on the player's turn only, with the hint the
 * player asked for, which resets on every new position.
 */
export function useGuidedPlay({
  active,
  fen,
  playerToMove,
  engine,
}: {
  active: boolean;
  fen: string;
  playerToMove: boolean;
  engine: LocalEngine | null;
}) {
  const [state, setState] = useState<GuidedState>({ status: "waiting" });
  const [hint, setHint] = useState<GuidedHint>("none");

  useEffect(() => {
    setHint("none");
    if (!active || !playerToMove) {
      setState({ status: "waiting" });
      return;
    }
    if (!engine) {
      setState({ status: "unavailable" });
      return;
    }
    let current = true;
    setState({ status: "thinking" });
    getBestMovesOnce(
      engine,
      { t: "Time", c: SEARCH_MS },
      { fen, moves: [], extraOptions: SEARCH_OPTIONS },
      SEARCH_MS + 6_000,
    )
      .then((lines) => {
        if (current) {
          setState({ status: "ready", moment: guidedMoment(lines, fen.split(" ")[1] !== "b") });
        }
      })
      .catch(() => {
        if (current) setState({ status: "unavailable" });
      });
    return () => {
      current = false;
    };
  }, [active, engine, fen, playerToMove]);

  const shapes = useMemo<DrawShape[]>(() => {
    if (state.status !== "ready" || !state.moment.critical || !state.moment.best) return [];
    const from = state.moment.best.slice(0, 2) as Key;
    const to = state.moment.best.slice(2, 4) as Key;
    if (hint === "piece") return [{ orig: from, brush: "green" }];
    if (hint === "move") return [{ orig: from, dest: to, brush: "green" }];
    return [];
  }, [hint, state]);

  return { state, hint, setHint, shapes };
}

export function GuidedPlayPanel({
  level,
  guided,
  playerToMove,
}: {
  level: GuidedLevel;
  guided: ReturnType<typeof useGuidedPlay>;
  playerToMove: boolean;
}) {
  const { t } = useTranslation();
  const { state, hint, setHint } = guided;

  const body = (() => {
    if (!playerToMove) {
      return (
        <Text size="sm" c="dimmed">
          {t("HumanBots.Guided.BotTurn", "The bot is thinking.")}
        </Text>
      );
    }
    if (state.status === "unavailable") {
      return (
        <Text size="sm" c="dimmed">
          {t("HumanBots.Guided.Unavailable", "Guided play needs Stockfish installed.")}
        </Text>
      );
    }
    if (state.status !== "ready") {
      return (
        <Group gap="xs">
          <Loader size="xs" />
          <Text size="sm" c="dimmed">
            {t("HumanBots.Guided.Thinking", "Checking the position…")}
          </Text>
        </Group>
      );
    }
    if (!state.moment.critical) {
      return (
        <Group gap="xs" wrap="nowrap">
          <IconCircleCheck size={18} color="var(--mantine-color-teal-6)" />
          <Text size="sm">
            {t("HumanBots.Guided.Calm", "Quiet position: several moves are fine.")}
          </Text>
        </Group>
      );
    }
    return (
      <Alert
        color="yellow"
        variant="light"
        icon={<IconAlertTriangle size={18} />}
        title={t("HumanBots.Guided.Critical", "Critical moment")}
      >
        <Stack gap="xs">
          <Text size="sm">
            {t(
              "HumanBots.Guided.Critical.Desc",
              "One move is clearly better than the others. Take your time before playing.",
            )}
          </Text>
          {level === "hints" && (
            <Group gap="xs">
              <Button
                size="compact-sm"
                variant="light"
                color="yellow"
                leftSection={<IconBulb size={14} />}
                disabled={hint !== "none"}
                onClick={() => setHint("piece")}
              >
                {t("HumanBots.Guided.ShowPiece", "Show the piece")}
              </Button>
              <Button
                size="compact-sm"
                variant="subtle"
                color="yellow"
                disabled={hint === "move"}
                onClick={() => setHint("move")}
              >
                {t("HumanBots.Guided.ShowMove", "Show the move")}
              </Button>
            </Group>
          )}
        </Stack>
      </Alert>
    );
  })();

  return (
    <Paper withBorder radius="md" p="sm">
      <Stack gap="xs">
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">
          {t("HumanBots.Guided.Title", "Guided play")}
        </Text>
        {body}
      </Stack>
    </Paper>
  );
}
