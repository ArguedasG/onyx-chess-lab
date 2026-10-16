import { Paper, SimpleGrid, Stack, Text, ThemeIcon, UnstyledButton } from "@mantine/core";
import {
  IconArrowBigUpLines,
  IconBolt,
  IconChessKing,
  IconClockHour4,
  IconFlame,
  IconHourglassHigh,
  IconMoodSad,
  IconSwords,
  IconTrendingUp,
} from "@tabler/icons-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { EngineHighlights, PlayerHighlights } from "@/utils/players/highlights";
import type { ProfileGame } from "@/utils/players/profileGames";
import { nemesisAndFavourite, rivals } from "@/utils/players/rivals";
import { EngineBadge, formatDay, SectionTitle } from "../common";
import classes from "../PlayersPage.module.css";

type Card = {
  key: string;
  icon: React.ReactNode;
  color: string;
  title: string;
  value: string;
  detail: string;
  engine?: boolean;
  onClick?: () => void;
};

function opponentLine(game: ProfileGame) {
  const elo = game.opponentElo ? ` (${game.opponentElo})` : "";
  return `${game.opponent}${elo} · ${formatDay(game.day)}`;
}

/** Moments of the player (I-22): facts from the games, each one opens its game. */
export default function HighlightsSection({
  highlights,
  engine,
  analyzedGames,
  games,
  onOpenGame,
  onShowRivals,
}: {
  highlights: PlayerHighlights;
  engine: EngineHighlights;
  analyzedGames: number;
  games: ProfileGame[];
  onOpenGame: (game: ProfileGame, ply?: number | null) => void;
  onShowRivals: () => void;
}) {
  const { t } = useTranslation();
  const { nemesis } = useMemo(() => nemesisAndFavourite(rivals(games)), [games]);
  const cards: Card[] = [];
  const { biggestUpset, strongestWin, longestWinStreak, currentStreak, fastestMate, longestGame } =
    highlights;

  if (engine.costliestError) {
    const { critical, game } = engine.costliestError;
    const moveNumber = Math.floor((critical.ply ?? 0) / 2) + 1;
    cards.push({
      key: "costliest",
      icon: <IconMoodSad size={18} />,
      color: "red",
      title: t("Players.Highlight.Costliest", "Costliest move"),
      value:
        critical.winChanceLoss != null
          ? t("Players.Highlight.CostliestValue", "−{{points}} pts of winning chances", {
              points: Math.round(critical.winChanceLoss),
            })
          : `−${Math.round(critical.cpLoss)} cp`,
      detail: t("Players.Highlight.MoveAgainst", "Move {{move}} · {{game}}", {
        move: moveNumber,
        game: opponentLine(game),
      }),
      engine: true,
      onClick: () => onOpenGame(game, critical.ply),
    });
  }
  if (engine.biggestComeback) {
    const { game, lowestWinChance } = engine.biggestComeback;
    cards.push({
      key: "comeback",
      icon: <IconTrendingUp size={18} />,
      color: "teal",
      title: t("Players.Highlight.Comeback", "Biggest comeback"),
      value:
        game.outcome === "win"
          ? t("Players.Highlight.ComebackWin", "Won from {{chance}}%", {
              chance: Math.round(lowestWinChance),
            })
          : t("Players.Highlight.ComebackDraw", "Drew from {{chance}}%", {
              chance: Math.round(lowestWinChance),
            }),
      detail: opponentLine(game),
      engine: true,
      onClick: () => onOpenGame(game),
    });
  }
  if (biggestUpset) {
    cards.push({
      key: "upset",
      icon: <IconArrowBigUpLines size={18} />,
      color: "yellow",
      title: t("Players.Highlight.Upset", "Biggest upset"),
      value: t("Players.Highlight.UpsetValue", "Beat +{{gap}} Elo", { gap: biggestUpset.eloGap }),
      detail: opponentLine(biggestUpset.game),
      onClick: () => onOpenGame(biggestUpset.game),
    });
  }
  if (strongestWin) {
    cards.push({
      key: "strongest",
      icon: <IconChessKing size={18} />,
      color: "blue",
      title: t("Players.Highlight.Strongest", "Strongest opponent beaten"),
      value: `${strongestWin.game.opponentElo}`,
      detail: opponentLine(strongestWin.game),
      onClick: () => onOpenGame(strongestWin.game),
    });
  }
  if (longestWinStreak) {
    cards.push({
      key: "streak",
      icon: <IconFlame size={18} />,
      color: "orange",
      title: t("Players.Highlight.BestStreak", "Best winning streak"),
      value: t("Players.Highlight.WinsInRow", "{{count}} wins in a row", {
        count: longestWinStreak.length,
      }),
      detail: `${formatDay(longestWinStreak.first.day)} – ${formatDay(longestWinStreak.last.day)}`,
      onClick: () => onOpenGame(longestWinStreak.first),
    });
  }
  if (currentStreak && currentStreak.length >= 2) {
    const value = {
      win: t("Players.Highlight.CurrentWins", "{{count}} wins", { count: currentStreak.length }),
      draw: t("Players.Highlight.CurrentDraws", "{{count}} draws", { count: currentStreak.length }),
      loss: t("Players.Highlight.CurrentLosses", "{{count}} losses", {
        count: currentStreak.length,
      }),
    }[currentStreak.outcome];
    cards.push({
      key: "current",
      icon: <IconClockHour4 size={18} />,
      color:
        currentStreak.outcome === "win"
          ? "teal"
          : currentStreak.outcome === "loss"
            ? "red"
            : "gray",
      title: t("Players.Highlight.CurrentStreak", "Current streak"),
      value,
      detail: t("Players.Highlight.Since", "Since {{date}}", {
        date: formatDay(currentStreak.since.day),
      }),
      onClick: () => onOpenGame(currentStreak.since),
    });
  }
  if (fastestMate) {
    cards.push({
      key: "mate",
      icon: <IconBolt size={18} />,
      color: "grape",
      title: t("Players.Highlight.FastestMate", "Fastest checkmate"),
      value: t("Players.Highlight.InMoves", "In {{count}} moves", { count: fastestMate.moves }),
      detail: opponentLine(fastestMate.game),
      onClick: () => onOpenGame(fastestMate.game),
    });
  }
  if (longestGame) {
    cards.push({
      key: "longest",
      icon: <IconHourglassHigh size={18} />,
      color: "cyan",
      title: t("Players.Highlight.Longest", "Longest game"),
      value: t("Players.Highlight.Moves", "{{count}} moves", { count: longestGame.moves }),
      detail: opponentLine(longestGame.game),
      onClick: () => onOpenGame(longestGame.game),
    });
  }
  if (nemesis) {
    cards.push({
      key: "nemesis",
      icon: <IconSwords size={18} />,
      color: "red",
      title: t("Players.Highlight.Nemesis", "Toughest rival"),
      value: nemesis.name,
      detail: t(
        "Players.Highlight.NemesisDetail",
        "{{wins}}-{{draws}}-{{losses}} in {{games}} games",
        {
          wins: nemesis.wins,
          draws: nemesis.draws,
          losses: nemesis.losses,
          games: nemesis.games,
        },
      ),
      onClick: onShowRivals,
    });
  }

  return (
    <Stack gap="sm">
      <SectionTitle
        title={t("Players.Highlights", "Highlights")}
        description={t(
          "Players.HighlightsHint",
          "Facts from the games in view. Click one to open its game.",
        )}
      />
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
        {cards.map((card) => (
          <UnstyledButton key={card.key} onClick={card.onClick} style={{ borderRadius: 8 }}>
            <Paper withBorder radius="md" p="sm" h="100%" className={classes.highlight}>
              <Stack gap={6}>
                <GroupLine card={card} analyzedGames={analyzedGames} />
                <Text fw={700} fz="lg" lineClamp={1}>
                  {card.value}
                </Text>
                <Text size="xs" c="dimmed" lineClamp={1}>
                  {card.detail}
                </Text>
              </Stack>
            </Paper>
          </UnstyledButton>
        ))}
        {analyzedGames === 0 && (
          <Paper withBorder radius="md" p="sm" style={{ borderStyle: "dashed" }}>
            <Stack gap={6}>
              <Text size="sm" fw={600} c="dimmed">
                {t("Players.Highlight.EngineMissingTitle", "Costliest move and biggest comeback")}
              </Text>
              <Text size="xs" c="dimmed">
                {t(
                  "Players.Highlight.EngineMissing",
                  "They need an engine analysis of the games: run one in the Analysis tab.",
                )}
              </Text>
            </Stack>
          </Paper>
        )}
      </SimpleGrid>
    </Stack>
  );
}

function GroupLine({ card, analyzedGames }: { card: Card; analyzedGames: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <ThemeIcon variant="light" color={card.color} radius="xl" size="md">
          {card.icon}
        </ThemeIcon>
        <Text size="sm" fw={600} c="dimmed" truncate>
          {card.title}
        </Text>
      </div>
      {card.engine && <EngineBadge games={analyzedGames} />}
    </div>
  );
}
