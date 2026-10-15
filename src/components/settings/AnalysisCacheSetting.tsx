import { Button, Group, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import useSWR from "swr";
import { commands } from "@/bindings";
import { unwrap } from "@/utils/unwrap";

function megabytes(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Size of the analysis cache, a button to empty it and the engine budget for batch work. */
export default function AnalysisCacheSetting() {
  const { t } = useTranslation();
  const { data: info, mutate } = useSWR("analysis-cache-info", async () =>
    unwrap(await commands.getAnalysisCacheInfo()),
  );
  const { data: budget } = useSWR("engine-budget", () => commands.getEngineBudget());
  const { data: startupMs } = useSWR("startup-ms", () => commands.getStartupMs());
  const [clearing, setClearing] = useState(false);

  async function clear() {
    setClearing(true);
    try {
      unwrap(await commands.clearAnalysisCache());
      await mutate();
      notifications.show({
        message: t("Settings.AnalysisCache.Cleared", "Analysis cache emptied."),
      });
    } catch (error) {
      notifications.show({ color: "red", message: String(error) });
    } finally {
      setClearing(false);
    }
  }

  return (
    <Stack gap={4} align="flex-end">
      <Group gap="xs" wrap="nowrap">
        <Text size="sm" c="dimmed">
          {info
            ? t("Settings.AnalysisCache.Size", "{{entries}} positions · {{size}}", {
                entries: info.entries.toLocaleString(),
                size: megabytes(Number(info.bytes)),
              })
            : "…"}
        </Text>
        <Button
          size="xs"
          variant="default"
          leftSection={<IconTrash size="0.9rem" />}
          loading={clearing}
          disabled={!info || info.entries === 0}
          onClick={() => void clear()}
        >
          {t("Settings.AnalysisCache.Clear", "Empty")}
        </Button>
      </Group>
      {budget && (
        <Text size="xs" c="dimmed">
          {t(
            "Settings.AnalysisCache.Budget",
            "Batch analysis: {{processes}} engines at once, {{threads}} threads and {{hash}} MB each.",
            {
              processes: budget.batchProcesses,
              threads: budget.threadsPerProcess,
              hash: budget.hashMbPerProcess,
            },
          )}
        </Text>
      )}
      {startupMs != null && (
        <Text size="xs" c="dimmed">
          {t("Settings.AnalysisCache.Startup", "This session started in {{seconds}} s.", {
            seconds: (startupMs / 1000).toFixed(1),
          })}
        </Text>
      )}
    </Stack>
  );
}
