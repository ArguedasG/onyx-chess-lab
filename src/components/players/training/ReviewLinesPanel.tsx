import {
  ActionIcon,
  Badge,
  Group,
  Paper,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  formatLineScore,
  numberedMoves,
  type ReviewLine,
  type ReviewLineKind,
} from "@/utils/mistakes/reviewLines";

export type ReviewLineView = { kind: ReviewLineKind; ply: number };

const COLORS: Record<ReviewLineKind, string> = { attempt: "teal", best: "blue", game: "red" };

/**
 * The lines of a revealed mistake, each with its evaluation; clicking a move shows that position
 * on the board, and the arrows step through the selected line.
 */
export default function ReviewLinesPanel({
  fen,
  lines,
  view,
  onView,
}: {
  fen: string;
  lines: ReviewLine[];
  view: ReviewLineView | null;
  onView: (view: ReviewLineView | null) => void;
}) {
  const { t } = useTranslation();
  const labels: Record<ReviewLineKind, string> = {
    attempt: t("Mistakes.Lines.Yours", "Your move"),
    best: t("Mistakes.Lines.Best", "Engine's best"),
    game: t("Mistakes.Lines.Game", "Game move"),
  };
  const current = view ? lines.find((line) => line.kind === view.kind) : undefined;
  const ply = view?.ply ?? 0;
  const go = (next: number) => {
    const line = current ?? lines[0];
    if (!line) return;
    const clamped = Math.max(0, Math.min(line.uci.length, next));
    onView(clamped === 0 ? null : { kind: line.kind, ply: clamped });
  };
  const length = (current ?? lines[0])?.uci.length ?? 0;

  return (
    <Paper withBorder radius="md" p="sm">
      <Stack gap={8}>
        <Group justify="space-between" wrap="nowrap">
          <Text size="xs" c="dimmed">
            {t("Mistakes.Lines.Hint", "Click a move to see it on the board and compare the lines.")}
          </Text>
          <Group gap={2} wrap="nowrap">
            <Tooltip label={t("Mistakes.Lines.Start", "Starting position")}>
              <ActionIcon variant="subtle" size="sm" disabled={ply === 0} onClick={() => go(0)}>
                <IconChevronsLeft size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t("Mistakes.Lines.Back", "Previous move")}>
              <ActionIcon
                variant="subtle"
                size="sm"
                disabled={ply === 0}
                onClick={() => go(ply - 1)}
              >
                <IconChevronLeft size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t("Mistakes.Lines.Forward", "Next move")}>
              <ActionIcon
                variant="subtle"
                size="sm"
                disabled={ply >= length}
                onClick={() => go(ply + 1)}
              >
                <IconChevronRight size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t("Mistakes.Lines.End", "End of the line")}>
              <ActionIcon
                variant="subtle"
                size="sm"
                disabled={ply >= length}
                onClick={() => go(length)}
              >
                <IconChevronsRight size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
        {lines.map((line) => {
          const moves = numberedMoves(fen, line.san);
          const selected = view?.kind === line.kind;
          return (
            <Group key={line.kind} gap={6} wrap="nowrap" align="flex-start">
              <Badge
                variant={selected ? "filled" : "light"}
                color={COLORS[line.kind]}
                w={120}
                style={{ flexShrink: 0, cursor: "pointer" }}
                onClick={() => onView({ kind: line.kind, ply: 1 })}
              >
                {labels[line.kind]}
              </Badge>
              <Text size="xs" fw={700} w={48} style={{ flexShrink: 0 }} ta="right">
                {line.score ? formatLineScore(line.score) : "…"}
              </Text>
              <Group gap={4} style={{ flex: 1, minWidth: 0 }}>
                {moves.map((label, index) => {
                  const active = selected && ply === index + 1;
                  return (
                    <UnstyledButton
                      key={`${line.kind}-${index}`}
                      onClick={() => onView({ kind: line.kind, ply: index + 1 })}
                      px={4}
                      style={{
                        borderRadius: 4,
                        fontSize: "var(--mantine-font-size-sm)",
                        fontWeight: index === 0 ? 700 : 400,
                        background: active
                          ? `var(--mantine-color-${COLORS[line.kind]}-light)`
                          : undefined,
                      }}
                    >
                      {label}
                    </UnstyledButton>
                  );
                })}
              </Group>
            </Group>
          );
        })}
      </Stack>
    </Paper>
  );
}
