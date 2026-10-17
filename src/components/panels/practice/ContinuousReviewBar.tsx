import { Alert, Badge, Button, Group, Stack, Text } from "@mantine/core";
import { IconBulb, IconInfinity, IconPlayerStop } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { hintPiece, type ContinuousSession } from "@/utils/openingContinuous";

/**
 * Header of a continuous review (I-36): lines played, lines without mistakes, how to stop, and a
 * hint that names the piece to move — offered only where the move is still weak.
 */
export default function ContinuousReviewBar({
  session,
  lineName,
  hintSan,
  onFinish,
}: {
  session: ContinuousSession;
  lineName?: string;
  /** Expected move when it is weak and it is the student's turn; otherwise no hint. */
  hintSan: string | null;
  onFinish: () => void;
}) {
  const { t } = useTranslation();
  const [hintOpen, setHintOpen] = useState(false);
  useEffect(() => setHintOpen(false), [hintSan]);
  const pieceLabels = {
    king: t("Continuous.Hint.King", "Move the king"),
    queen: t("Continuous.Hint.Queen", "Move the queen"),
    rook: t("Continuous.Hint.Rook", "Move a rook"),
    bishop: t("Continuous.Hint.Bishop", "Move a bishop"),
    knight: t("Continuous.Hint.Knight", "Move a knight"),
    pawn: t("Continuous.Hint.Pawn", "Move a pawn"),
  };

  return (
    <Alert color="cyan" variant="light" icon={<IconInfinity size={18} />} p="sm">
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm" fw={600}>
            {t("Continuous.Title", "Continuous review")}
          </Text>
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            leftSection={<IconPlayerStop size={12} />}
            onClick={onFinish}
          >
            {t("Continuous.Finish", "Finish")}
          </Button>
        </Group>
        <Group gap="xs">
          <Badge variant="light" color="cyan">
            {t("Continuous.Played", "{{count}} lines", { count: session.played })}
          </Badge>
          {session.played > 0 && (
            <Badge variant="light" color="teal">
              {t("Continuous.Clean", "{{count}} without mistakes", { count: session.clean })}
            </Badge>
          )}
          {session.comeback.length > 0 && (
            <Badge variant="light" color="orange">
              {t("Continuous.Comeback", "{{count}} coming back soon", {
                count: session.comeback.length,
              })}
            </Badge>
          )}
        </Group>
        {lineName && (
          <Text size="xs" c="dimmed" truncate>
            {lineName}
          </Text>
        )}
        {hintSan &&
          (hintOpen ? (
            <Text size="sm" c="cyan">
              {pieceLabels[hintPiece(hintSan)]}
            </Text>
          ) : (
            <Button
              size="compact-xs"
              variant="light"
              color="cyan"
              leftSection={<IconBulb size={12} />}
              onClick={() => setHintOpen(true)}
              style={{ alignSelf: "flex-start" }}
            >
              {t("Continuous.Hint", "Hint")}
            </Button>
          ))}
        <Text size="xs" c="dimmed">
          {t(
            "Continuous.Note",
            "The opponent steers towards your weakest moves. Spaced reviews are not affected.",
          )}
        </Text>
      </Stack>
    </Alert>
  );
}
