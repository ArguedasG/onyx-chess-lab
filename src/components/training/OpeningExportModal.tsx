import { Alert, Button, Group, Modal, Select, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { resolve } from "@tauri-apps/api/path";
import { ask, save } from "@tauri-apps/plugin-dialog";
import { copyFile, exists, writeTextFile } from "@tauri-apps/plugin-fs";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trainingAreasAtom } from "@/state/trainingAreas";
import { buildOpeningFlatPgn } from "@/utils/openingTraining";

type ExportMode = "editable" | "flat";

export default function OpeningExportModal({
  repertoireId,
  documentDir,
  onClose,
  onExported,
}: {
  repertoireId: string;
  documentDir: string;
  onClose: () => void;
  onExported?: (message: string) => void;
}) {
  const { t } = useTranslation();
  const areas = useAtomValue(trainingAreasAtom);
  const repertoire = areas.openings.repertoires[repertoireId];
  const [mode, setMode] = useState<ExportMode>("editable");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const trainableLines = repertoire
    ? repertoire.variantIds.reduce((count, variantId) => {
        const variant = areas.openings.variants[variantId];
        if (!variant || variant.contentType !== "theory") return count;
        return (
          count +
          variant.lineIds.filter((lineId) => {
            const line = areas.openings.lines[lineId];
            return line?.trainable && line.moves.length > 0;
          }).length
        );
      }, 0)
    : 0;

  async function exportRepertoire() {
    if (!repertoire) return;
    setBusy(true);
    setError("");
    try {
      const suffix = mode === "editable" ? "editable" : "training lines";
      const defaultPath = await resolve(documentDir, `${repertoire.name} - ${suffix}.pgn`);
      const target = await save({
        defaultPath,
        filters: [{ name: "Portable Game Notation", extensions: ["pgn"] }],
      });
      if (!target) return;
      const outputPath = target.toLowerCase().endsWith(".pgn") ? target : `${target}.pgn`;
      const normalizePath = (path: string) => path.replace(/\\/g, "/").toLowerCase();
      if (
        [repertoire.path, repertoire.sourcePath].some(
          (path) => path && normalizePath(path) === normalizePath(outputPath),
        )
      ) {
        throw new Error(
          t("Pgn.DifferentPath", "Choose a different file to preserve the source PGN."),
        );
      }
      if (
        (await exists(outputPath)) &&
        !(await ask(
          t("Pgn.Overwrite", "Replace the entire existing file? {{path}}", {
            path: outputPath,
          }),
          { kind: "warning" },
        ))
      ) {
        return;
      }

      if (mode === "editable") {
        await copyFile(repertoire.path, outputPath);
      } else {
        await writeTextFile(outputPath, buildOpeningFlatPgn(areas.openings, repertoire.id));
      }
      const message =
        mode === "editable"
          ? t("OpeningExport.EditableSuccess", "Editable copy of “{{name}}” exported.", {
              name: repertoire.name,
            })
          : t("OpeningExport.FlatSuccess", "Exported {{count}} trainable lines from “{{name}}”.", {
              count: trainableLines,
              name: repertoire.name,
            });
      if (onExported) onExported(message);
      else notifications.show({ color: "green", message });
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t("OpeningExport.Failed", "Could not export the repertoire."),
      );
    } finally {
      setBusy(false);
    }
  }

  if (!repertoire) return null;

  return (
    <Modal
      opened
      onClose={() => !busy && onClose()}
      title={t("OpeningExport.Title", "Export repertoire")}
      size="lg"
      closeOnClickOutside={!busy}
      closeOnEscape={!busy}
    >
      <Stack>
        {error && <Alert color="red">{error}</Alert>}
        <Select
          label={t("OpeningExport.Format", "Export format")}
          value={mode}
          disabled={busy}
          data={[
            {
              value: "editable",
              label: t("OpeningExport.Editable", "Editable Onyx PGN"),
            },
            {
              value: "flat",
              label: t("OpeningExport.Flat", "Flat training PGN"),
            },
          ]}
          onChange={(value) => setMode((value as ExportMode) ?? "editable")}
        />
        <Alert color={mode === "editable" ? "blue" : "teal"} variant="light">
          {mode === "editable" ? (
            <Text size="sm">
              {t(
                "OpeningExport.EditableDescription",
                "One PGN record per section, preserving the complete variation tree, comments, annotations, and Onyx organization tags.",
              )}
            </Text>
          ) : (
            <Stack gap={4}>
              <Text size="sm">
                {t(
                  "OpeningExport.FlatDescription",
                  "One independent PGN record per trainable line. This is easier to import into Chessable and other PGN tools.",
                )}
              </Text>
              <Text size="xs" c="dimmed">
                {t("OpeningExport.FlatCount", "{{count}} records will be exported.", {
                  count: trainableLines,
                })}
              </Text>
            </Stack>
          )}
        </Alert>
        <Group justify="flex-end">
          <Button variant="default" disabled={busy} onClick={onClose}>
            {t("Common.Cancel", "Cancel")}
          </Button>
          <Button
            loading={busy}
            disabled={mode === "flat" && trainableLines === 0}
            onClick={() => void exportRepertoire()}
          >
            {t("OpeningExport.Export", "Export")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
