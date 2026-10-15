import { Alert, Button, Group, Progress, Stack, Table, Text } from "@mantine/core";
import { IconPlayerStop, IconSearch } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands, type DatabaseQualityDetails as Details, events } from "@/bindings";

/**
 * Complete quality check: duplicates, suspicious names and inconsistent ratings. It reads every
 * game's moves, so it runs in the background with progress and can be stopped.
 */
export default function DatabaseQualityDetails({ file }: { file: string }) {
  const { t } = useTranslation();
  const [details, setDetails] = useState<Details | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const id = useRef(`database-quality:${crypto.randomUUID()}`).current;

  useEffect(() => {
    const unlisten = events.progressEvent.listen(({ payload }) => {
      if (payload.id === id && !payload.finished) setProgress(payload.progress);
    });
    return () => {
      void unlisten.then((stop) => stop());
      void commands.cancelDatabaseQuality(id);
    };
  }, [id]);

  async function run() {
    setProgress(0);
    setError(null);
    try {
      const result = await commands.getDatabaseQualityDetails(file, id);
      if (result.status === "ok") setDetails(result.data);
      // Stopping the check is not an error worth showing.
      else if (!/cancel|stopped/i.test(result.error)) setError(result.error);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setProgress(null);
    }
  }

  const rows: { label: string; description: string; count: number; examples?: string[] }[] = details
    ? [
        {
          label: t("Databases.Quality.ExactDuplicates", "Exact duplicates"),
          description: t(
            "Databases.Quality.ExactDuplicates.Desc",
            "Extra copies with the same players, moves, event, round and date.",
          ),
          count: details.exactDuplicates,
        },
        {
          label: t("Databases.Quality.ProbableDuplicates", "Probable duplicates"),
          description: t(
            "Databases.Quality.ProbableDuplicates.Desc",
            "Same players and moves but another event, round or date: probably the same game from another source.",
          ),
          count: details.probableDuplicates,
        },
        {
          label: t("Databases.Quality.SuspiciousNames", "Suspicious names (players)"),
          description: t(
            "Databases.Quality.SuspiciousNames.Desc",
            "Empty or placeholder names, fewer than three letters or digits in the name.",
          ),
          count: details.suspiciousNames,
          examples: details.suspiciousNameExamples,
        },
        {
          label: t("Databases.Quality.InconsistentElo", "Inconsistent ratings (players)"),
          description: t(
            "Databases.Quality.InconsistentElo.Desc",
            "Ratings that differ by more than 1000 points: several people under one name, or wrong ratings.",
          ),
          count: details.inconsistentEloPlayers,
          examples: details.inconsistentEloExamples,
        },
      ]
    : [];

  return (
    <Stack gap="xs">
      <Text fz="sm">
        {t(
          "Databases.Quality.DetailsDesc",
          "The complete check also looks for duplicates, suspicious names and inconsistent ratings. It reads every game's moves: several minutes on a base of millions.",
        )}
      </Text>
      <Group>
        <Button
          variant="light"
          leftSection={<IconSearch size="1rem" />}
          loading={progress !== null}
          onClick={() => void run()}
        >
          {t("Databases.Quality.RunDetails", "Complete check")}
        </Button>
        {progress !== null && (
          <Button
            variant="subtle"
            color="gray"
            leftSection={<IconPlayerStop size="1rem" />}
            onClick={() => void commands.cancelDatabaseQuality(id)}
          >
            {t("Common.Stop", "Stop")}
          </Button>
        )}
      </Group>
      {progress !== null && <Progress value={progress} animated size="sm" />}
      {error && <Alert color="red">{error}</Alert>}
      {details && (
        <Table withTableBorder striped>
          <Table.Tbody>
            {rows.map((row) => (
              <Table.Tr key={row.label}>
                <Table.Td>
                  <Text size="sm" fw={500}>
                    {row.label}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {row.description}
                  </Text>
                  {row.examples && row.examples.length > 0 && (
                    <Text size="xs" mt={4}>
                      {t("Databases.Quality.Examples", "Examples: {{names}}", {
                        names: row.examples.join(" · "),
                      })}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td ta="right">{row.count.toLocaleString()}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
