import {
  Alert,
  Badge,
  Button,
  Grid,
  Group,
  Paper,
  Progress,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";
import MaiaRequiredAlert from "@/components/common/MaiaRequiredAlert";
import { Modal } from "@/components/common/Modal";
import { notifications } from "@mantine/notifications";
import {
  IconBook2,
  IconBulb,
  IconChessKnight,
  IconPlayerStop,
  IconSparkles,
  IconWand,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import useSWR from "swr";
import { commands } from "@/bindings";
import { activeTabAtom, enginesAtom, sessionsAtom, tabsAtom } from "@/state/atoms";
import {
  DEFAULT_GENERATOR_SETTINGS,
  DEFAULT_RIVAL_GENERATOR_SETTINGS,
  type RepertoireGeneratorSettings,
  repertoireGeneratorRivalSettingsAtom,
  repertoireGeneratorSettingsAtom,
} from "@/state/repertoireGenerator";
import { trainingAreasAtom } from "@/state/trainingAreas";
import { getDatabases } from "@/utils/db";
import type { LocalEngine } from "@/utils/engines";
import { gameLinkLabel, pliesReachingPosition } from "@/utils/gameLinks";
import { clampMaiaElo, isMaiaEngine } from "@/utils/humanBots";
import { bookSource, mainLine, type PlayerBooks } from "@/utils/preparation/book";
import { type ModelGameLabels, repertoirePgn, surprisesPgn } from "@/utils/repertoireGenerator/pgn";
import { sideToMove } from "@/utils/repertoireGenerator/positions";
import { createGeneratedRepertoire } from "@/utils/repertoireGenerator/save";
import type { Surprise } from "@/utils/repertoireGenerator/surprises";
import type {
  GeneratedNode,
  GeneratedRepertoire,
  GeneratorColor,
} from "@/utils/repertoireGenerator/types";
import { createTab } from "@/utils/tabs";
import { unwrap } from "@/utils/unwrap";
import {
  FocusCards,
  OpponentAndLimits,
  SourceSettings,
  useFocusLabels,
} from "./GeneratorSettingsPanel";
import { GeneratedTreeView, ResultSummary, SurpriseTable } from "./GeneratorResults";
import { useGeneratorRun } from "./useGeneratorRun";

export type GeneratorLine = Array<{ fen: string; played?: { uci: string; san: string } }>;

/** Preparation against a rival (8.6, I-41): their games are the statistics of the generator. */
export type GeneratorRival = {
  name: string;
  /** Rating used for Maia and for the difficulty of the positions. */
  elo: number;
  books: PlayerBooks;
};

function formatSeconds(ms: number) {
  return ms < 60_000
    ? `${Math.round(ms / 1000)} s`
    : `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}

/**
 * Repertoire generator (I-40) and surprise finder (after Sadler's Novelty Grinder), from the
 * position on the board. Both show what they would do before anything is saved.
 */
export default function RepertoireGeneratorModal({
  opened,
  onClose,
  startFen,
  rootFen,
  rootMoves,
  line,
  documentDir,
  initialMode = "repertoire",
  initialColor,
  rival,
}: {
  opened: boolean;
  onClose: () => void;
  /** First position of the board (the game's start). */
  startFen: string;
  /** Position on the board and the moves from the start to it. */
  rootFen: string;
  rootMoves: string[];
  /** The board's line, for the surprise finder. */
  line: GeneratorLine;
  documentDir: string;
  initialMode?: "repertoire" | "surprises";
  /** The side the user plays; by default the side to move on the board. */
  initialColor?: GeneratorColor;
  rival?: GeneratorRival;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const focusLabels = useFocusLabels();
  const [storedGeneral, setStoredGeneral] = useAtom(repertoireGeneratorSettingsAtom);
  const [storedRival, setStoredRival] = useAtom(repertoireGeneratorRivalSettingsAtom);
  const defaults = rival ? DEFAULT_RIVAL_GENERATOR_SETTINGS : DEFAULT_GENERATOR_SETTINGS;
  const stored = rival ? storedRival : storedGeneral;
  const setStored = rival ? setStoredRival : setStoredGeneral;
  const settings: RepertoireGeneratorSettings = { ...defaults, ...stored };
  const update = (change: Partial<RepertoireGeneratorSettings>) =>
    setStored((previous) => ({ ...defaults, ...previous, ...change }));
  const [mode, setMode] = useState(initialMode);
  const [color, setColor] = useState<GeneratorColor>(initialColor ?? sideToMove(rootFen));
  const rivalColor: GeneratorColor = color === "white" ? "black" : "white";
  const rivalBook = rival ? rival.books[rivalColor] : null;
  const rivalLabel = rival
    ? t("Generator.Rival.Source", "Games of {{name}} with {{color}}", {
        name: rival.name,
        color: (rivalColor === "white"
          ? t("Fen.White", "White")
          : t("Fen.Black", "Black")
        ).toLowerCase(),
      })
    : "";
  // Against a rival without a board line, the surprises follow their most played line.
  const surpriseLine = useMemo(
    () => (rivalBook && line.length <= 1 ? mainLine(rivalBook) : line),
    [line, rivalBook],
  );
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const engines = useAtomValue(enginesAtom);
  const sessions = useAtomValue(sessionsAtom);
  const setTrainingAreas = useSetAtom(trainingAreasAtom);
  const setTabs = useSetAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const { state, setState, runRepertoire, runSurprises, stop } = useGeneratorRun();
  const token = sessions.find((session) => session.lichess?.accessToken)?.lichess?.accessToken;

  useEffect(() => {
    if (opened) setMode(initialMode);
  }, [initialMode, opened]);
  useEffect(() => {
    if (opened && initialColor) setColor(initialColor);
  }, [initialColor, opened]);
  // Against a rival, Maia and the difficulty use the rival's rating.
  const rivalElo = rival ? clampMaiaElo(rival.elo) : null;
  useEffect(() => {
    if (opened && rivalElo != null)
      setStoredRival((previous) => ({
        ...DEFAULT_RIVAL_GENERATOR_SETTINGS,
        ...previous,
        opponent: {
          ...DEFAULT_RIVAL_GENERATOR_SETTINGS.opponent,
          ...previous.opponent,
          elo: rivalElo,
        },
      }));
  }, [opened, rivalElo, setStoredRival]);

  const { data: databases = [] } = useSWR(opened ? "generator-databases" : null, async () =>
    (await getDatabases()).flatMap((database) =>
      database.type === "success"
        ? [{ path: database.file, title: database.title || database.filename }]
        : [],
    ),
  );
  const localEngines = useMemo(
    () => (engines ?? []).filter((engine): engine is LocalEngine => engine.type === "local"),
    [engines],
  );
  const referenceEngines = localEngines.filter((engine) => !isMaiaEngine(engine));
  const maia = localEngines.find((engine) => isMaiaEngine(engine));
  const engine =
    referenceEngines.find((candidate) => candidate.id === settings.engineId) ?? referenceEngines[0];
  const running = state.status === "running";
  const sourceNeedsToken = !rival && settings.source.kind !== "local";
  const canRun = Boolean(engine) && (!sourceNeedsToken || Boolean(token)) && !running;

  const start = () => {
    if (!engine) return;
    const engineSetup = {
      engine,
      maia,
      maiaElo: settings.opponent.elo,
      token,
      preloaded: rivalBook ? bookSource(rivalBook, rivalLabel) : undefined,
    };

    if (mode === "repertoire") {
      void runRepertoire(
        {
          rootFen,
          rootMoves,
          color,
          focus: settings.focus,
          source: settings.source,
          opponent: settings.opponent,
          depth: settings.depth,
          minGames: settings.minGames,
          maxLoss: settings.maxLoss,
          surpriseShare: settings.surpriseShare,
          engineMs: settings.engineMs,
          maxPositions: settings.maxPositions,
        },
        engineSetup,
      );
    } else {
      void runSurprises(
        {
          line: surpriseLine,
          color: settings.surprises.mySideOnly ? color : null,
          firstMove: settings.surprises.firstMove,
          stopGames: settings.surprises.stopGames,
          maxShare: settings.surprises.maxShare,
          maxLoss: settings.surprises.maxLoss,
        },
        settings.source,
        { ...engineSetup, engineMs: settings.engineMs },
      );
    }
  };

  const sourceLabel = rival
    ? rivalLabel
    : settings.source.kind === "local"
      ? settings.source.databaseTitle
      : settings.source.kind === "masters"
        ? "Lichess Masters"
        : `Lichess ${settings.source.ratings.join("/")}`;

  const provenance = (result: GeneratedRepertoire) =>
    t(
      "Generator.Provenance",
      "Generated by Onyx on {{date}} from {{source}}. Focus: {{focus}}. Opponent: {{opponent}}. Engine: {{engine}}, {{ms}} ms per position, at most {{loss}} cp from its best move. Depth {{depth}} half-moves, {{games}} games to trust a move.",
      {
        date: new Date(result.generatedAt).toLocaleString(),
        source: result.sourceSummary,
        focus: focusLabels[result.config.focus].title,
        opponent:
          result.config.opponent.mode === "maia"
            ? `Maia ${result.config.opponent.elo}`
            : t("Generator.Opponent.PopularShort", "most played, up to {{count}}", {
                count: result.config.opponent.maxReplies,
              }),
        engine: result.engineName,
        ms: result.config.engineMs,
        loss: result.config.maxLoss,
        depth: result.config.depth,
        games: result.config.minGames,
      },
    );

  /** Labels and plies of the local model games, so their links open at the right move. */
  async function modelGameLabels(result: GeneratedRepertoire): Promise<ModelGameLabels> {
    const labels: ModelGameLabels = new Map();
    const wanted: Array<{ node: GeneratedNode; depth: number }> = [];
    const visit = (node: GeneratedNode, depth: number) => {
      if (node.modelGame?.kind === "local") wanted.push({ node, depth });
      node.children.forEach((child) => visit(child, depth + 1));
    };
    visit(result.root, 0);
    for (const { node, depth } of wanted.slice(0, 60)) {
      const game = node.modelGame;
      if (game?.kind !== "local" || labels.has(game.gameId)) continue;
      try {
        const response = unwrap(
          await commands.getGames(game.databasePath, {
            game_id: game.gameId,
            options: { page: 1, pageSize: 1, skipCount: true, sort: "id", direction: "asc" },
          }),
        );
        const full = response.data[0];
        if (!full) continue;
        const plies = pliesReachingPosition(
          full.moves,
          full.fen,
          node.fen,
          rootMoves.length + depth,
        );
        labels.set(game.gameId, { label: gameLinkLabel(full), ply: plies[0] ?? 0 });
      } catch {
        // A model game that cannot be read is simply not linked.
      }
    }
    return labels;
  }

  async function buildPgn(result: GeneratedRepertoire, title: string) {
    return repertoirePgn(result, {
      name: title,
      startFen,
      provenance: provenance(result),
      labels: await modelGameLabels(result),
      t,
    });
  }

  const defaultName = () =>
    `${focusLabels[settings.focus].title} · ${color === "white" ? t("Fen.White", "White") : t("Fen.Black", "Black")}`;

  async function saveRepertoire(result: GeneratedRepertoire) {
    setSaving(true);
    try {
      const title = name.trim() || defaultName();
      const pgn = await buildPgn(result, title);
      const add = await createGeneratedRepertoire({
        name: title,
        description: provenance(result),
        color: result.config.color,
        pgn,
        documentDir,
      });
      setTrainingAreas((current) => ({ ...current, openings: add(current.openings) }));
      notifications.show({
        color: "green",
        title: t("Generator.Saved", "Repertoire created"),
        message: t(
          "Generator.SavedHint",
          "Find it in Training → Openings, ready to review and learn.",
        ),
      });
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  }

  async function openPgn(pgn: string, title: string, plies: number) {
    await createTab({
      tab: { name: title, type: "analysis" },
      pgn,
      setTabs,
      setActiveTab,
      position: Array(plies).fill(0),
      preserveNewTab: true,
    });
    onClose();
    navigate({ to: "/" });
  }

  const openSurprise = (surprise: Surprise) => {
    const prefix: GeneratorLine = [
      ...surpriseLine.slice(0, surprise.index),
      { fen: surprise.fen, played: { uci: surprise.uci, san: surprise.san } },
    ];
    const pgn = surprisesPgn(prefix, [], {
      name: `${t("Generator.Surprises.Title", "Surprises")}: ${surprise.san}`,
      startFen,
      elo: settings.opponent.elo,
      provenance: sourceLabel,
      t,
    });
    void openPgn(pgn, surprise.san, prefix.length);
  };

  const progress = state.status === "running" ? state.progress : null;
  const phaseText = progress
    ? {
        source: t("Generator.Phase.Source", "Reading the statistics…"),
        engine: t("Generator.Phase.Engine", "Checking moves with the engine…"),
        maia: t("Generator.Phase.Maia", "Asking Maia how an opponent would reply…"),
        tree: t("Generator.Phase.Tree", "Building the tree…"),
        done: t("Generator.Phase.Done", "Done"),
      }[progress.phase]
    : "";

  return (
    <Modal
      opened={opened}
      onClose={() => {
        stop();
        onClose();
      }}
      size="95%"
      centered
      title={
        <Group gap="sm">
          <ThemeIcon variant="light" radius="md">
            <IconWand size={18} />
          </ThemeIcon>
          <Title order={4}>{t("Generator.Title", "Repertoire generator")}</Title>
        </Group>
      }
    >
      <Stack gap="md">
        <Group justify="space-between" wrap="wrap">
          <SegmentedControl
            value={mode}
            onChange={(value) => {
              setMode(value as typeof mode);
              setState({ status: "idle" });
            }}
            disabled={running}
            data={[
              {
                value: "repertoire",
                label: t("Generator.Mode.Repertoire", "Generate a repertoire"),
              },
              { value: "surprises", label: t("Generator.Mode.Surprises", "Find surprises") },
            ]}
          />
          <Group gap="xs">
            <Text size="sm" c="dimmed">
              {t("Generator.Play", "I play")}
            </Text>
            <SegmentedControl
              size="xs"
              value={color}
              disabled={running}
              onChange={(value) => setColor(value as GeneratorColor)}
              data={[
                { value: "white", label: t("Fen.White", "White") },
                { value: "black", label: t("Fen.Black", "Black") },
              ]}
            />
          </Group>
        </Group>
        <Text size="sm" c="dimmed">
          {mode === "repertoire"
            ? t(
                "Generator.Mode.RepertoireHint",
                "From the board position: one move of yours in each position, chosen by the focus and checked by the engine, and the opponent's likely replies.",
              )
            : t(
                "Generator.Mode.SurprisesHint",
                "Along the board line: moves the engine keeps close to its best that the source rarely or never plays, the hardest for the opponent first. Idea from Matthew Sadler's Novelty Grinder.",
              )}
        </Text>

        <Grid gutter="md">
          <Grid.Col span={{ base: 12, md: 5 }}>
            <ScrollArea.Autosize mah="62vh" offsetScrollbars>
              <Stack gap="sm">
                <Paper withBorder radius="md" p="sm">
                  {rival && rivalBook ? (
                    <Stack gap={4}>
                      <Text size="sm" fw={600}>
                        {t("Generator.Rival.Title", "Against {{name}}", { name: rival.name })}
                      </Text>
                      <Text size="sm">
                        {`${rivalLabel} · ${t("Players.GamesCount", "{{count}} games", { count: rivalBook.games })}`}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {t(
                          "Generator.Rival.Hint",
                          "Their replies come from their games (Maia at {{elo}} where they have too few). Your moves are chosen by how {{name}} did against each one, always checked with the engine.",
                          { name: rival.name, elo: settings.opponent.elo },
                        )}
                      </Text>
                    </Stack>
                  ) : (
                    <SourceSettings
                      source={settings.source}
                      onChange={(source) => update({ source })}
                      databases={databases}
                      hasToken={Boolean(token)}
                    />
                  )}
                </Paper>
                {mode === "repertoire" && (
                  <Paper withBorder radius="md" p="sm">
                    <Stack gap="xs">
                      <Text size="sm" fw={600}>
                        {t("Generator.FocusTitle", "How to choose my moves")}
                      </Text>
                      <FocusCards
                        value={settings.focus}
                        onChange={(focus) => update({ focus })}
                        maiaAvailable={Boolean(maia)}
                      />
                    </Stack>
                  </Paper>
                )}
                <OpponentAndLimits
                  settings={settings}
                  update={update}
                  engines={referenceEngines}
                  maiaAvailable={Boolean(maia)}
                  mode={mode}
                />
              </Stack>
            </ScrollArea.Autosize>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 7 }}>
            <Paper withBorder radius="md" p="md" h="100%">
              <Stack gap="md" h="100%">
                {!engine && (
                  <Alert color="yellow">
                    {t(
                      "Generator.NoEngine",
                      "Install a reference engine such as Stockfish in Engines.",
                    )}
                  </Alert>
                )}
                {!maia && (
                  <MaiaRequiredAlert color="gray">
                    {t(
                      "Generator.NoMaia",
                      "Maia 3 is not installed: replies and difficulty come only from the games of the source.",
                    )}
                  </MaiaRequiredAlert>
                )}
                <Group>
                  <Button
                    leftSection={
                      mode === "repertoire" ? <IconSparkles size={16} /> : <IconBulb size={16} />
                    }
                    onClick={start}
                    disabled={!canRun}
                    loading={running}
                  >
                    {mode === "repertoire"
                      ? t("Generator.Run", "Generate")
                      : t("Generator.Surprises.Run", "Find surprises")}
                  </Button>
                  {running && (
                    <Button
                      variant="default"
                      leftSection={<IconPlayerStop size={16} />}
                      onClick={stop}
                    >
                      {t("Common.Cancel", "Cancel")}
                    </Button>
                  )}
                </Group>

                {state.status === "running" && (
                  <Stack gap={4}>
                    <Progress value={100} animated striped />
                    <Text size="xs" c="dimmed">
                      {phaseText}
                      {progress && progress.positions > 0
                        ? ` · ${t("Generator.Positions", "{{count}} positions", { count: progress.positions })}`
                        : ""}
                    </Text>
                  </Stack>
                )}
                {state.status === "error" && <Alert color="red">{state.message}</Alert>}
                {state.status === "idle" && (
                  <Text size="sm" c="dimmed">
                    {t(
                      "Generator.Idle",
                      "Choose the settings and run it. Nothing is saved until you create the repertoire or open the result.",
                    )}
                  </Text>
                )}

                {state.status === "repertoire" && (
                  <Stack gap="sm">
                    <ResultSummary
                      items={[
                        { label: t("Generator.Lines", "Lines"), value: String(state.result.lines) },
                        {
                          label: t("Generator.PositionsLabel", "Positions"),
                          value: String(state.result.positions),
                        },
                        {
                          label: t("Generator.Time", "Time"),
                          value: formatSeconds(state.elapsedMs),
                        },
                        {
                          label: t("Generator.Source", "Statistics"),
                          value: state.result.sourceSummary,
                        },
                      ]}
                    />
                    <GeneratedTreeView result={state.result} />
                    {state.result.root.children.length > 0 && (
                      <Group align="flex-end" wrap="wrap">
                        <TextInput
                          style={{ flex: 1, minWidth: 220 }}
                          label={t("Generator.Name", "Repertoire name")}
                          placeholder={defaultName()}
                          value={name}
                          onChange={(event) => setName(event.currentTarget.value)}
                        />
                        <Button
                          leftSection={<IconBook2 size={16} />}
                          loading={saving}
                          onClick={() => void saveRepertoire(state.result)}
                        >
                          {t("Generator.Create", "Create repertoire")}
                        </Button>
                        <Button
                          variant="default"
                          leftSection={<IconChessKnight size={16} />}
                          onClick={async () => {
                            const title = name.trim() || defaultName();
                            void openPgn(
                              await buildPgn(state.result, title),
                              title,
                              rootMoves.length,
                            );
                          }}
                        >
                          {t("Generator.OpenBoard", "Open on the board")}
                        </Button>
                      </Group>
                    )}
                  </Stack>
                )}

                {state.status === "surprises" && (
                  <Stack gap="sm">
                    <ResultSummary
                      items={[
                        {
                          label: t("Generator.Surprises.Found", "Surprises"),
                          value: String(state.result.surprises.length),
                        },
                        {
                          label: t("Generator.Surprises.Examined", "Positions examined"),
                          value: String(state.result.examined),
                        },
                        {
                          label: t("Generator.Time", "Time"),
                          value: formatSeconds(state.elapsedMs),
                        },
                      ]}
                    />
                    {state.result.stopReason === "book" && state.result.stoppedAt !== null && (
                      <Badge variant="light" color="gray">
                        {t(
                          "Generator.Surprises.Stopped",
                          "Stopped at move {{move}}: fewer than {{games}} games in the source.",
                          {
                            move: Number(
                              surpriseLine[state.result.stoppedAt]?.fen.split(" ")[5] ?? 0,
                            ),
                            games: settings.surprises.stopGames,
                          },
                        )}
                      </Badge>
                    )}
                    {state.result.surprises.length === 0 ? (
                      <Text size="sm" c="dimmed">
                        {t(
                          "Generator.Surprises.None",
                          "No surprise passed the filters in this line. Try a higher share, a larger engine margin or an earlier move.",
                        )}
                      </Text>
                    ) : (
                      <>
                        <SurpriseTable
                          surprises={state.result.surprises}
                          elo={settings.opponent.elo}
                          onOpen={openSurprise}
                        />
                        <Group>
                          <Button
                            variant="default"
                            leftSection={<IconChessKnight size={16} />}
                            onClick={() =>
                              void openPgn(
                                surprisesPgn(surpriseLine, state.result.surprises, {
                                  name: t("Generator.Surprises.Title", "Surprises"),
                                  startFen,
                                  elo: settings.opponent.elo,
                                  provenance: t(
                                    "Generator.Surprises.Provenance",
                                    "Surprises found by Onyx in {{source}}: at most {{share}}% of the games, within {{loss}} cp of the engine's best. Red arrow: no games; green: rare.",
                                    {
                                      source: sourceLabel,
                                      share: settings.surprises.maxShare,
                                      loss: settings.surprises.maxLoss,
                                    },
                                  ),
                                  t,
                                }),
                                t("Generator.Surprises.Title", "Surprises"),
                                0,
                              )
                            }
                          >
                            {t("Generator.Surprises.OpenAll", "Open the annotated line")}
                          </Button>
                        </Group>
                      </>
                    )}
                  </Stack>
                )}
              </Stack>
            </Paper>
          </Grid.Col>
        </Grid>
      </Stack>
    </Modal>
  );
}
