import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconChessKnight, IconPlayerPlay, IconShieldHalf } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  activeTabAtom,
  gameInputColorAtom,
  gamePlayer1SettingsAtom,
  gamePlayer2SettingsAtom,
  tabsAtom,
} from "@/state/atoms";
import { clampMaiaElo, MAIA_ELO_MAX } from "@/utils/humanBots";
import {
  type PracticeKind,
  type PracticePosition,
  practicePositions,
} from "@/utils/mistakes/practice";
import type { PlayerEngineAnalysis } from "@/utils/playerAnalysis";
import type { ProfileGame } from "@/utils/players/profileGames";
import { launchTrainingPosition } from "@/utils/trainingLaunch";
import { DEFAULT_TIME_CONTROL } from "../../boards/OpponentForm";
import { EngineAnalysisButton, EngineBadge, formatDay } from "../common";
import { EmptyState, SectionHeader, usePreparationEngines } from "../preparation/common";

const MAX_ROWS = 30;

/**
 * Conversion and defense practice (I-21): play again, against Maia at the level of that game's
 * opponent, the positions where the player was clearly better and did not win, or clearly worse.
 */
export default function PracticeSection({
  engine,
  games,
  initialKind = "conversion",
  onOpenGame,
}: {
  engine: PlayerEngineAnalysis | null;
  initialKind?: PracticeKind;
  games: ProfileGame[];
  onOpenGame: (game: ProfileGame, ply: number) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { maia } = usePreparationEngines();
  const [kind, setKind] = useState<PracticeKind>(initialKind);
  const setPlayer1 = useSetAtom(gamePlayer1SettingsAtom);
  const setPlayer2 = useSetAtom(gamePlayer2SettingsAtom);
  const setInputColor = useSetAtom(gameInputColorAtom);
  const setTabs = useSetAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const summary = useMemo(
    () => (engine ? practicePositions(engine, games) : null),
    [engine, games],
  );
  const rows = summary ? summary[kind] : [];

  async function play(position: PracticePosition) {
    if (!maia) return;
    const userColor = position.game.isWhite ? "white" : "black";
    const elo = clampMaiaElo(position.game.opponentElo ?? position.game.playerElo ?? 1500);
    setInputColor(userColor);
    setPlayer1({
      type: "human",
      name: t("Preparation.Twin.You", "You"),
      timeControl: DEFAULT_TIME_CONTROL,
      timeUnit: "m",
      incrementUnit: "s",
    });
    setPlayer2({
      type: "engine",
      engine: maia,
      go: { t: "Depth", c: 1 },
      presetId: "custom",
      targetElo: Math.min(elo, MAIA_ELO_MAX),
      timeControl: DEFAULT_TIME_CONTROL,
      timeUnit: "m",
      incrementUnit: "s",
    });
    await navigate({ to: "/" });
    await launchTrainingPosition({
      fen: position.fen,
      name:
        position.kind === "conversion"
          ? t("Practice.ConvertTitle", "Convert · {{opponent}}", {
              opponent: position.game.opponent,
            })
          : t("Practice.DefendTitle", "Defend · {{opponent}}", {
              opponent: position.game.opponent,
            }),
      type: "play",
      setTabs,
      setActiveTab,
    });
  }

  return (
    <Stack gap="md">
      <SectionHeader
        icon={<IconShieldHalf size={18} />}
        title={t("Practice.Title", "Conversion and defense")}
        description={t(
          "Practice.Description",
          "Your own positions to play again against Maia at the level of that game's opponent: where you were clearly better (+1.5) and did not win, to convert; where you were clearly worse (−1.5), to defend.",
        )}
        right={summary ? <EngineBadge games={summary.analyzedGames} /> : undefined}
      />
      {!maia && (
        <Alert color="yellow" py={8}>
          {t("Practice.NoMaia", "Practice needs Maia 3, from Engines.")}
        </Alert>
      )}
      {!summary || summary.analyzedGames === 0 ? (
        <EmptyState>
          <Stack gap="xs">
            <span>
              {t(
                "Practice.NeedsEngine",
                "The positions come from the engine analysis of the games.",
              )}
            </span>
            <EngineAnalysisButton />
          </Stack>
        </EmptyState>
      ) : (
        <>
          {summary.withoutPositions > 0 && (
            <Alert color="gray" py={8}>
              {t(
                "Practice.Reanalyze",
                "{{count}} analyzed games are from before this version and do not keep the position: analyze them again to include them.",
                { count: summary.withoutPositions },
              )}
            </Alert>
          )}
          <SegmentedControl
            w="fit-content"
            value={kind}
            onChange={(value) => setKind(value as PracticeKind)}
            data={[
              {
                value: "conversion",
                label: t("Practice.Convert", "Convert · {{count}}", {
                  count: summary.conversion.length,
                }),
              },
              {
                value: "defense",
                label: t("Practice.Defend", "Defend · {{count}}", {
                  count: summary.defense.length,
                }),
              },
            ]}
          />
          <Text size="sm">
            {kind === "conversion"
              ? t(
                  "Practice.ConvertGoal",
                  "Goal: win the position. These are the advantages of the analyzed games that ended in a draw or a loss.",
                )
              : t("Practice.DefendGoal", "Goal: draw or better. The lost games come first.")}
          </Text>
          {rows.length === 0 ? (
            <EmptyState>
              {kind === "conversion"
                ? t("Practice.NoConversion", "Every analyzed advantage was converted.")
                : t("Practice.NoDefense", "No analyzed game reached a clearly worse position.")}
            </EmptyState>
          ) : (
            <Paper withBorder radius="md" p={0}>
              <Table striped highlightOnHover verticalSpacing={6}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("PlayerAnalysis.Game", "Game")}</Table.Th>
                    <Table.Th ta="right">{t("Practice.Move", "Move")}</Table.Th>
                    <Table.Th ta="right">{t("Practice.Chances", "Winning chances")}</Table.Th>
                    <Table.Th>{t("Practice.Result", "In the game")}</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rows.slice(0, MAX_ROWS).map((position) => (
                    <Table.Tr key={position.key}>
                      <Table.Td maw={280}>
                        <Text size="sm" lineClamp={1}>
                          {`${position.game.opponent}${position.game.opponentElo ? ` (${position.game.opponentElo})` : ""}`}
                        </Text>
                        <Text size="xs" c="dimmed" lineClamp={1}>
                          {formatDay(position.game.day)} · {position.game.opening ?? ""}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">{Math.floor(position.ply / 2) + 1}</Table.Td>
                      <Table.Td ta="right">{`${Math.round(position.winChance)}%`}</Table.Td>
                      <Table.Td>
                        <Badge
                          size="sm"
                          variant="light"
                          color={
                            position.outcome === "win"
                              ? "teal"
                              : position.outcome === "draw"
                                ? "gray"
                                : "red"
                          }
                        >
                          {position.outcome === "win"
                            ? t("Practice.Won", "Won")
                            : position.outcome === "draw"
                              ? t("Practice.Drawn", "Drawn")
                              : position.outcome === "loss"
                                ? t("Practice.Lost", "Lost")
                                : "—"}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4} justify="flex-end" wrap="nowrap">
                          <Tooltip label={t("Mistakes.Session.OpenGame", "Open the game")}>
                            <ActionIcon
                              variant="subtle"
                              onClick={() => onOpenGame(position.game, position.ply)}
                            >
                              <IconChessKnight size={15} />
                            </ActionIcon>
                          </Tooltip>
                          <Button
                            size="compact-xs"
                            leftSection={<IconPlayerPlay size={12} />}
                            disabled={!maia}
                            onClick={() => void play(position)}
                          >
                            {t("Practice.Play", "Play vs Maia {{elo}}", {
                              elo: clampMaiaElo(position.game.opponentElo ?? 1500),
                            })}
                          </Button>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          )}
          <Text size="xs" c="dimmed">
            {t(
              "Practice.Honest",
              "Maia plays like a human of that rating, not the real opponent; its scale is that of Lichess.",
            )}
          </Text>
        </>
      )}
    </Stack>
  );
}
