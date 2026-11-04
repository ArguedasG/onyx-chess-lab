import {
  Badge,
  Box,
  Button,
  Grid,
  Group,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  type Icon,
  IconArrowRight,
  IconBook,
  IconBook2,
  IconChess,
  IconChessKnight,
  IconClock,
  IconCrown,
  IconDatabase,
  IconFileImport,
  IconFiles,
  IconFlask,
  IconLayoutGrid,
  IconLayoutList,
  IconNotebook,
  IconPlayerPlay,
  IconPuzzle,
  IconTarget,
  IconTrophy,
  IconUsersGroup,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useAtom, useAtomValue, useSetAtom, useStore } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { type CSSProperties, type ReactNode, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import { Chessground } from "@/chessground/Chessground";
import { FileIcon } from "@/components/files/FileIcon";
import { getStats } from "@/components/files/opening";
import { StartScreenControl } from "@/components/settings/StartScreenControl";
import {
  activeTabAtom,
  addRecentFileAtom,
  deckAtomFamily,
  type RecentFile,
  recentFilesAtom,
  tabFamily,
  tabsAtom,
} from "@/state/atoms";
import { playerCardsAtom } from "@/state/playerCards";
import { trainingAreasAtom } from "@/state/trainingAreas";
import type { Tab } from "@/utils/tabs";
import { createTab } from "@/utils/tabs";
import { unwrap } from "@/utils/unwrap";
import ImportModal from "./ImportModal";
import classes from "./NewTabHome.module.css";

dayjs.extend(relativeTime);

/** The sections overview in short form, for those who already know them. */
const homeCompactAtom = atomWithStorage<boolean>("home-compact", false, undefined, {
  getOnInit: true,
});

type Destination =
  | "/players"
  | "/training/tactics"
  | "/training/openings"
  | "/training/endgames"
  | "/tournaments"
  | "/studies"
  | "/books"
  | "/databases"
  | "/files";

function RecentFileDuePositions({ file }: { file: string }) {
  const { t } = useTranslation();
  const [deck] = useAtom(deckAtomFamily({ file, game: 0 }));
  const stats = getStats(deck.positions);
  if (stats.due + stats.unseen === 0) return null;
  return (
    <Badge size="sm" variant="light" color="orange" leftSection={<IconTarget size="0.75rem" />}>
      {t("Home.Launch.Due", "{{count}} to review", { count: stats.due + stats.unseen })}
    </Badge>
  );
}

function RecentFileRow({ file, onOpen }: { file: RecentFile; onOpen: (file: RecentFile) => void }) {
  const displayName = file.name.replace(/\.pgn$/i, "");
  return (
    <UnstyledButton onClick={() => onOpen(file)} px="sm" py={6} className={classes.recentFileRow}>
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
          <Box style={{ flexShrink: 0, color: "var(--mantine-color-dimmed)" }}>
            <FileIcon type={file.type} size={18} />
          </Box>
          <Text size="sm" truncate fw={500}>
            {displayName}
          </Text>
          {file.type === "repertoire" && <RecentFileDuePositions file={file.path} />}
        </Group>
        <Tooltip label={dayjs(file.lastOpened).format("YYYY-MM-DD HH:mm")}>
          <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
            <IconClock size={14} style={{ color: "var(--mantine-color-dimmed)" }} />
            <Text size="xs" c="dimmed">
              {dayjs(file.lastOpened).fromNow()}
            </Text>
          </Group>
        </Tooltip>
      </Group>
    </UnstyledButton>
  );
}

/** A clickable section card: the whole card opens the section. */
function Tile({
  icon: TileIcon,
  color,
  title,
  description,
  badge,
  onClick,
  className = classes.tile,
  children,
}: {
  icon: Icon;
  color: string;
  title: string;
  description: string;
  badge?: string | null;
  onClick: () => void;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <UnstyledButton
      className={className}
      onClick={onClick}
      style={{ "--tile-color": `var(--mantine-color-${color}-6)` } as CSSProperties}
    >
      <Stack gap="sm" h="100%">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <ThemeIcon size={42} radius="md" variant="light" color={color}>
            <TileIcon size={24} stroke={1.6} />
          </ThemeIcon>
          <Group gap="xs" wrap="nowrap">
            {badge && (
              <Badge variant="light" color={color} size="sm">
                {badge}
              </Badge>
            )}
            <IconArrowRight size={18} className={classes.arrow} />
          </Group>
        </Group>
        <div>
          <Text fw={700} size="lg">
            {title}
          </Text>
          <Text size="sm" c="dimmed" mt={2}>
            {description}
          </Text>
        </div>
        {children}
      </Stack>
    </UnstyledButton>
  );
}

/** One line per section, for the compact overview. */
function CompactTile({
  icon: TileIcon,
  color,
  title,
  description,
  onClick,
}: {
  icon: Icon;
  color: string;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <UnstyledButton
      className={classes.compactTile}
      onClick={onClick}
      style={{ "--tile-color": `var(--mantine-color-${color}-6)` } as CSSProperties}
    >
      <Group gap="sm" wrap="nowrap">
        <ThemeIcon size={34} radius="md" variant="light" color={color}>
          <TileIcon size={19} stroke={1.6} />
        </ThemeIcon>
        <div style={{ minWidth: 0 }}>
          <Text fw={600} size="sm" truncate>
            {title}
          </Text>
          <Text size="xs" c="dimmed" truncate>
            {description}
          </Text>
        </div>
      </Group>
    </UnstyledButton>
  );
}

function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <Group justify="space-between" align="flex-end" mb="sm" gap="xs">
      <Text fw={700} size="xs" tt="uppercase" c="dimmed" style={{ letterSpacing: 0.6 }}>
        {children}
      </Text>
      {right}
    </Group>
  );
}

/**
 * The home screen (a "new" tab): the analysis board as the main action, playing next to it,
 * what was open lately, and every section of Onyx with what it is for. Opening the board or a
 * game turns this same tab into it, so no empty tab is left behind.
 */
export default function NewTabHome({ id }: { id: string }) {
  const { t } = useTranslation();
  const [openModal, setOpenModal] = useState(false);
  const setTabs = useSetAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const [recentFiles, setRecentFiles] = useAtom(recentFilesAtom);
  const [compact, setCompact] = useAtom(homeCompactAtom);
  const playerCards = useAtomValue(playerCardsAtom);
  const areas = useAtomValue(trainingAreasAtom);
  const store = useStore();
  const navigate = useNavigate();

  useEffect(() => {
    const checkFiles = async () => {
      const checked = await Promise.all(
        recentFiles.map(async (file) => {
          const exists = await commands.fileExists(file.path);
          return exists.status === "error" || !exists.data ? null : file;
        }),
      );
      const filtered = checked.filter((file) => file !== null) as RecentFile[];
      if (filtered.length !== recentFiles.length) setRecentFiles(filtered);
    };
    void checkFiles();
  }, []);

  const openRecentFile = useCallback(
    async (file: RecentFile) => {
      const pgn = unwrap(await commands.readGames(file.path, 0, 0));
      const tabId = await createTab({
        tab: { name: file.name, type: "analysis" },
        setTabs,
        setActiveTab,
        pgn: pgn[0] || "",
        reuseTabId: id,
        gameOrigin: {
          kind: "file",
          gameNumber: 0,
          file: {
            type: "file",
            name: file.name,
            path: file.path,
            numGames: 1,
            metadata: { type: file.type, tags: [] },
            lastModified: Math.floor(Date.now() / 1000),
          },
        },
      });
      if (file.type === "repertoire") store.set(tabFamily(tabId), "practice");
      store.set(addRecentFileAtom, { name: file.name, path: file.path, type: file.type });
      void navigate({ to: "/" });
    },
    [id, setTabs, setActiveTab, store, navigate],
  );

  /** Turns this tab into a board, a game or the generator. */
  const becomeTab = (type: Tab["type"], name: string) =>
    setTabs((previous) => previous.map((tab) => (tab.value === id ? { ...tab, type, name } : tab)));
  const go = (to: Destination) => () => void navigate({ to });

  const cardCount = Object.keys(playerCards.cards).length;
  const count = (value: number, one: string, many: string) =>
    value === 0 ? null : value === 1 ? one : many.replace("{{count}}", String(value));
  const tacticsSets = Object.keys(areas.tactics.sets).length;
  const repertoires = Object.keys(areas.openings.repertoires).length;
  const endgameSets = Object.keys(areas.endgames.sets).length;

  const training = [
    {
      id: "tactics",
      icon: IconPuzzle,
      color: "orange",
      title: t("Home.Launch.Tactics", "Tactics"),
      description: t(
        "Home.Launch.Tactics.Desc",
        "Puzzle sets, by theme, with timed sessions and your own mistakes.",
      ),
      badge: count(
        tacticsSets,
        t("Home.Launch.OneSet", "1 set"),
        t("Home.Launch.Sets", "{{count}} sets"),
      ),
      to: "/training/tactics" as const,
    },
    {
      id: "openings",
      icon: IconBook2,
      color: "blue",
      title: t("Home.Launch.Openings", "Openings"),
      description: t(
        "Home.Launch.Openings.Desc",
        "Build your repertoire and review it with spaced repetition.",
      ),
      badge: count(
        repertoires,
        t("Home.Launch.OneRepertoire", "1 repertoire"),
        t("Home.Launch.Repertoires", "{{count}} repertoires"),
      ),
      to: "/training/openings" as const,
    },
    {
      id: "endgames",
      icon: IconCrown,
      color: "teal",
      title: t("Home.Launch.Endgames", "Endgames"),
      description: t(
        "Home.Launch.Endgames.Desc",
        "Theoretical positions to play out against an engine or a bot.",
      ),
      badge: count(
        endgameSets,
        t("Home.Launch.OneSet", "1 set"),
        t("Home.Launch.Sets", "{{count}} sets"),
      ),
      to: "/training/endgames" as const,
    },
  ];

  const players = {
    icon: IconUsersGroup,
    color: "violet",
    title: t("Home.Launch.Players", "Players"),
    description: t(
      "Home.Launch.Players.Desc",
      "Prepare for a rival, or study your own games, from their games.",
    ),
    badge: count(
      cardCount,
      t("Home.Launch.OneCard", "1 card"),
      t("Home.Launch.Cards", "{{count}} cards"),
    ),
    steps: [
      [
        t("Home.Launch.Players.Step1", "Gather the games"),
        t("Home.Launch.Players.Step1.Desc", "From Lichess, Chess.com or your databases."),
      ],
      [
        t("Home.Launch.Players.Step2", "Understand the player"),
        t(
          "Home.Launch.Players.Step2.Desc",
          "Likely repertoire, structures, strengths and weak spots.",
        ),
      ],
      [
        t("Home.Launch.Players.Step3", "Prepare"),
        t(
          "Home.Launch.Players.Step3.Desc",
          "Lines and surprises, and a twin bot that plays like them.",
        ),
      ],
    ],
  };

  const more = [
    {
      id: "tournaments",
      icon: IconTrophy,
      color: "yellow",
      title: t("Home.Launch.Tournaments", "Tournaments"),
      description: t(
        "Home.Launch.Tournaments.Desc",
        "Play a whole tournament against bots and twins, with standings and rating.",
      ),
      onClick: go("/tournaments"),
    },
    {
      id: "studies",
      icon: IconNotebook,
      color: "cyan",
      title: t("Home.Launch.Studies", "Studies"),
      description: t(
        "Home.Launch.Studies.Desc",
        "Organise analysis, lessons and notes in chapters.",
      ),
      onClick: go("/studies"),
    },
    {
      id: "databases",
      icon: IconDatabase,
      color: "indigo",
      title: t("Home.Launch.Databases", "Databases"),
      description: t(
        "Home.Launch.Databases.Desc",
        "Your game collections: search, filter and opening reports.",
      ),
      onClick: go("/databases"),
    },
    {
      id: "books",
      icon: IconBook,
      color: "grape",
      title: t("Home.Launch.Books", "Books"),
      description: t(
        "Home.Launch.Books.Desc",
        "Your chess PDFs beside the board: diagrams read into positions.",
      ),
      onClick: go("/books"),
    },
    {
      id: "laboratory",
      icon: IconFlask,
      color: "pink",
      title: t("ModelGame.Title", "Model Game Generator"),
      description: t(
        "Home.Launch.Laboratory.Desc",
        "Engine games from any position, to see how it is played.",
      ),
      onClick: () => becomeTab("generator", t("ModelGame.Title", "Model Game Generator")),
    },
  ];

  return (
    <ScrollArea h="100%" type="auto">
      <ImportModal
        openModal={openModal}
        setOpenModal={setOpenModal}
        setTabs={setTabs}
        setActiveTab={setActiveTab}
      />
      <Stack gap="xl" className={classes.page}>
        <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
          <div>
            <Title order={2}>Onyx Chess Lab</Title>
            <Text c="dimmed" size="sm" mt={2}>
              {t(
                "Home.Launch.Tagline",
                "Analyse, prepare for your rivals and train, all on your computer.",
              )}
            </Text>
          </div>
          <Group gap="xs" wrap="nowrap">
            <Text size="xs" c="dimmed">
              {t("Home.Launch.OpenOn", "When Onyx opens:")}
            </Text>
            <StartScreenControl size="xs" />
          </Group>
        </Group>

        <Grid gutter="md">
          <Grid.Col span={{ base: 12, md: 8 }}>
            <div className={classes.hero}>
              <Group justify="space-between" wrap="nowrap" gap="xl" h="100%">
                <Stack gap="md" justify="space-between" h="100%">
                  <div>
                    <Badge variant="light" mb="sm">
                      {t("Home.Launch.Main", "Start here")}
                    </Badge>
                    <Title order={3}>{t("Home.Card.AnalysisBoard.Title")}</Title>
                    <Text c="dimmed" mt={6} maw={460}>
                      {t(
                        "Home.Launch.Board.Desc",
                        "Analyse games and positions with the engine, the opening explorer, your databases and notes.",
                      )}
                    </Text>
                  </div>
                  <Group gap="xs" wrap="wrap">
                    <Button
                      size="md"
                      leftSection={<IconChessKnight size={18} />}
                      onClick={() => becomeTab("analysis", "Home.Card.AnalysisBoard.Title")}
                    >
                      {t("Home.Launch.OpenBoard", "Open the board")}
                    </Button>
                    <Button
                      size="md"
                      variant="default"
                      leftSection={<IconFileImport size={18} />}
                      onClick={() => setOpenModal(true)}
                    >
                      {t("Home.Launch.Import", "Import PGN or FEN")}
                    </Button>
                    <Button
                      size="md"
                      variant="subtle"
                      leftSection={<IconFiles size={18} />}
                      onClick={go("/files")}
                    >
                      {t("Home.Launch.Files", "My files")}
                    </Button>
                  </Group>
                </Stack>
                <Box className={classes.heroBoard} visibleFrom="sm">
                  <Chessground viewOnly coordinates={false} />
                </Box>
              </Group>
            </div>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Tile
              icon={IconPlayerPlay}
              color="green"
              title={t("Home.Card.PlayChess.Title")}
              description={t(
                "Home.Launch.Play.Desc",
                "Against bots that play like people, an engine or a friend, with a clock.",
              )}
              onClick={() => becomeTab("play", t("Home.NewGame"))}
            >
              <Box mt="auto">
                <Button
                  component="span"
                  variant="light"
                  color="green"
                  fullWidth
                  leftSection={<IconChess size={16} />}
                >
                  {t("Home.Launch.NewGame", "New game")}
                </Button>
              </Box>
            </Tile>
          </Grid.Col>
        </Grid>

        {recentFiles.length > 0 && (
          <div className={classes.panel}>
            <SectionTitle>{t("Home.Launch.Continue", "Continue")}</SectionTitle>
            <ScrollArea.Autosize mah={220}>
              <Stack gap={2}>
                {recentFiles.slice(0, 8).map((file) => (
                  <RecentFileRow key={file.path} file={file} onOpen={openRecentFile} />
                ))}
              </Stack>
            </ScrollArea.Autosize>
          </div>
        )}

        <div>
          <SectionTitle
            right={
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                leftSection={compact ? <IconLayoutGrid size={14} /> : <IconLayoutList size={14} />}
                onClick={() => setCompact((value) => !value)}
              >
                {compact
                  ? t("Home.Launch.Detailed", "Detailed view")
                  : t("Home.Launch.Compact", "Compact view")}
              </Button>
            }
          >
            {t("Home.Launch.Everything", "Everything in Onyx")}
          </SectionTitle>

          {compact ? (
            <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="sm">
              {training.map((item) => (
                <CompactTile key={item.id} {...item} onClick={go(item.to)} />
              ))}
              <CompactTile {...players} onClick={go("/players")} />
              {more.map((item) => (
                <CompactTile key={item.id} {...item} />
              ))}
            </SimpleGrid>
          ) : (
            <Stack gap="md">
              <div className={classes.panel}>
                <Group gap="sm" wrap="nowrap" mb="md">
                  <ThemeIcon size={42} radius="md" variant="light" color="orange">
                    <IconTarget size={24} stroke={1.6} />
                  </ThemeIcon>
                  <div>
                    <Text fw={700} size="lg">
                      {t("Home.Launch.Training", "Training")}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {t(
                        "Home.Launch.Training.Desc",
                        "Practise what you need: calculation, your openings or endgame technique.",
                      )}
                    </Text>
                  </div>
                </Group>
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                  {training.map((item) => (
                    <Tile
                      key={item.id}
                      {...item}
                      className={classes.subTile}
                      onClick={go(item.to)}
                    />
                  ))}
                </SimpleGrid>
              </div>

              <Tile {...players} onClick={go("/players")}>
                <Group gap="md" wrap="wrap" mt={4} align="stretch">
                  {players.steps.map(([step, detail], index) => (
                    <div
                      key={step}
                      className={classes.step}
                      style={{ "--tile-color": "var(--mantine-color-violet-6)" } as CSSProperties}
                    >
                      <Text size="xs" c="violet" fw={700}>
                        {`${index + 1}`}
                      </Text>
                      <Text size="sm" fw={600}>
                        {step}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {detail}
                      </Text>
                    </div>
                  ))}
                </Group>
              </Tile>

              <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 5 }} spacing="md">
                {more.map((item) => (
                  <Tile key={item.id} {...item} />
                ))}
              </SimpleGrid>
            </Stack>
          )}
        </div>
      </Stack>
    </ScrollArea>
  );
}
