import { ScrollArea, Stack, Tabs } from "@mantine/core";
import { useAtom, useAtomValue } from "jotai";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { currentAnalysisTabAtom, enginesAtom } from "@/state/atoms";
import EngineStrip from "@/components/boards/EngineStrip";
import LogsPanel from "./LogsPanel";
import ReportPanel from "./ReportPanel";

function AnalysisPanel() {
  const { t } = useTranslation();
  const engines = useAtomValue(enginesAtom);
  const hasLoadedEngines = (engines ?? []).some((engine) => engine.loaded);
  const [storedTab, setTab] = useAtom(currentAnalysisTabAtom);
  const tab = storedTab === "logs" || storedTab === "report" ? storedTab : "engines";

  return (
    <Stack h="100%" pl="sm">
      <Tabs
        h="100%"
        orientation="vertical"
        placement="right"
        value={tab}
        onChange={(v) => setTab(v!)}
        style={{
          display: "flex",
        }}
        keepMounted={false}
      >
        <Tabs.List>
          <Tabs.Tab value="engines">{t("Board.Analysis.Engines")}</Tabs.Tab>
          <Tabs.Tab value="report">{t("Board.Analysis.Report")}</Tabs.Tab>
          <Tabs.Tab value="logs" disabled={!hasLoadedEngines}>
            {t("Board.Analysis.Logs")}
          </Tabs.Tab>
        </Tabs.List>
        {/* The strip under the board hides while this tab shows it (see BoardAnalysis). */}
        <Tabs.Panel
          value="engines"
          pt="xs"
          style={{
            overflow: "hidden",
            display: tab === "engines" ? "flex" : "none",
            flexDirection: "column",
          }}
        >
          <ScrollArea offsetScrollbars>
            <EngineStrip wide />
          </ScrollArea>
        </Tabs.Panel>
        <Tabs.Panel
          value="report"
          pt="xs"
          style={{
            overflow: "hidden",
            display: tab === "report" ? "flex" : "none",
            flexDirection: "column",
          }}
        >
          <ReportPanel />
        </Tabs.Panel>
        <Tabs.Panel
          value="logs"
          pt="xs"
          style={{
            overflow: "hidden",
            display: tab === "logs" ? "flex" : "none",
            flexDirection: "column",
          }}
        >
          <LogsPanel />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

export default memo(AnalysisPanel);
