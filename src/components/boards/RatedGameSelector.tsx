import { Badge, Group, SegmentedControl, Stack, Text, Tooltip } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  isProvisional,
  type PlayerRating,
  type RatedGameBlocker,
  type RatedRhythm,
} from "@/utils/botRating";

export function useRhythmLabel() {
  const { t } = useTranslation();
  return (rhythm: RatedRhythm | "bullet") =>
    ({
      bullet: t("HumanBots.Rhythm.Bullet", "Bullet"),
      blitz: t("HumanBots.Rhythm.Blitz", "Blitz"),
      rapid: t("HumanBots.Rhythm.Rapid", "Rapid"),
      classical: t("HumanBots.Rhythm.Classical", "Classical"),
    })[rhythm];
}

/** A rating as the app shows it: rounded, with "?" while it is provisional. */
export function formatPlayerRating(rating: PlayerRating): string {
  return `${Math.round(rating.rating)}${isProvisional(rating) ? "?" : ""}`;
}

/**
 * Friendly or rated choice for a game against a catalog bot (Phase 9.1, I-50). A rated game needs
 * the same standard clock for both sides; the reason is shown when it is not possible.
 */
export default function RatedGameSelector({
  rated,
  onChange,
  blocker,
  rhythm,
  playerRating,
  botName,
  botRating,
  showTitle = true,
}: {
  rated: boolean;
  onChange: (rated: boolean) => void;
  blocker: RatedGameBlocker | null;
  rhythm: RatedRhythm | null;
  playerRating: PlayerRating | null;
  botName: string;
  botRating: number | null;
  /** Off when the surrounding panel already names the section. */
  showTitle?: boolean;
}) {
  const { t } = useTranslation();
  const rhythmLabel = useRhythmLabel();
  const blockerText: Record<RatedGameBlocker, string> = {
    notAgainstBot: t(
      "HumanBots.Rated.Blocked.NotAgainstBot",
      "Only games against a catalog bot can be rated.",
    ),
    guided: t("HumanBots.Rated.Blocked.Guided", "Guided games are always friendly."),
    customPosition: t(
      "HumanBots.Rated.Blocked.CustomPosition",
      "Rated games start from the initial position.",
    ),
    noClock: t(
      "HumanBots.Rated.Blocked.NoClock",
      "Rated games need a clock. Games without a clock are always friendly.",
    ),
    differentClocks: t(
      "HumanBots.Rated.Blocked.DifferentClocks",
      "Both sides need the same clock.",
    ),
    bullet: t(
      "HumanBots.Rated.Blocked.Bullet",
      "Bullet games are always friendly. Use blitz, rapid or classical.",
    ),
    openingBook: t(
      "HumanBots.Rated.Blocked.OpeningBook",
      "Turn off the opening book: it would replace the bot's own repertoire.",
    ),
    noVerifier: t(
      "HumanBots.Rated.Blocked.NoVerifier",
      "Install Stockfish: without it the bot plays without its style and strength.",
    ),
  };
  const canRate = blocker === null;
  const isRated = rated && canRate;

  return (
    <Stack gap="xs">
      {showTitle && (
        <Group justify="space-between" wrap="nowrap">
          <Text fw={600}>{t("HumanBots.Rated.Title", "Game type")}</Text>
          <Tooltip
            multiline
            w={280}
            label={t(
              "HumanBots.Rated.Help",
              "Rated games change your rating at that rhythm. Taking back a move makes the game friendly.",
            )}
          >
            <IconInfoCircle size={16} color="var(--mantine-color-dimmed)" />
          </Tooltip>
        </Group>
      )}
      <SegmentedControl
        fullWidth
        value={isRated ? "rated" : "friendly"}
        onChange={(value) => onChange(value === "rated")}
        data={[
          { value: "friendly", label: t("HumanBots.Rated.Friendly", "Friendly") },
          { value: "rated", label: t("HumanBots.Rated.Rated", "Rated"), disabled: !canRate },
        ]}
      />
      {!canRate && blocker !== "notAgainstBot" && (
        <Text size="xs" c="dimmed">
          {blockerText[blocker]}
        </Text>
      )}
      {isRated && rhythm && (
        <Group gap="xs" wrap="wrap">
          <Badge variant="light">{rhythmLabel(rhythm)}</Badge>
          {playerRating && (
            <Text size="xs">
              {t("HumanBots.Rated.YourRating", "Your rating")}:{" "}
              <Text span fw={600} size="xs">
                {formatPlayerRating(playerRating)}
              </Text>
            </Text>
          )}
          {botRating !== null && (
            <Text size="xs" c="dimmed">
              · {botName} {botRating}
            </Text>
          )}
        </Group>
      )}
    </Stack>
  );
}
