import { Alert, Button, Stack, Table, Text } from "@mantine/core";
import { IconChecklist } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { commands, type DatabaseQualityReport as Report } from "@/bindings";
import DatabaseQualityDetails from "./DatabaseQualityDetails";

type CheckKey = Exclude<keyof Report, "games">;

/** Order and wording of the checks; each one only counts games, nothing is changed or deleted. */
const CHECKS: { key: CheckKey; label: string; description: string }[] = [
  { key: "empty", label: "No moves", description: "The game has no moves." },
  {
    key: "shortDecisive",
    label: "Very short decisive games",
    description: "Won or lost in fewer than 20 plies; some may have been cut short.",
  },
  { key: "unknownResult", label: "Unknown result", description: "Result missing or “*”." },
  { key: "missingDate", label: "No year", description: "Date missing or without a year." },
  { key: "futureDate", label: "Date in the future", description: "Dated after today." },
  {
    key: "samePlayers",
    label: "Same player on both sides",
    description: "White and Black are the same player.",
  },
  {
    key: "implausibleElo",
    label: "Implausible rating",
    description: "A rating below 100 or above 2900.",
  },
  {
    key: "customStart",
    label: "Custom start position",
    description: "Starts from a FEN instead of the initial position.",
  },
];

/** Minimal quality report: counts suspicious games of a base without touching them. */
export default function DatabaseQualityReport({ file }: { file: string }) {
  const { t } = useTranslation();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const result = await commands.getDatabaseQuality(file);
      if (result.status === "ok") setReport(result.data);
      else setError(result.error);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setLoading(false);
    }
  }

  const games = report ? Number(report.games) : 0;
  const percent = (count: number) =>
    games > 0 ? `${((count / games) * 100).toFixed(count / games < 0.001 ? 3 : 2)} %` : "—";

  return (
    <Stack>
      <Text fz="lg" fw="bold">
        {t("Databases.Quality.Title", "Quality report")}
      </Text>
      <Text fz="sm">
        {t(
          "Databases.Quality.Desc",
          "Counts suspicious games without changing or deleting anything. It reads the whole base, so it can take a while on very large ones.",
        )}
      </Text>
      <div>
        <Button
          loading={loading}
          leftSection={<IconChecklist size="1rem" />}
          variant="light"
          onClick={() => void run()}
        >
          {report
            ? t("Databases.Quality.Rerun", "Check again")
            : t("Databases.Quality.Run", "Check quality")}
        </Button>
      </div>
      {error && (
        <Alert color="red" title={t("Databases.Quality.Error", "The report could not be made")}>
          {error}
        </Alert>
      )}
      {report && (
        <Table withTableBorder striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("Databases.Quality.Check", "Check")}</Table.Th>
              <Table.Th ta="right">{t("Databases.Quality.Games", "Games")}</Table.Th>
              <Table.Th ta="right">%</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {CHECKS.map(({ key, label, description }) => {
              const count = Number(report[key]);
              return (
                <Table.Tr key={key}>
                  <Table.Td>
                    <Text size="sm" fw={500}>
                      {t(`Databases.Quality.${key}`, label)}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {t(`Databases.Quality.${key}.Desc`, description)}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">{count.toLocaleString()}</Table.Td>
                  <Table.Td ta="right">{percent(count)}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
          <Table.Caption>
            {t("Databases.Quality.Total", "Games checked: {{total}}", {
              total: games.toLocaleString(),
            })}
          </Table.Caption>
        </Table>
      )}
      <DatabaseQualityDetails file={file} />
    </Stack>
  );
}
