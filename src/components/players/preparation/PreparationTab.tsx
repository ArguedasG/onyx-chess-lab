import {
  Button,
  Center,
  Group,
  Loader,
  Menu,
  NavLink,
  Paper,
  ScrollArea,
  Stack,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconBulb,
  IconDots,
  IconDownload,
  IconFocus2,
  IconGitCompare,
  IconGridDots,
  IconRobot,
  IconSitemap,
  IconTarget,
  IconWand,
} from "@tabler/icons-react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { useAtom, useAtomValue } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import useSWR from "swr";
import { storedDocumentDirAtom } from "@/state/atoms";
import type { PlayerEngineAnalysis } from "@/utils/playerAnalysis";
import { gamesKey, lineFens, loadPlayerBooks, mainLine, START_FEN } from "@/utils/preparation/book";
import { howToPlay } from "@/utils/preparation/howToPlay";
import { preparationPackage } from "@/utils/preparation/package";
import type { ProfileGame } from "@/utils/players/profileGames";
import { ratingSummaries } from "@/utils/players/results";
import { playUci } from "@/utils/repertoireGenerator/positions";
import type { GeneratorColor } from "@/utils/repertoireGenerator/types";
import RepertoireGeneratorModal, {
  type GeneratorLine,
} from "../../generator/RepertoireGeneratorModal";
import BookExplorer from "./BookExplorer";
import { useOpenLine } from "./common";
import HowToPlaySection from "./HowToPlaySection";
import KeyPositionsSection from "./KeyPositionsSection";
import { colorName, structureName } from "./labels";
import RepertoireRealitySection from "./RepertoireRealitySection";
import StructuresSection from "./StructuresSection";
import TwinSection from "./TwinSection";

export type PreparationSection = "howTo" | "book" | "key" | "structures" | "reality" | "twin";
type Section = PreparationSection;

export const preparationSectionAtom = atomWithStorage<Section>(
  "player-preparation-section",
  "howTo",
);

type GeneratorRequest = {
  mode: "repertoire" | "surprises";
  path: string[];
  color: GeneratorColor;
};

/** Steps of a line from the start, as the generator's surprise finder wants them. */
function stepsOf(path: readonly string[]): GeneratorLine {
  const steps: GeneratorLine = [];
  let fen = START_FEN;
  for (const uci of path) {
    const next = playUci(fen, uci);
    if (!next) break;
    steps.push({ fen, played: { uci: next.uci, san: next.san } });
    fen = next.fen;
  }
  steps.push({ fen });
  return steps;
}

/**
 * Preparation tab of a player card (8.6). A rival: how to play against them, their likely
 * repertoire, key positions, structures, the user's repertoire against their games and their
 * twin. The user's own card: the same tools pointed at their own games.
 */
export default function PreparationTab({
  games,
  twinGames,
  name,
  cardId,
  profileId,
  isSelf,
  engine,
  onOpenGame,
}: {
  games: ProfileGame[];
  /** The games with every rhythm, for the twin's profiles. */
  twinGames: ProfileGame[];
  name: string;
  cardId: string;
  profileId: string;
  isSelf: boolean;
  engine: PlayerEngineAnalysis | null;
  onOpenGame: (game: ProfileGame, ply: number | null) => void;
}) {
  const { t } = useTranslation();
  const [stored, setSection] = useAtom(preparationSectionAtom);
  const section: Section = isSelf && stored === "howTo" ? "book" : stored;
  const [generator, setGenerator] = useState<GeneratorRequest | null>(null);
  const documentDir = useAtomValue(storedDocumentDirAtom);
  const {
    data: books,
    error,
    isLoading,
  } = useSWR(
    games.length ? ["player-books", cardId, gamesKey(games)] : null,
    () => loadPlayerBooks(games),
    { revalidateOnFocus: false, revalidateIfStale: false },
  );
  const openLine = useOpenLine({ profileId, playerName: name, books });
  const verdict = useMemo(() => howToPlay(games, engine), [engine, games]);
  // The rating of the most played time control, for Maia and the difficulty.
  const elo = useMemo(() => ratingSummaries(games)[0]?.current ?? 1500, [games]);

  const sections: Array<{
    value: Section;
    label: string;
    icon: React.ReactNode;
    hidden?: boolean;
  }> = [
    {
      value: "howTo",
      label: t("Preparation.Nav.HowTo", "How to play"),
      icon: <IconTarget size={16} />,
      hidden: isSelf,
    },
    {
      value: "book",
      label: t("Preparation.Nav.Book", "Likely repertoire"),
      icon: <IconSitemap size={16} />,
    },
    {
      value: "key",
      label: t("Preparation.Nav.Key", "Key positions"),
      icon: <IconFocus2 size={16} />,
    },
    {
      value: "structures",
      label: t("Preparation.Nav.Structures", "Structures"),
      icon: <IconGridDots size={16} />,
    },
    {
      value: "reality",
      label: isSelf
        ? t("Preparation.Nav.RealitySelf", "Repertoire vs. games")
        : t("Preparation.Nav.Reality", "Against my repertoire"),
      icon: <IconGitCompare size={16} />,
    },
    {
      value: "twin",
      label: t("Preparation.Nav.Twin", "Twin bot"),
      icon: <IconRobot size={16} />,
    },
  ];

  async function exportPackage() {
    if (!books) return;
    const lines: string[] = [];
    lines.push(
      t("Preparation.Package.Header", "Preparation for {{name}} from {{count}} games ({{date}}).", {
        name,
        count: games.length,
        date: new Date().toLocaleDateString(),
      }),
    );
    for (const color of ["white", "black"] as const) {
      const weak = verdict.weakOpenings[color].map(
        (item) => `${item.name} (${item.bucket.games}, ${(item.bucket.parDelta ?? 0).toFixed(1)})`,
      );
      if (weak.length)
        lines.push(
          t("Preparation.Package.Weak", "With {{color}}, below par: {{items}}.", {
            color: colorName(color, t).toLowerCase(),
            items: weak.join("; "),
          }),
        );
    }
    for (const item of verdict.weakStructures)
      lines.push(
        t(
          "Preparation.Package.Structure",
          "Below par in {{structure}} ({{role}}): {{games}} games.",
          {
            structure: structureName(item.structure, t),
            role:
              item.role === "own"
                ? t("Preparation.Structures.With", "With it").toLowerCase()
                : t("Preparation.Structures.Against", "Against it").toLowerCase(),
            games: item.bucket.games,
          },
        ),
      );
    if (verdict.verdict === "playYourRepertoire")
      lines.push(
        t("Preparation.Package.PlayYour", "Nothing clearly below par: play your repertoire."),
      );
    lines.push(
      t(
        "Preparation.Package.Caution",
        "A summary of trends in past games, not a certainty: check every line.",
      ),
    );
    const pgn = preparationPackage({
      name,
      books,
      summary: lines.join(" "),
      titles: {
        summary: t("Preparation.Package.Summary", "Summary"),
        white: t("Preparation.Package.WithWhite", "Likely repertoire with White"),
        black: t("Preparation.Package.WithBlack", "Likely repertoire with Black"),
      },
      legend: t(
        "Preparation.Package.Legend",
        "Moves of {{name}}'s games. Each comment: games / games in the position · score of {{name}} · rating par · last game.",
        { name },
      ),
      date: new Date().toISOString().slice(0, 10).replaceAll("-", "."),
    });
    const path = await save({
      defaultPath: `${name.replace(/[\\/:*?"<>|]/g, "_")} - ${t("Preparation.Package.File", "preparation")}.pgn`,
      filters: [{ name: "PGN", extensions: ["pgn"] }],
    });
    if (!path) return;
    try {
      await writeTextFile(path, pgn);
      notifications.show({
        color: "green",
        message: t("Preparation.Package.Saved", "Preparation package saved."),
      });
    } catch (reason) {
      notifications.show({
        color: "red",
        message: reason instanceof Error ? reason.message : String(reason),
      });
    }
  }

  const userColor: GeneratorColor = books
    ? isSelf
      ? books.white.games >= books.black.games
        ? "white"
        : "black"
      : books.white.games >= books.black.games
        ? "black"
        : "white"
    : "white";

  const generatorProps = useMemo(() => {
    if (!generator || !books) return null;
    const fens = lineFens(generator.path);
    const rootFen = fens.at(-1) ?? START_FEN;
    const rivalColor = generator.color === "white" ? "black" : "white";
    // Against a rival the surprises follow their most played continuation of the line.
    const line =
      generator.mode === "surprises" && !isSelf
        ? mainLine(books[rivalColor], generator.path)
        : generator.mode === "surprises"
          ? mainLine(books[generator.color], generator.path)
          : stepsOf(generator.path);
    return { rootFen, rootMoves: generator.path, line };
  }, [books, generator, isSelf]);

  return (
    <Group align="stretch" gap="md" wrap="nowrap" h="100%" style={{ minHeight: 0 }}>
      {generator && generatorProps && books && (
        <RepertoireGeneratorModal
          opened
          onClose={() => setGenerator(null)}
          startFen={START_FEN}
          rootFen={generatorProps.rootFen}
          rootMoves={generatorProps.rootMoves}
          line={generatorProps.line}
          documentDir={documentDir}
          initialMode={generator.mode}
          initialColor={generator.color}
          rival={isSelf ? undefined : { name, elo, books }}
        />
      )}

      <Paper withBorder radius="md" p="xs" w={240} style={{ flexShrink: 0 }}>
        <Stack gap={4} h="100%">
          {sections
            .filter((item) => !item.hidden)
            .map((item) => (
              <NavLink
                key={item.value}
                active={section === item.value}
                label={item.label}
                leftSection={item.icon}
                onClick={() => setSection(item.value)}
                style={{ borderRadius: 8 }}
              />
            ))}
          <div style={{ flex: 1 }} />
          {!isSelf && (
            <Button
              variant="light"
              leftSection={<IconWand size={16} />}
              fullWidth
              h="auto"
              py={8}
              styles={{ label: { whiteSpace: "normal", textAlign: "left", lineHeight: 1.3 } }}
              disabled={!books}
              onClick={() => setGenerator({ mode: "repertoire", path: [], color: userColor })}
            >
              {t("Preparation.Generate", "Lines against them")}
            </Button>
          )}
          <Menu position="top-start" withinPortal>
            <Menu.Target>
              <Button variant="subtle" color="gray" rightSection={<IconDots size={14} />}>
                {t("Preparation.More", "More")}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {!isSelf && (
                <Menu.Item
                  leftSection={<IconBulb size={14} />}
                  disabled={!books}
                  onClick={() => setGenerator({ mode: "surprises", path: [], color: userColor })}
                >
                  {t("Preparation.Surprises", "Surprises against them")}
                </Menu.Item>
              )}
              <Menu.Item
                leftSection={<IconDownload size={14} />}
                disabled={!books}
                onClick={() => void exportPackage()}
              >
                {t("Preparation.Package.Export", "Export preparation (PGN)")}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Stack>
      </Paper>

      <ScrollArea style={{ flex: 1, minWidth: 0 }} offsetScrollbars>
        {games.length === 0 ? (
          <Center h={200}>
            <Text c="dimmed">
              {t("Players.NoGamesInFilter", "No games match the current filters.")}
            </Text>
          </Center>
        ) : section === "howTo" ? (
          <HowToPlaySection data={verdict} name={name} />
        ) : section === "structures" ? (
          <StructuresSection games={games} name={name} onOpenGame={onOpenGame} />
        ) : error ? (
          <Text c="red">{error instanceof Error ? error.message : String(error)}</Text>
        ) : isLoading || !books ? (
          <Center h={200}>
            <Stack align="center" gap="xs">
              <Loader />
              <Text size="sm" c="dimmed">
                {t("Preparation.Loading", "Building the opening tree…")}
              </Text>
            </Stack>
          </Center>
        ) : section === "book" ? (
          <BookExplorer
            books={books}
            name={name}
            isSelf={isSelf}
            onOpenLine={(moves) =>
              void openLine(moves, `${name} · ${t("Preparation.Nav.Book", "Likely repertoire")}`)
            }
            onGenerate={(path, color) => setGenerator({ mode: "repertoire", path, color })}
            onSurprises={(path, color) => setGenerator({ mode: "surprises", path, color })}
          />
        ) : section === "key" ? (
          <KeyPositionsSection
            books={books}
            name={name}
            isSelf={isSelf}
            defaultElo={elo}
            onOpenLine={(moves) =>
              void openLine(moves, `${name} · ${t("Preparation.Nav.Key", "Key positions")}`)
            }
          />
        ) : section === "reality" ? (
          <RepertoireRealitySection
            books={books}
            name={name}
            isSelf={isSelf}
            onOpenLine={(moves) => void openLine(moves, name)}
          />
        ) : (
          <TwinSection games={twinGames} name={name} cardId={cardId} />
        )}
      </ScrollArea>
    </Group>
  );
}
