import {
  ActionIcon,
  Button,
  Group,
  Loader,
  NumberInput,
  Paper,
  SegmentedControl,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconCheck,
  IconCurrentLocation,
  IconDeviceFloppy,
  IconRotate,
  IconX,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

export type DiagramBarState = {
  page: number;
  status: { color: string; text: string };
  /** Where the side to move came from, already worded; null when nothing was read. */
  turnNote: string | null;
  /** Squares changed by what was learned in this book, already worded. */
  learnedNote: string | null;
  problems: boolean;
  canFlip: boolean;
  canSave: boolean;
  needsReview: boolean;
  ms: number;
};

/**
 * The last diagram read from the book, above the board: its state, the side to move and the move
 * number (both editable in one click), and its actions. Replaces the card that covered the page.
 */
export default function DiagramBar({
  busy,
  error,
  state,
  turn,
  fullmove,
  onTurn,
  onFullmove,
  onUse,
  onFlip,
  onSave,
  onGoTo,
  onDismiss,
}: {
  busy: string | null;
  error: string | null;
  state: DiagramBarState | null;
  turn: "w" | "b";
  fullmove: number;
  onTurn: (turn: "w" | "b") => void;
  onFullmove: (fullmove: number) => void;
  onUse: () => void;
  onFlip: () => void;
  onSave: () => void;
  onGoTo: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  if (!busy && !error && !state) return null;

  return (
    <Paper withBorder px="xs" py={6} mb={6} radius="sm">
      {busy ? (
        <Group gap="xs" h={30}>
          <Loader size="xs" />
          <Text size="sm">{busy}</Text>
        </Group>
      ) : error ? (
        <Group gap="xs" justify="space-between" wrap="nowrap">
          <Text size="sm" c="red">
            {error}
          </Text>
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={onDismiss}>
            <IconX size="0.9rem" />
          </ActionIcon>
        </Group>
      ) : (
        state && (
          <>
            <Group gap="xs" justify="space-between" wrap="nowrap">
              <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                <Tooltip label={t("Books.Bar.GoTo")}>
                  <Button
                    size="compact-sm"
                    variant="subtle"
                    color="gray"
                    leftSection={<IconCurrentLocation size="0.95rem" />}
                    onClick={onGoTo}
                    title={t("Books.Result.Timing", { ms: state.ms, page: state.page })}
                  >
                    {t("Books.Bar.Page", { page: state.page })}
                  </Button>
                </Tooltip>
                <Text size="sm" fw={600} c={state.status.color} truncate>
                  {state.status.text}
                </Text>
              </Group>
              <Group gap={4} wrap="nowrap">
                {state.canFlip && (
                  <Tooltip label={t("Board.ImageReader.Flip")}>
                    <ActionIcon variant="subtle" color="gray" onClick={onFlip}>
                      <IconRotate size="1rem" />
                    </ActionIcon>
                  </Tooltip>
                )}
                {state.canSave && (
                  <Tooltip label={t("Books.Result.SaveHelp")} multiline w={260}>
                    <ActionIcon variant="subtle" color="gray" onClick={onSave}>
                      <IconDeviceFloppy size="1rem" />
                    </ActionIcon>
                  </Tooltip>
                )}
                <Tooltip label={t("Books.Bar.Hide")}>
                  <ActionIcon variant="subtle" color="gray" onClick={onDismiss}>
                    <IconX size="1rem" />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>
            <Group gap="sm" mt={6} wrap="wrap">
              <Group gap={6} wrap="nowrap">
                <Text size="xs" c="dimmed">
                  {t("Books.Bar.ToMove")}
                </Text>
                <SegmentedControl
                  size="xs"
                  value={turn}
                  onChange={(value) => onTurn(value as "w" | "b")}
                  data={[
                    { value: "w", label: t("Books.Bar.White") },
                    { value: "b", label: t("Books.Bar.Black") },
                  ]}
                />
              </Group>
              <Group gap={6} wrap="nowrap">
                <Text size="xs" c="dimmed">
                  {t("Books.Bar.Move")}
                </Text>
                <NumberInput
                  size="xs"
                  w={58}
                  min={1}
                  max={999}
                  value={fullmove}
                  hideControls
                  onChange={(value) => {
                    const n = Number(value);
                    if (Number.isInteger(n) && n >= 1) onFullmove(n);
                  }}
                />
              </Group>
              {state.needsReview && (
                <Button
                  size="compact-sm"
                  leftSection={<IconCheck size="0.9rem" />}
                  onClick={onUse}
                  ml="auto"
                >
                  {t("Books.Result.Use")}
                </Button>
              )}
            </Group>
            {(state.turnNote || state.problems || state.learnedNote) && (
              <Text size="xs" c="dimmed" mt={4} lineClamp={2}>
                {[
                  state.learnedNote,
                  state.turnNote,
                  state.problems ? t("Books.Result.CheckRules") : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            )}
          </>
        )
      )}
    </Paper>
  );
}
