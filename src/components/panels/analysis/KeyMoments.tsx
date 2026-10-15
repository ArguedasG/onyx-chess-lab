import { Badge, Group, Paper, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconFlag } from "@tabler/icons-react";
import { useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { TreeStateContext } from "@/components/common/TreeStateContext";
import { findKeyMoments, type KeyMomentKind } from "@/utils/keyMoments";

const KIND_COLOR: Record<KeyMomentKind, string> = {
  turning: "red",
  missedWin: "orange",
  error: "yellow",
};

/** The two or three moves that decided the game, from the report's evaluations. */
export default function KeyMoments() {
  const { t } = useTranslation();
  const store = useContext(TreeStateContext)!;
  const root = useStore(store, (s) => s.root);
  const goToMove = useStore(store, (s) => s.goToMove);
  const moments = useMemo(() => findKeyMoments(root), [root]);
  if (moments.length === 0) return null;

  const kindLabel = (kind: KeyMomentKind) =>
    kind === "turning"
      ? t("Board.KeyMoments.Turning", "Turning point")
      : kind === "missedWin"
        ? t("Board.KeyMoments.MissedWin", "Win let slip")
        : t("Board.KeyMoments.Error", "Costly mistake");

  return (
    <Paper withBorder p="sm">
      <Group gap="xs" mb={4}>
        <IconFlag size={18} />
        <Text fw={600}>{t("Board.KeyMoments.Title", "Key moments")}</Text>
      </Group>
      <Text size="xs" c="dimmed" mb="xs">
        {t(
          "Board.KeyMoments.Description",
          "The moves that lost the most winning chances (Lichess formula). Click one to go there.",
        )}
      </Text>
      <Stack gap={6}>
        {moments.map((moment) => (
          <UnstyledButton key={moment.path.length} onClick={() => goToMove(moment.path)}>
            <Group justify="space-between" wrap="nowrap" gap="xs">
              <Text size="sm" fw={600}>
                {moment.moveNumber}
                {moment.color === "white" ? ". " : "… "}
                {moment.san}
              </Text>
              <Group gap={6} wrap="nowrap">
                <Text size="xs" c="dimmed">
                  {t("Board.KeyMoments.Chances", "{{before}}% → {{after}}%", {
                    before: moment.before.toFixed(0),
                    after: moment.after.toFixed(0),
                  })}
                </Text>
                <Badge size="xs" variant="light" color={KIND_COLOR[moment.kind]}>
                  {kindLabel(moment.kind)}
                </Badge>
              </Group>
            </Group>
          </UnstyledButton>
        ))}
      </Stack>
    </Paper>
  );
}
