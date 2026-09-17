import { Alert, Button, Card, Group, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import type { RemoteOpeningData } from "@/utils/lichess/api";
import { unwrap } from "@/utils/unwrap";
import OpeningReportLibraryModal from "./OpeningReportLibraryModal";

function total(data: Pick<RemoteOpeningData, "white" | "draws" | "black">) {
  return data.white + data.draws + data.black;
}

function score(data: Pick<RemoteOpeningData, "white" | "draws" | "black">) {
  const games = total(data);
  return games ? `${(((data.white + data.draws / 2) / games) * 100).toFixed(1)}%` : "—";
}

export default function RemoteOpeningReportPanel({
  data,
  fen,
  source,
  onGames,
  readOnly = false,
}: {
  data: RemoteOpeningData;
  fen: string;
  source: "Lichess" | "Lichess Masters";
  onGames: () => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [artifactId, setArtifactId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [libraryOpened, setLibraryOpened] = useState(false);
  const games = total(data);
  const continuations = [...data.moves].sort((left, right) => total(right) - total(left));
  const history = [...(data.history ?? [])].reverse().slice(0, 18);
  const references = data.topGames?.length ? data.topGames : (data.recentGames ?? []);

  const saveVersion = async () => {
    setSaving(true);
    try {
      const document = unwrap(
        await commands.saveAnalysisArtifact(
          "openingReport",
          artifactId,
          `${source} · ${fen.split(" ").slice(0, 4).join(" ")}`,
          source,
          JSON.stringify({
            schemaVersion: 1,
            source,
            fen,
            generatedAt: new Date().toISOString(),
            data,
          }),
        ),
      );
      setArtifactId(document.summary.id);
      notifications.show({
        color: "green",
        message: t("OpeningReport.VersionSaved", "Report version saved."),
      });
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack p="sm" gap="lg" style={{ overflow: "auto" }}>
      {!readOnly && (
        <OpeningReportLibraryModal opened={libraryOpened} onClose={() => setLibraryOpened(false)} />
      )}
      <Group justify="space-between" align="start">
        <div>
          <Title order={2}>{t("OpeningReport.Title")}</Title>
          <Text c="dimmed">{source}</Text>
        </div>
        {!readOnly && (
          <Group>
            <Button variant="subtle" onClick={() => setLibraryOpened(true)}>
              {t("AnalysisLibrary.Title", "Analysis library")}
            </Button>
            <Button variant="default" onClick={onGames}>
              {t("Board.Database.Games")}
            </Button>
            <Button loading={saving} onClick={() => void saveVersion()}>
              {t("OpeningReport.SaveVersion", "Save version")}
            </Button>
          </Group>
        )}
      </Group>

      {readOnly && (
        <Alert color="gray">
          {t("OpeningReport.HistoricalSnapshot", "Saved historical snapshot (read-only).")}
        </Alert>
      )}
      <Alert color="blue">
        {t(
          "OpeningReport.RemoteScope",
          "This compact report uses the aggregated data returned by Lichess. It does not download or scan the underlying game corpus.",
        )}
      </Alert>
      <Text size="xs" c="dimmed" style={{ overflowWrap: "anywhere" }}>
        FEN: {fen}
      </Text>

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Card withBorder>
          <Text size="sm" c="dimmed">
            {t("OpeningReport.Matching")}
          </Text>
          <Text fz="xl" fw={700}>
            {games.toLocaleString()}
          </Text>
        </Card>
        <Card withBorder>
          <Text size="sm" c="dimmed">
            {t("OpeningReport.WhiteScore")}
          </Text>
          <Text fz="xl" fw={700}>
            {score(data)}
          </Text>
        </Card>
        <Card withBorder>
          <Text size="sm" c="dimmed">
            {t("OpeningReport.Outcomes")}
          </Text>
          <Text fz="xl" fw={700}>
            {data.white.toLocaleString()} / {data.draws.toLocaleString()} /{" "}
            {data.black.toLocaleString()}
          </Text>
        </Card>
      </SimpleGrid>

      <Title order={3}>{t("OpeningReport.Continuations")}</Title>
      <Table.ScrollContainer minWidth={560}>
        <Table striped withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("OpeningReport.Move")}</Table.Th>
              <Table.Th>{t("OpeningReport.Games")}</Table.Th>
              <Table.Th>{t("OpeningReport.Frequency")}</Table.Th>
              <Table.Th>{t("OpeningReport.WhiteScore")}</Table.Th>
              <Table.Th>{t("OpeningReport.AverageElo")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {continuations.map((move) => (
              <Table.Tr key={move.uci}>
                <Table.Td>{move.san}</Table.Td>
                <Table.Td>{total(move).toLocaleString()}</Table.Td>
                <Table.Td>{games ? `${((total(move) / games) * 100).toFixed(1)}%` : "—"}</Table.Td>
                <Table.Td>{score(move)}</Table.Td>
                <Table.Td>{move.averageRating || "—"}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      {history.length > 0 && (
        <>
          <Title order={3}>{t("OpeningReport.History")}</Title>
          <Table.ScrollContainer minWidth={480}>
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("OpeningReport.Period")}</Table.Th>
                  <Table.Th>{t("OpeningReport.Games")}</Table.Th>
                  <Table.Th>{t("OpeningReport.WhiteScore")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {history.map((period) => (
                  <Table.Tr key={period.month}>
                    <Table.Td>{period.month}</Table.Td>
                    <Table.Td>{total(period).toLocaleString()}</Table.Td>
                    <Table.Td>{score(period)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </>
      )}

      {references.length > 0 && (
        <>
          <Title order={3}>{t("OpeningReport.Reference", "Featured references")}</Title>
          <Table.ScrollContainer minWidth={560}>
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("Fen.White", "White")}</Table.Th>
                  <Table.Th>{t("Fen.Black", "Black")}</Table.Th>
                  <Table.Th>{t("OpeningReport.Result", "Result")}</Table.Th>
                  <Table.Th>{t("OpeningReport.Period")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {references.map((game) => (
                  <Table.Tr key={game.id}>
                    <Table.Td>
                      {game.white.name} ({game.white.rating})
                    </Table.Td>
                    <Table.Td>
                      {game.black.name} ({game.black.rating})
                    </Table.Td>
                    <Table.Td>{game.winner ?? "½–½"}</Table.Td>
                    <Table.Td>{game.month || game.year}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </>
      )}
    </Stack>
  );
}
