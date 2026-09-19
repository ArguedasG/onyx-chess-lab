import {
  Alert,
  Button,
  Card,
  Checkbox,
  Group,
  Modal,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { trainingAreasAtom } from "@/state/trainingAreas";
import { createFile } from "@/utils/files";
import { inspectOpeningPgn, prepareOpeningImport } from "@/utils/openingTraining";
import {
  createStudyEndgameRecord,
  createStudyTacticsRecord,
  getStudyPositionCandidates,
  type StudyPositionCandidate,
} from "@/utils/studyTraining";
import {
  exportStudyChapterPgn,
  writeStudySourcePgn,
  type Study,
  type StudyChapter,
} from "@/utils/studies";
import {
  addEndgamePositionToSet,
  addEndgameSet,
  addOpeningRepertoire,
  addTacticsExerciseToSet,
  addTacticsSet,
  inferEndgameStudentColor,
  type EndgameStudentColor,
  type TacticsStartingActor,
  type TacticsVariationPolicy,
  type TrainingObjective,
} from "@/utils/trainingAreas";
import RepertoireAdditionModal from "../training/RepertoireAdditionModal";

type CopyKind = "tactics" | "endgames" | "openings";
type Review = {
  enabled: boolean;
  path: number[];
  objective: Exclude<TrainingObjective, "unknown"> | null;
  studentColor: EndgameStudentColor;
};

const NEW_TARGET = "__new__";

export default function StudyTrainingCopyModal({
  study,
  chapters,
  documentDir,
  onClose,
}: {
  study: Study;
  chapters: StudyChapter[];
  documentDir: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [areas, setAreas] = useAtom(trainingAreasAtom);
  const [kind, setKind] = useState<CopyKind>("tactics");
  const [candidates, setCandidates] = useState<Record<string, StudyPositionCandidate[]>>({});
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [target, setTarget] = useState(NEW_TARGET);
  const [name, setName] = useState(study.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [variationPolicy, setVariationPolicy] = useState<TacticsVariationPolicy>("mainline");
  const [startingActor, setStartingActor] = useState<TacticsStartingActor>("student");
  const [openingColor, setOpeningColor] = useState<"white" | "black" | "both">("both");
  const [openingPolicy, setOpeningPolicy] = useState<"mainline" | "all">("all");
  const [existingOpeningPath, setExistingOpeningPath] = useState("");

  useEffect(() => {
    if (kind === "openings") return;
    let current = true;
    setBusy(true);
    setError("");
    void Promise.all(
      chapters.map(async (chapter) => ({
        chapter,
        values: await getStudyPositionCandidates(chapter.pgn, kind),
      })),
    )
      .then((items) => {
        if (!current) return;
        const nextCandidates: Record<string, StudyPositionCandidate[]> = {};
        const nextReviews: Record<string, Review> = {};
        for (const { chapter, values } of items) {
          nextCandidates[chapter.id] = values;
          const first = values[0];
          nextReviews[chapter.id] = {
            enabled: Boolean(first),
            path: first?.path ?? [],
            objective: null,
            studentColor: inferEndgameStudentColor(first?.fen ?? ""),
          };
        }
        setCandidates(nextCandidates);
        setReviews(nextReviews);
      })
      .catch((cause) => current && setError(String(cause)))
      .finally(() => current && setBusy(false));
    return () => {
      current = false;
    };
  }, [chapters, kind]);

  useEffect(() => {
    setTarget(NEW_TARGET);
    setName(study.name);
    setError("");
  }, [kind, study.name]);

  const tacticsTargets = useMemo(
    () =>
      Object.values(areas.tactics.sets)
        .filter((set) => set.origin === "user" && set.source?.kind !== "pgnFile")
        .map((set) => ({ value: set.id, label: set.name })),
    [areas.tactics.sets],
  );
  const endgameTargets = useMemo(
    () =>
      Object.values(areas.endgames.sets)
        .filter((set) => set.origin === "user")
        .map((set) => ({ value: set.id, label: set.name })),
    [areas.endgames.sets],
  );
  const included = chapters.filter((chapter) => reviews[chapter.id]?.enabled);

  function updateReview(chapterId: string, update: Partial<Review>) {
    setReviews((current) => ({
      ...current,
      [chapterId]: { ...current[chapterId], ...update },
    }));
  }

  async function createRecords() {
    return Promise.all(
      included.map((chapter) => {
        const review = reviews[chapter.id];
        if (kind === "tactics") {
          return createStudyTacticsRecord(study, chapter, review.path);
        }
        if (!review.objective) throw new Error(`Confirma el objetivo de «${chapter.title}».`);
        return createStudyEndgameRecord(
          study,
          chapter,
          review.path,
          review.objective,
          review.studentColor,
        );
      }),
    );
  }

  async function copyTacticsOrEndgames() {
    if (included.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const records = await createRecords();
      if (kind === "tactics") {
        setAreas((current) => {
          if (target === NEW_TARGET) {
            return {
              ...current,
              tactics: addTacticsSet(current.tactics, name.trim() || study.name, "", records, {
                config: { variationPolicy, startingActor },
              }),
            };
          }
          return {
            ...current,
            tactics: records.reduce(
              (state, record) => addTacticsExerciseToSet(state, target, record, ["study"]),
              current.tactics,
            ),
          };
        });
      } else {
        setAreas((current) => {
          if (target === NEW_TARGET) {
            return {
              ...current,
              endgames: addEndgameSet(current.endgames, name.trim() || study.name, "", records),
            };
          }
          return {
            ...current,
            endgames: records.reduce(
              (state, record) => addEndgamePositionToSet(state, target, record),
              current.endgames,
            ),
          };
        });
      }
      notifications.show({
        color: "green",
        message: t(
          "Studies.TrainingCopyCreated",
          "Created an independent training copy from {{count}} chapters.",
          { count: records.length },
        ),
      });
      onClose();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  function selectedStudyPgn(): string {
    return chapters.map((chapter) => exportStudyChapterPgn(study, chapter).trim()).join("\n\n\n");
  }

  async function copyOpenings() {
    setBusy(true);
    setError("");
    try {
      const sourcePath = await writeStudySourcePgn(study.name, selectedStudyPgn());
      if (target !== NEW_TARGET) {
        setExistingOpeningPath(sourcePath);
        return;
      }
      const config = { color: openingColor, subvariationPolicy: openingPolicy } as const;
      const inspection = await inspectOpeningPgn(sourcePath, config, chapters.length);
      const prepared = await prepareOpeningImport(inspection, config);
      if (prepared.variants.length === 0) throw new Error("No se encontró ningún capítulo válido.");
      const repertoireName = name.trim() || study.name;
      const created = await createFile({
        filename: `${repertoireName} - Editable`,
        filetype: "repertoire",
        pgn: prepared.trainingPgn,
        dir: documentDir,
      });
      if (created.isErr) throw created.error;
      setAreas((current) => ({
        ...current,
        openings: addOpeningRepertoire(current.openings, {
          name: repertoireName,
          color: openingColor,
          description: t(
            "Studies.RepertoireCopyDescription",
            "Copy created from the study “{{name}}”.",
            { name: study.name },
          ),
          path: created.value.path,
          sourcePath,
          recordCount: inspection.recordCount,
          subvariationPolicy: openingPolicy,
          variants: prepared.variants,
        }),
      }));
      notifications.show({
        color: "green",
        message: t("Studies.RepertoireCopyCreated", "Repertoire copy created."),
      });
      onClose();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  if (existingOpeningPath) {
    return <RepertoireAdditionModal initialPath={existingOpeningPath} onClose={onClose} />;
  }

  return (
    <Modal
      opened
      onClose={() => !busy && onClose()}
      title={t("Studies.LoadTrainingCopy", "Create a training copy")}
      size="xl"
    >
      <Stack>
        <Alert color="blue">
          {t(
            "Studies.CopyIsIndependent",
            "The study remains unchanged. Training receives an independent copy with provenance back to each chapter.",
          )}
        </Alert>
        {error && <Alert color="red">{error}</Alert>}
        <SegmentedControl
          value={kind}
          onChange={(value) => setKind(value as CopyKind)}
          data={[
            { value: "tactics", label: t("Training.Tactics", "Tactics") },
            { value: "endgames", label: t("Training.Endgames", "Endgames") },
            { value: "openings", label: t("Training.Openings", "Openings") },
          ]}
        />

        {kind === "openings" ? (
          <>
            <Alert color="gray">
              {t(
                "Studies.OpeningCopyScope",
                "Every selected chapter is copied as a complete PGN tree, including comments and variations.",
              )}
            </Alert>
            <SegmentedControl
              value={target}
              onChange={setTarget}
              data={[
                { value: NEW_TARGET, label: t("Studies.NewRepertoire", "New repertoire") },
                {
                  value: "existing",
                  label: t("Studies.ExistingRepertoire", "Existing repertoire"),
                },
              ]}
            />
            {target === NEW_TARGET && (
              <>
                <TextInput
                  label={t("Studies.CopyName", "Copy name")}
                  value={name}
                  onChange={(event) => setName(event.currentTarget.value)}
                />
                <Select
                  label={t("Studies.RepertoireColor", "Training color")}
                  value={openingColor}
                  onChange={(value) => setOpeningColor((value as typeof openingColor) ?? "both")}
                  data={[
                    { value: "white", label: t("Fen.White", "White") },
                    { value: "black", label: t("Fen.Black", "Black") },
                    { value: "both", label: t("Studies.BothColors", "Both") },
                  ]}
                />
                <Select
                  label={t("Studies.OpeningBranches", "Trainable branches")}
                  value={openingPolicy}
                  onChange={(value) => setOpeningPolicy((value as typeof openingPolicy) ?? "all")}
                  data={[
                    { value: "all", label: t("Studies.AllBranches", "All variations") },
                    { value: "mainline", label: t("Studies.MainLine", "Main line only") },
                  ]}
                />
              </>
            )}
          </>
        ) : (
          <>
            <Select
              label={
                kind === "tactics"
                  ? t("Studies.TacticsTarget", "Tactics set")
                  : t("Studies.EndgameTarget", "Endgame set")
              }
              value={target}
              onChange={(value) => setTarget(value ?? NEW_TARGET)}
              data={[
                { value: NEW_TARGET, label: t("Studies.CreateNewSet", "Create a new set") },
                ...(kind === "tactics" ? tacticsTargets : endgameTargets),
              ]}
            />
            {target === NEW_TARGET && (
              <TextInput
                label={t("Studies.CopyName", "Copy name")}
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
              />
            )}
            {kind === "tactics" && target === NEW_TARGET && (
              <Group grow>
                <Select
                  label={t("Studies.SolutionBranches", "Accepted solution branches")}
                  value={variationPolicy}
                  onChange={(value) =>
                    setVariationPolicy((value as TacticsVariationPolicy) ?? "mainline")
                  }
                  data={[
                    { value: "mainline", label: t("Studies.MainLine", "Main line only") },
                    {
                      value: "opponentResponses",
                      label: t("Studies.OpponentResponses", "All opponent responses"),
                    },
                    { value: "all", label: t("Studies.AllBranches", "All variations") },
                  ]}
                />
                <Select
                  label={t("Studies.FirstActor", "First actor")}
                  value={startingActor}
                  onChange={(value) =>
                    setStartingActor((value as TacticsStartingActor) ?? "student")
                  }
                  data={[
                    { value: "student", label: t("Studies.Student", "Student") },
                    { value: "opponent", label: t("Studies.Opponent", "Opponent") },
                  ]}
                />
              </Group>
            )}
            <ScrollArea.Autosize mah={420} offsetScrollbars>
              <Stack>
                {chapters.map((chapter) => {
                  const review = reviews[chapter.id];
                  const values = candidates[chapter.id] ?? [];
                  const selected = values.find(
                    (candidate) => candidate.key === review?.path.join(","),
                  );
                  return (
                    <Card key={chapter.id} withBorder>
                      <Stack gap="xs">
                        <Checkbox
                          label={chapter.title}
                          checked={review?.enabled ?? false}
                          disabled={values.length === 0}
                          onChange={(event) =>
                            updateReview(chapter.id, { enabled: event.currentTarget.checked })
                          }
                        />
                        <Select
                          label={t("Studies.StartPosition", "Starting position")}
                          value={review?.path.join(",") ?? null}
                          disabled={!review?.enabled}
                          data={values.map((candidate) => ({
                            value: candidate.key,
                            label:
                              candidate.path.length === 0
                                ? t("Studies.InitialPosition", "Initial position")
                                : t("Studies.AfterPlies", "After {{count}} plies{{moves}}", {
                                    count: candidate.path.length,
                                    moves: candidate.sanTrail ? ` · ${candidate.sanTrail}` : "",
                                  }),
                          }))}
                          onChange={(value) => {
                            const candidate = values.find((item) => item.key === value);
                            if (candidate)
                              updateReview(chapter.id, {
                                path: candidate.path,
                                studentColor: inferEndgameStudentColor(candidate.fen),
                              });
                          }}
                        />
                        {selected && kind === "tactics" && (
                          <Text size="xs" c="dimmed">
                            {t(
                              "Studies.SolutionSummary",
                              "{{plies}} plies in the main solution{{variations}}.",
                              {
                                plies: selected.continuationPlies,
                                variations: selected.hasVariations
                                  ? t("Studies.WithVariations", ", with variations")
                                  : "",
                              },
                            )}
                          </Text>
                        )}
                        {kind === "endgames" && review?.enabled && (
                          <Group grow>
                            <Select
                              label={t("Studies.StudentColor", "Student color")}
                              value={review.studentColor}
                              onChange={(value) =>
                                updateReview(chapter.id, {
                                  studentColor: (value as EndgameStudentColor) ?? "white",
                                })
                              }
                              data={[
                                { value: "white", label: t("Fen.White", "White") },
                                { value: "black", label: t("Fen.Black", "Black") },
                              ]}
                            />
                            <Select
                              label={t("Studies.Objective", "Objective")}
                              value={review.objective}
                              onChange={(value) =>
                                updateReview(chapter.id, {
                                  objective: value as Review["objective"],
                                })
                              }
                              placeholder={t("Studies.ConfirmObjective", "Confirm objective")}
                              data={[
                                { value: "win", label: t("Studies.Win", "Win") },
                                { value: "draw", label: t("Studies.Draw", "Draw") },
                                {
                                  value: "loss",
                                  label: t("Studies.HoldOrTestLoss", "Defend / loss"),
                                },
                              ]}
                            />
                          </Group>
                        )}
                      </Stack>
                    </Card>
                  );
                })}
              </Stack>
            </ScrollArea.Autosize>
          </>
        )}

        <Group justify="flex-end">
          <Button variant="default" disabled={busy} onClick={onClose}>
            {t("Common.Cancel", "Cancel")}
          </Button>
          <Button
            loading={busy}
            disabled={
              kind !== "openings" &&
              (included.length === 0 ||
                (kind === "endgames" &&
                  included.some((chapter) => !reviews[chapter.id]?.objective)))
            }
            onClick={() => void (kind === "openings" ? copyOpenings() : copyTacticsOrEndgames())}
          >
            {kind === "openings" && target !== NEW_TARGET
              ? t("Common.Continue", "Continue")
              : t("Studies.CreateCopy", "Create copy")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
