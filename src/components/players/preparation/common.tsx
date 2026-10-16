import { Alert, Badge, Group, Paper, Stack, Text, ThemeIcon, Tooltip } from "@mantine/core";
import { IconFlask, IconInfoCircle } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { activeTabAtom, enginesAtom, tabsAtom } from "@/state/atoms";
import type { LocalEngine } from "@/utils/engines";
import { isMaiaEngine } from "@/utils/humanBots";
import { lineSan } from "@/utils/preparation/book";
import { createTab } from "@/utils/tabs";

/**
 * Reminder that a preparation suggestion is a reading of past games, not a certainty (I-32).
 * Kept visible but quiet: one line, with the reasons on hover.
 */
export function SuggestionNote({ games }: { games?: number }) {
  const { t } = useTranslation();
  return (
    <Alert
      variant="light"
      color="gray"
      radius="md"
      py={8}
      icon={<IconFlask size={18} />}
      title={
        <Group gap={6}>
          <Text size="sm" fw={600}>
            {t("Preparation.Note.Title", "Guidance, not a certainty")}
          </Text>
          <Badge size="xs" variant="outline" color="gray">
            {t("Preparation.Note.Badge", "Experimental")}
          </Badge>
        </Group>
      }
    >
      <Text size="xs" c="dimmed">
        {games != null
          ? t(
              "Preparation.Note.BodyGames",
              "A summary of trends in {{count}} past games. Rivals change, prepare surprises and play differently over the board: use it as a starting point and check every line yourself.",
              { count: games },
            )
          : t(
              "Preparation.Note.Body",
              "A summary of trends in past games. Rivals change, prepare surprises and play differently over the board: use it as a starting point and check every line yourself.",
            )}
      </Text>
    </Alert>
  );
}

/** Title of a section with an icon, a one-line explanation and optional actions on the right. */
export function SectionHeader({
  icon,
  title,
  description,
  right,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  right?: React.ReactNode;
}) {
  return (
    <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
      <Group gap="sm" wrap="nowrap" align="flex-start" style={{ minWidth: 0 }}>
        <ThemeIcon variant="light" radius="md" size={34}>
          {icon}
        </ThemeIcon>
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Text fw={700}>{title}</Text>
          {description && (
            <Text size="xs" c="dimmed">
              {description}
            </Text>
          )}
        </Stack>
      </Group>
      {right}
    </Group>
  );
}

/** Empty or waiting state of a section. */
export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <Paper withBorder radius="md" p="lg">
      <Group gap="sm" wrap="nowrap">
        <IconInfoCircle size={18} color="var(--mantine-color-dimmed)" />
        <Text size="sm" c="dimmed">
          {children}
        </Text>
      </Group>
    </Paper>
  );
}

/** A line of moves in SAN, shortened from the start when long. */
export function LineText({ moves, max = 10 }: { moves: readonly string[]; max?: number }) {
  const full = useMemo(() => lineSan(moves), [moves]);
  const parts = full.split(" ");
  const short = parts.length > max ? `… ${parts.slice(-max).join(" ")}` : full;
  return (
    <Tooltip label={full || "—"} disabled={short === full} multiline maw={420} withArrow>
      <Text size="sm" ff="monospace" lineClamp={1}>
        {short || "—"}
      </Text>
    </Tooltip>
  );
}

/** Opens a line (UCI from the start) in a new analysis tab that returns to the player card. */
export function useOpenLine(returnTo: { profileId: string; playerName: string }) {
  const navigate = useNavigate();
  const setTabs = useSetAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const { profileId, playerName } = returnTo;
  return useCallback(
    async (moves: readonly string[], name: string, extraPgn?: string) => {
      const san = lineSan(moves);
      const pgn =
        extraPgn ??
        `[Event "${name.replace(/"/g, "'")}"]\n[Site "Onyx Chess Lab"]\n[Result "*"]\n\n${san} *\n`;
      await createTab({
        tab: {
          name,
          type: "analysis",
          returnPath: "/players",
          returnPlayerAnalysis: { profileId, playerName },
        },
        pgn,
        setTabs,
        setActiveTab,
        position: Array(moves.length).fill(0),
        preserveNewTab: true,
      });
      navigate({ to: "/" });
    },
    [navigate, playerName, profileId, setActiveTab, setTabs],
  );
}

/** The local engines the preparation can use: a reference engine and Maia. */
export function usePreparationEngines() {
  const engines = useAtomValue(enginesAtom);
  return useMemo(() => {
    const local = (engines ?? []).filter(
      (engine): engine is LocalEngine => engine.type === "local",
    );
    return {
      reference: local.find((engine) => !isMaiaEngine(engine)) ?? null,
      maia: local.find((engine) => isMaiaEngine(engine)) ?? null,
    };
  }, [engines]);
}

export function formatPercent(value: number | null | undefined, digits = 0) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function signed(value: number | null | undefined) {
  if (value == null) return "—";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${Math.abs(rounded).toFixed(1)}`;
}
