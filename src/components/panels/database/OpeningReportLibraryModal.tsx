import { Alert, Modal } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AnalysisArtifactDocument, OpeningReport } from "@/bindings";
import AnalysisLibraryModal from "@/components/analysis/AnalysisLibraryModal";
import type { RemoteOpeningData } from "@/utils/lichess/api";
import OpeningReportView from "./OpeningReportView";
import RemoteOpeningReportPanel from "./RemoteOpeningReportPanel";

type SavedReport =
  | { type: "local"; report: OpeningReport }
  | {
      type: "remote";
      source: "Lichess" | "Lichess Masters";
      fen: string;
      data: RemoteOpeningData;
    };

function parseSavedReport(document: AnalysisArtifactDocument): SavedReport {
  const latest = document.versions.at(-1);
  if (!latest) throw new Error("Saved report has no versions");
  const payload = JSON.parse(latest.payloadJson) as Record<string, unknown>;
  if (
    typeof payload.databaseName === "string" &&
    typeof payload.generatedAt === "string" &&
    typeof payload.position === "object" &&
    Array.isArray(payload.theory)
  ) {
    return { type: "local", report: payload as unknown as OpeningReport };
  }
  if (
    (payload.source === "Lichess" || payload.source === "Lichess Masters") &&
    typeof payload.fen === "string" &&
    typeof payload.data === "object" &&
    payload.data !== null
  ) {
    return {
      type: "remote",
      source: payload.source,
      fen: payload.fen,
      data: payload.data as RemoteOpeningData,
    };
  }
  throw new Error("Unsupported or damaged opening report snapshot");
}

export default function OpeningReportLibraryModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<SavedReport | null>(null);
  const restore = (document: AnalysisArtifactDocument) => {
    try {
      setSelected(parseSavedReport(document));
      onClose();
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <>
      <AnalysisLibraryModal
        opened={opened}
        onClose={onClose}
        onRestore={restore}
        restoreKind="openingReport"
      />
      <Modal
        opened={selected !== null}
        onClose={() => setSelected(null)}
        title={t("OpeningReport.HistoricalSnapshot", "Saved historical snapshot (read-only).")}
        size="95%"
      >
        <Alert color="gray" mb="md">
          {t(
            "OpeningReport.HistoricalScope",
            "This view preserves the saved data. Game and variation links are disabled because the source database or remote corpus may have changed.",
          )}
        </Alert>
        {selected?.type === "local" && (
          <OpeningReportView
            report={selected.report}
            onVariant={() => undefined}
            onGame={() => undefined}
            onPlayer={() => undefined}
            readOnly
          />
        )}
        {selected?.type === "remote" && (
          <RemoteOpeningReportPanel
            data={selected.data}
            fen={selected.fen}
            source={selected.source}
            onGames={() => undefined}
            readOnly
          />
        )}
      </Modal>
    </>
  );
}
