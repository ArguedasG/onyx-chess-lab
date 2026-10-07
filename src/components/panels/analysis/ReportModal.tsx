import { Button, Checkbox, Group, Modal, NumberInput, Select, Stack } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useAtom, useAtomValue } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { memo, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { commands, type GoMode } from "@/bindings";
import { enginesAtom, referenceDbAtom } from "@/state/atoms";
import { updateTabTreeStore } from "@/state/store/tabTreeStores";
import type { LocalEngine } from "@/utils/engines";

const reportSettingsAtom = atomWithStorage("report-settings", {
  novelty: true,
  reversed: true,
  variations: true,
  goMode: { t: "Time", c: 500 } as Exclude<GoMode, { t: "Infinite" }>,
  engine: "",
});

/** Tabs with a report running in this window; the persisted inProgress flag can be stale. */
const runningReports = new Set<string>();

export function isReportRunning(tab: string): boolean {
  return runningReports.has(tab);
}

function ReportModal({
  tab,
  initialFen,
  moves,
  game,
  reportingMode,
  closeReportingMode,
  setInProgress,
}: {
  tab: string;
  initialFen: string;
  moves: string[];
  /** Headers used to judge novelties against earlier games only. */
  game: { date: string | null; white: string; black: string };
  reportingMode: boolean;
  closeReportingMode: () => void;
  setInProgress: (value: boolean) => void;
}) {
  const { t } = useTranslation();

  const referenceDb = useAtomValue(referenceDbAtom);
  const engines = useAtomValue(enginesAtom);
  const localEngines = useMemo(
    () => (engines ?? []).filter((e): e is LocalEngine => e.type === "local"),
    [engines],
  );

  const [reportSettings, setReportSettings] = useAtom(reportSettingsAtom);

  const form = useForm({
    initialValues: reportSettings,
    validate: {
      engine: (value) => {
        if (!value) return t("Board.Analysis.EngineRequired");
      },
      novelty: (value) => {
        if (value && !referenceDb) return t("Board.Analysis.RefDBRequired");
      },
    },
  });

  useEffect(() => {
    const engine =
      localEngines.length === 0
        ? ""
        : !reportSettings.engine || !localEngines.some((l) => l.id === reportSettings.engine)
          ? localEngines[0].id
          : reportSettings.engine;

    form.setValues({ ...reportSettings, engine });
  }, [localEngines, reportSettings]);

  function analyze() {
    setReportSettings(form.values);
    setInProgress(true);
    runningReports.add(tab);
    const showVariations = form.values.variations;
    closeReportingMode();
    const engine = localEngines.find((e) => e.id === form.values.engine);
    const engineSettings = (engine?.settings ?? []).map((s) => ({
      ...s,
      value: s.value?.toString() ?? "",
    }));

    commands
      .analyzeGame(
        `report_${tab}`,
        engine?.path ?? "",
        engine?.args ?? [],
        form.values.goMode,
        {
          annotateNovelties: form.values.novelty,
          fen: initialFen,
          referenceDb,
          reversed: form.values.reversed,
          moves,
          gameDate: game.date,
          white: game.white,
          black: game.black,
        },
        engineSettings,
      )
      .then((analysis) => {
        // Apply to the tab that started the report, even if the user switched tabs meanwhile.
        if (analysis.status === "ok") {
          updateTabTreeStore(tab, (store) =>
            store.getState().addAnalysis(analysis.data, { showVariations }),
          );
        } else if (analysis.error !== "Analysis cancelled") {
          notifications.show({
            title: t("Board.Analysis.ReportFailed", "Could not generate the report"),
            message: analysis.error,
            color: "red",
          });
        }
      })
      .catch((error) => {
        notifications.show({
          title: t("Board.Analysis.ReportFailed", "Could not generate the report"),
          message: error instanceof Error ? error.message : String(error),
          color: "red",
        });
      })
      .finally(() => {
        runningReports.delete(tab);
        updateTabTreeStore(tab, (store) => store.getState().setReportInProgress(false));
      });
  }

  return (
    <Modal
      opened={reportingMode}
      onClose={closeReportingMode}
      title={t("Board.Analysis.GenerateReport")}
    >
      <form onSubmit={form.onSubmit(() => analyze())}>
        <Stack>
          <Select
            allowDeselect={false}
            withAsterisk
            label={t("Common.Engine")}
            placeholder="Pick one"
            data={
              localEngines.map((engine) => {
                return {
                  value: engine.id,
                  label: engine.name,
                };
              }) ?? []
            }
            {...form.getInputProps("engine")}
          />
          <Group wrap="nowrap">
            <Select
              allowDeselect={false}
              comboboxProps={{
                position: "bottom",
                middlewares: { flip: false, shift: false },
              }}
              data={[
                { label: t("GoMode.Depth"), value: "Depth" },
                { label: t("Board.Analysis.Time"), value: "Time" },
                { label: t("GoMode.Nodes"), value: "Nodes" },
              ]}
              value={form.values.goMode.t}
              onChange={(v) => {
                const newGo = form.values.goMode;
                newGo.t = v as "Depth" | "Time" | "Nodes";
                form.setFieldValue("goMode", newGo);
              }}
            />
            <NumberInput
              min={1}
              value={form.values.goMode.c as number}
              onChange={(v) =>
                form.setFieldValue("goMode", {
                  ...(form.values.goMode as any),
                  c: (v || 1) as number,
                })
              }
            />
          </Group>

          <Checkbox
            label={t("Board.Analysis.Reversed")}
            description={t("Board.Analysis.Reversed.Desc")}
            {...form.getInputProps("reversed", { type: "checkbox" })}
          />

          <Checkbox
            label={t("Board.Analysis.AnnotateNovelties")}
            description={t("Board.Analysis.AnnotateNovelties.Desc")}
            {...form.getInputProps("novelty", { type: "checkbox" })}
          />

          <Checkbox
            label={t("Board.Analysis.ShowVariations")}
            description={t("Board.Analysis.ShowVariations.Desc")}
            {...form.getInputProps("variations", { type: "checkbox" })}
          />

          <Group justify="right">
            <Button type="submit">{t("Board.Analysis.Analyze")}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

export default memo(ReportModal);
