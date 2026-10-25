import { useTranslation as useTrainingTranslation } from "react-i18next";
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import MaiaRequiredAlert from "@/components/common/MaiaRequiredAlert";
import { Modal } from "@/components/common/Modal";
import { resolveResource } from "@tauri-apps/api/path";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { IconArrowLeft } from "@tabler/icons-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { findObjectiveEngine } from "@/components/boards/EndgameObjectiveWatch";
import {
  activeTabAtom,
  enginesAtom,
  gameInputColorAtom,
  gamePlayer1SettingsAtom,
  gamePlayer2SettingsAtom,
  tabsAtom,
} from "@/state/atoms";
import { trainingAreasAtom } from "@/state/trainingAreas";
import { usePendingPgnImport } from "@/hooks/usePendingPgnImport";
import PendingPgnNotice from "../files/PendingPgnNotice";
import { positionFromFen } from "@/utils/chessops";
import { generateBasicMate } from "@/utils/basicMates";
import { computeEndgameObjective } from "@/utils/endgameObjectives";
import type { LocalEngine } from "@/utils/engines";
import { isMaiaEngine, MAIA_ELO_MAX } from "@/utils/humanBots";
import { launchTrainingPosition } from "@/utils/trainingLaunch";
import {
  acceptComputedEndgameObjective,
  addEndgameRecordsToSet,
  addEndgameSet,
  applyComputedEndgameObjective,
  deleteEndgameSet,
  endgameOutcomeGuessFromObjective,
  installBundledEndgameSets,
  parseTrainingRecords,
  recordEndgameRecognitionAttempt,
  updateEndgameObjective,
  type BasicMateId,
  type EndgameOutcomeGuess,
  type EndgamePosition,
  type EndgameSet,
  type ParsedTrainingRecord,
  type TrainingObjective,
} from "@/utils/trainingAreas";
import { BasicMatesPanel } from "./endgames/BasicMatesPanel";
import { EndgameImportModal, type EndgameImportRequest } from "./endgames/EndgameImportModal";
import { EndgameOutcomeQuiz, type OutcomeQuizState } from "./endgames/EndgameOutcomeQuiz";
import { EndgameThemeBrowser, type EndgameEntry } from "./endgames/EndgameThemeBrowser";
import { EndgameUserSets, type ObjectiveProgress } from "./endgames/EndgameUserSets";
import { filenameWithoutExtension } from "./endgames/endgameThemes";

const BUNDLED_ENDGAMES_VERSION = 2;
const bundledEndgameFiles = ["FinalesParte1.pgn", "FinalesParte2.pgn", "FinalesParte3.pgn"];

type OpponentMode = "best" | "maia";
type EndgameView = "themes" | "sets" | "mates";

/** The best defense is the default opponent (I-07); Maia stays as the practical option. */
const endgameOpponentAtom = atomWithStorage<OpponentMode>("endgameOpponentMode", "best");

export default function EndgameTrainingV2Page() {
  const { t: trainingT } = useTrainingTranslation();
  const navigate = useNavigate();
  const [areas, setAreas] = useAtom(trainingAreasAtom);
  const [, setTabs] = useAtom(tabsAtom);
  const [, setActiveTab] = useAtom(activeTabAtom);
  const storedEngines = useAtomValue(enginesAtom);
  const setInputColor = useSetAtom(gameInputColorAtom);
  const setPlayer1 = useSetAtom(gamePlayer1SettingsAtom);
  const setPlayer2 = useSetAtom(gamePlayer2SettingsAtom);
  const [opponentMode, setOpponentMode] = useAtom(endgameOpponentAtom);
  const [view, setView] = useState<EndgameView>("themes");
  const [feedback, setFeedback] = useState<{ text: string; color?: string } | null>(null);
  const [resolving, setResolving] = useState<ObjectiveProgress | null>(null);
  const resolveCancelledRef = useRef(false);
  const [deletingSetId, setDeletingSetId] = useState<string | null>(null);
  const [importRecords, setImportRecords] = useState<ParsedTrainingRecord[] | null>(null);
  const [importName, setImportName] = useState("");
  const [outcomeQuiz, setOutcomeQuiz] = useState<OutcomeQuizState | null>(null);
  const pendingImport = usePendingPgnImport("endgames");
  const bundledLoadStarted = useRef(false);

  const sets = useMemo(() => Object.values(areas.endgames.sets), [areas.endgames.sets]);
  const userSets = sets.filter((set) => set.origin === "user");
  const entries = useMemo<EndgameEntry[]>(
    () =>
      sets.flatMap((set) =>
        set.positionIds.flatMap((id) => {
          const position = areas.endgames.positions[id];
          return position ? [{ position, setId: set.id, origin: set.origin }] : [];
        }),
      ),
    [areas.endgames.positions, sets],
  );

  const localEngines = useMemo(
    () =>
      (storedEngines ?? []).filter(
        (engine): engine is LocalEngine =>
          engine.type === "local" && Boolean(engine.path) && Boolean(engine.loaded),
      ),
    [storedEngines],
  );
  const maiaEngine = localEngines.find(isMaiaEngine) ?? null;
  const stockfishEngine = useMemo(() => findObjectiveEngine(storedEngines), [storedEngines]);
  const selectedEngine = opponentMode === "maia" ? maiaEngine : stockfishEngine;

  useEffect(() => {
    if (
      areas.endgames.bundledContentVersion >= BUNDLED_ENDGAMES_VERSION ||
      bundledLoadStarted.current
    ) {
      return;
    }
    bundledLoadStarted.current = true;
    Promise.all(
      bundledEndgameFiles.map(async (file) => {
        const path = await resolveResource(`training/endgames/${file}`);
        const records = await parseTrainingRecords(await readTextFile(path), {
          requireExplicitFen: true,
          skipInvalid: true,
        });
        return {
          name: trainingT("Training.Copy.Includedcontentv0.e121b272", "Included content · {{v0}}", {
            v0: file,
          }),
          description: trainingT(
            "Training.Copy.CollectionincludedwithChessLab.7e9e4b92",
            "Collection included with Chess Lab.",
          ),
          records,
        };
      }),
    )
      .then((bundles) => {
        setAreas((previous) => ({
          ...previous,
          endgames: installBundledEndgameSets(previous.endgames, bundles, BUNDLED_ENDGAMES_VERSION),
        }));
      })
      .catch((error) => {
        bundledLoadStarted.current = false;
        setFeedback({
          text:
            error instanceof Error
              ? trainingT(
                  "Training.Copy.Couldnotloadincludedcontent.74d42938",
                  "Could not load included content: {{v0}}",
                  { v0: error.message },
                )
              : trainingT(
                  "Training.Copy.Couldnotloadincludedcontent.7fcd5f76",
                  "Could not load included content.",
                ),
          color: "yellow",
        });
      });
  }, [areas.endgames.bundledContentVersion, setAreas, trainingT]);

  // A PGN sent from Files opens the import preview directly.
  const readImportRef = useRef(readImport);
  readImportRef.current = readImport;
  useEffect(() => {
    const path = pendingImport.path;
    if (!path) return;
    setView("sets");
    void readImportRef.current(path);
  }, [pendingImport.path]);

  async function readImport(path: string) {
    try {
      const records = await parseTrainingRecords(await readTextFile(path), {
        requireExplicitFen: true,
        skipInvalid: true,
      });
      if (records.length === 0) {
        throw new Error(
          trainingT(
            "Training.Copy.ThePGNcontainsnovalid.b0f13444",
            "The PGN contains no valid positions.",
          ),
        );
      }
      setImportName(
        filenameWithoutExtension(
          path,
          trainingT("Training.Copy.Endgameset.cb6b7408", "Endgame set"),
        ),
      );
      setImportRecords(records);
    } catch (error) {
      setFeedback({
        text:
          error instanceof Error
            ? error.message
            : trainingT("Training.Copy.Couldnotimporttheset.90285448", "Could not import the set."),
        color: "red",
      });
    }
  }

  async function chooseImport() {
    const selected = await pendingImport.choosePath([{ name: "PGN", extensions: ["pgn"] }]);
    if (selected) await readImport(selected);
  }

  function confirmImport(request: EndgameImportRequest) {
    const before = new Set(Object.keys(areas.endgames.positions));
    let next = areas.endgames;
    let count = 0;
    if (request.kind === "existing") {
      next = addEndgameRecordsToSet(next, request.setId, request.records);
      count = request.records.length;
    } else {
      for (const group of request.groups) {
        next = addEndgameSet(next, group.name, "", group.records);
        count += group.records.length;
      }
    }
    setAreas((previous) => ({ ...previous, endgames: next }));
    setImportRecords(null);
    pendingImport.clear();
    setFeedback({
      text:
        request.kind === "new" && request.groups.length > 1
          ? trainingT(
              "Endgames.Import.DoneMany",
              "{{count}} positions imported into {{sets}} sets.",
              {
                count,
                sets: request.groups.length,
              },
            )
          : trainingT("Endgames.Import.Done", "{{count}} positions imported.", { count }),
    });
    if (request.computeObjectives) {
      const added = Object.keys(next.positions).filter((id) => !before.has(id));
      void resolvePositionObjectives(added, next.positions, "import");
    }
  }

  async function resolvePositionObjectives(
    positionIds: string[],
    positions: Record<string, EndgamePosition>,
    busyId: string,
  ) {
    resolveCancelledRef.current = false;
    setResolving({ setId: busyId, done: 0, total: positionIds.length });
    let resolved = 0;
    let undecided = 0;
    for (const [index, positionId] of positionIds.entries()) {
      if (resolveCancelledRef.current) break;
      const position = positions[positionId];
      if (position) {
        try {
          const computed = await computeEndgameObjective(
            position.fen,
            position.studentColor,
            stockfishEngine,
          );
          if (computed) {
            resolved += 1;
            setAreas((previous) => ({
              ...previous,
              endgames: applyComputedEndgameObjective(
                previous.endgames,
                positionId,
                computed.objective,
                computed.source,
                computed.category,
              ),
            }));
          } else undecided += 1;
        } catch {
          undecided += 1;
        }
      }
      setResolving({ setId: busyId, done: index + 1, total: positionIds.length });
    }
    setResolving(null);
    setFeedback({
      text: trainingT(
        "Training.Copy.v0objectivescalculatedv1.e4de69e7",
        "{{v0}} objectives calculated{{v1}}.",
        {
          v0: resolved,
          v1: undecided
            ? trainingT("Training.Copy.v0unavailable.86830fd9", "; {{v0}} unavailable", {
                v0: undecided,
              })
            : "",
        },
      ),
      color: undecided ? "yellow" : undefined,
    });
  }

  function setManualObjective(positionId: string, objective: TrainingObjective) {
    setAreas((previous) => ({
      ...previous,
      endgames: updateEndgameObjective(previous.endgames, positionId, objective, "manual"),
    }));
  }

  function openOutcomeQuiz(position: EndgamePosition, setId: string) {
    if (!endgameOutcomeGuessFromObjective(position.objective, position.studentColor)) {
      setFeedback({
        text: trainingT(
          "Endgames.Quiz.UnknownObjective",
          "Calculate or set this position's objective before training its result.",
        ),
        color: "yellow",
      });
      return;
    }
    setOutcomeQuiz({ position, setId, startedAt: Date.now(), result: null });
  }

  function answerOutcomeQuiz(guess: EndgameOutcomeGuess | null) {
    if (!outcomeQuiz || outcomeQuiz.result) return;
    const expected = endgameOutcomeGuessFromObjective(
      outcomeQuiz.position.objective,
      outcomeQuiz.position.studentColor,
    );
    if (!expected) return;
    setAreas((previous) => ({
      ...previous,
      endgames: recordEndgameRecognitionAttempt(previous.endgames, outcomeQuiz.position.id, {
        guess,
        timeMs: Date.now() - outcomeQuiz.startedAt,
      }),
    }));
    setOutcomeQuiz((current) =>
      current ? { ...current, result: { guess, expected, correct: guess === expected } } : current,
    );
  }

  function configureOpponent(timeControlSeconds?: number) {
    if (!selectedEngine) {
      setFeedback({
        text:
          opponentMode === "maia"
            ? trainingT(
                "Training.Copy.InstallandenableMaia3.1f0572bc",
                "Install and enable Maia 3, or select Stockfish.",
              )
            : trainingT(
                "Training.Copy.InstallandenableStockfishor.f6a203ba",
                "Install and enable Stockfish or another local engine.",
              ),
        color: "yellow",
      });
      return false;
    }
    setPlayer1({
      type: "human",
      name: trainingT("Training.Copy.Student.789a6356", "Student"),
      timeControl: timeControlSeconds
        ? { seconds: timeControlSeconds * 1000, increment: 0 }
        : undefined,
    });
    setPlayer2({
      type: "engine",
      engine: selectedEngine,
      go: opponentMode === "maia" ? { t: "Depth", c: 1 } : { t: "Depth", c: 18 },
      presetId: opponentMode === "maia" ? "custom" : "strong",
      targetElo: opponentMode === "maia" ? MAIA_ELO_MAX : undefined,
      tablebaseDefense: opponentMode === "best",
    });
    return true;
  }

  async function playPosition(position: EndgamePosition, setId: string) {
    setOutcomeQuiz(null);
    if (!positionFromFen(position.fen)[0]) {
      setFeedback({
        text: trainingT(
          "Training.Copy.TheFENpositionisinvalid.97da3f3f",
          "The FEN position is invalid.",
        ),
        color: "red",
      });
      return;
    }
    if (!configureOpponent()) return;
    setInputColor(position.studentColor);
    await navigate({ to: "/" });
    await launchTrainingPosition({
      fen: position.fen,
      name: position.title,
      type: "play",
      setTabs,
      setActiveTab,
      trainingArea: "endgames",
      trainingContext: {
        ChessLabEndgamePositionId: position.id,
        ChessLabEndgameSetId: setId,
        ChessLabEndgameObjective: position.objective,
        ChessLabEndgameStudentColor: position.studentColor,
        ChessLabEndgameAutoStart: "1",
      },
    });
  }

  async function playBasicMate(id: BasicMateId, seconds: number) {
    if (!configureOpponent(seconds)) return;
    setInputColor("white");
    await navigate({ to: "/" });
    await launchTrainingPosition({
      fen: generateBasicMate(id),
      name: trainingT("Endgames.Mates.TabName", "Basic mate"),
      type: "play",
      setTabs,
      setActiveTab,
      trainingArea: "endgames",
      trainingContext: {
        ChessLabEndgameBasicMate: id,
        ChessLabEndgameBasicMateSeconds: String(seconds),
        ChessLabEndgameObjective: "win",
        ChessLabEndgameStudentColor: "white",
        ChessLabEndgameAutoStart: "1",
      },
    });
  }

  async function analyzePosition(position: EndgamePosition) {
    setOutcomeQuiz(null);
    await navigate({ to: "/" });
    await launchTrainingPosition({
      fen: position.fen,
      name: trainingT("Training.Copy.Analysisv0.b7ffacfd", "Analysis · {{v0}}", {
        v0: position.title,
      }),
      type: "analysis",
      setTabs,
      setActiveTab,
      trainingArea: "endgames",
    });
  }

  function removeSet() {
    if (!deletingSetId) return;
    const set: EndgameSet | undefined = areas.endgames.sets[deletingSetId];
    if (!set || set.origin !== "user") return;
    setAreas((previous) => ({
      ...previous,
      endgames: deleteEndgameSet(previous.endgames, deletingSetId),
    }));
    setDeletingSetId(null);
    setFeedback({
      text: trainingT("Training.Copy.Setv0deleted.2c6952d5", "Set “{{v0}}” deleted.", {
        v0: set.name,
      }),
    });
  }

  return (
    <Container size="xl" py="md">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <Group align="flex-start">
            <Button
              component={Link}
              to="/training"
              variant="subtle"
              p="xs"
              aria-label={trainingT("Training.Copy.Back.ab26ae7b", "Back")}
            >
              <IconArrowLeft size={20} />
            </Button>
            <div>
              <Title order={2}>
                {trainingT("Training.Copy.Endgametraining.d2c99939", "Endgame training")}
              </Title>
              <Text c="dimmed">
                {trainingT(
                  "Endgames.Page.Subtitle",
                  "Reach the objective against the best defense: each move is checked as you play.",
                )}
              </Text>
            </div>
          </Group>
          <Select
            w={260}
            label={trainingT("Training.Copy.Practiceopponent.95f64dc7", "Practice opponent")}
            value={opponentMode}
            allowDeselect={false}
            error={
              selectedEngine
                ? undefined
                : trainingT(
                    "Training.Copy.Theselectedengineisnot.0223c2c7",
                    "The selected engine is not installed or active.",
                  )
            }
            data={[
              {
                value: "best",
                label: trainingT("Endgames.Opponent.Best", "Best defense · tablebase + Stockfish"),
              },
              {
                value: "maia",
                label: maiaEngine
                  ? trainingT("Endgames.Opponent.Maia", "Practical · Maia {{elo}}", {
                      elo: MAIA_ELO_MAX,
                    })
                  : trainingT("Training.Copy.Maianotinstalled.1dd2fb71", "Maia not installed"),
              },
            ]}
            onChange={(value) => value && setOpponentMode(value as OpponentMode)}
          />
        </Group>

        {opponentMode === "maia" && !maiaEngine && (
          <MaiaRequiredAlert>
            {trainingT(
              "Endgames.Opponent.NoMaia",
              "The practical opponent plays with Maia 3, which is not installed. Install it or choose the best defense.",
            )}
          </MaiaRequiredAlert>
        )}

        {feedback && (
          <Alert color={feedback.color} withCloseButton onClose={() => setFeedback(null)}>
            {feedback.text}
          </Alert>
        )}
        {resolving?.setId === "import" && (
          <Alert color="teal" variant="light">
            <Group justify="space-between">
              <Text size="sm">
                {trainingT(
                  "Endgames.Import.Calculating",
                  "Calculating objectives… {{done}}/{{total}}",
                  {
                    done: resolving.done,
                    total: resolving.total,
                  },
                )}
              </Text>
              <Button
                size="compact-sm"
                variant="subtle"
                onClick={() => (resolveCancelledRef.current = true)}
              >
                {trainingT("Training.Copy.Cancel.bb9dbb40", "Cancel")}
              </Button>
            </Group>
          </Alert>
        )}

        <SegmentedControl
          value={view}
          onChange={(value) => setView(value as EndgameView)}
          data={[
            { value: "themes", label: trainingT("Endgames.View.Themes", "By theme") },
            {
              value: "sets",
              label: (
                <Group gap={6} justify="center" wrap="nowrap">
                  {trainingT("Training.Copy.Yourendgamesets.bc0a26f3", "Your endgame sets")}
                  {userSets.length > 0 && (
                    <Badge size="xs" variant="light" color="teal">
                      {userSets.length}
                    </Badge>
                  )}
                </Group>
              ),
            },
            { value: "mates", label: trainingT("Endgames.View.Mates", "Basic mates") },
          ]}
        />

        {view === "themes" && (
          <EndgameThemeBrowser
            entries={entries}
            onTrain={(entry) => openOutcomeQuiz(entry.position, entry.setId)}
            onAnalyze={(position) => void analyzePosition(position)}
            onPlay={(entry) => void playPosition(entry.position, entry.setId)}
            onNoRandomCandidate={() =>
              setFeedback({
                text: trainingT(
                  "Endgames.Quiz.NoRandomCandidates",
                  "There are no positions with a defined objective in this theme.",
                ),
                color: "yellow",
              })
            }
          />
        )}

        {view === "sets" && (
          <Stack>
            <PendingPgnNotice path={pendingImport.path} onClear={pendingImport.clear} />
            <EndgameUserSets
              state={areas.endgames}
              sets={userSets}
              resolving={resolving}
              onImport={() => void chooseImport()}
              onResolve={(set) =>
                void resolvePositionObjectives(set.positionIds, areas.endgames.positions, set.id)
              }
              onCancelResolve={() => (resolveCancelledRef.current = true)}
              onDelete={setDeletingSetId}
              onObjective={setManualObjective}
              onAcceptComputed={(positionId) =>
                setAreas((previous) => ({
                  ...previous,
                  endgames: acceptComputedEndgameObjective(previous.endgames, positionId),
                }))
              }
              onAnalyze={(position) => void analyzePosition(position)}
              onTrain={openOutcomeQuiz}
              onPlay={(position, setId) => void playPosition(position, setId)}
            />
          </Stack>
        )}

        {view === "mates" && (
          <BasicMatesPanel
            records={areas.endgames.basicMates ?? {}}
            onPlay={(id, seconds) => void playBasicMate(id, seconds)}
          />
        )}
      </Stack>

      <EndgameImportModal
        records={importRecords}
        suggestedName={importName}
        userSets={userSets}
        onClose={() => setImportRecords(null)}
        onImport={confirmImport}
      />

      <EndgameOutcomeQuiz
        quiz={outcomeQuiz}
        onClose={() => setOutcomeQuiz(null)}
        onAnswer={answerOutcomeQuiz}
        onAnalyze={(position) => void analyzePosition(position)}
        onPlay={(position, setId) => void playPosition(position, setId)}
      />

      <Modal
        opened={deletingSetId !== null}
        onClose={() => setDeletingSetId(null)}
        title={trainingT("Training.Copy.Deleteset.0d8bbde1", "Delete set")}
        size="sm"
      >
        <Stack>
          <Text size="sm">
            {trainingT(
              "Training.Copy.Itspositionsandallrelated.56316447",
              "Its positions and all related progress will be deleted. Included endgames are unaffected.",
            )}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeletingSetId(null)}>
              {trainingT("Training.Copy.Cancel.bb9dbb40", "Cancel")}
            </Button>
            <Button color="red" onClick={removeSet}>
              {trainingT("Training.Copy.Deleteset.0d8bbde1", "Delete set")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
