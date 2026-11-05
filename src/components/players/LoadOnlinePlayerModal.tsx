import { Alert, Button, Progress, SegmentedControl, Stack, Text, TextInput } from "@mantine/core";
import { IconCloudDownload } from "@tabler/icons-react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/common/Modal";
import { databaseConversionStateAtom, sessionsAtom, storedDatabasesDirAtom } from "@/state/atoms";
import { query_players } from "@/utils/db";
import type { PlayerAnalysisSource } from "@/utils/playerAnalysis";
import { downloadOnlineAccount } from "@/utils/players/accountSync";

type Site = "lichess" | "chesscom";

/**
 * Loads anyone's Lichess or Chess.com profile from the Players section: their games go into a
 * local database (as from a rival's card) and their card opens right away, ready to be saved as a
 * rival, a student or anything else.
 */
export default function LoadOnlinePlayerModal({
  opened,
  onClose,
  onLoaded,
}: {
  opened: boolean;
  onClose: () => void;
  onLoaded: (source: PlayerAnalysisSource) => void;
}) {
  const { t } = useTranslation();
  const [site, setSite] = useState<Site>("lichess");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [databaseDir] = useAtom(storedDatabasesDirAtom);
  const setConversionState = useSetAtom(databaseConversionStateAtom);
  const sessions = useAtomValue(sessionsAtom);
  const token = sessions.find((session) => session.lichess?.accessToken)?.lichess?.accessToken;

  useEffect(() => {
    if (!opened) {
      setError(null);
      setProgress(null);
    }
  }, [opened]);

  async function load() {
    const user = username.trim();
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const result = await downloadOnlineAccount(site, user, databaseDir, setConversionState, {
        token,
        onProgress: setProgress,
      });
      if (!result) {
        setError(t("Players.Online.NotFound", "There is no account with that name."));
        return;
      }
      const players = await query_players(result.path, {
        name: user,
        options: { page: 1, pageSize: 20, sort: "games", direction: "desc", skipCount: true },
      });
      const lower = user.toLowerCase();
      const record =
        players.data.find((player) => player.name?.toLowerCase() === lower) ??
        players.data.find((player) => player.id !== 0 && player.name);
      if (!record?.name) {
        setError(t("Players.Online.NoGames", "The account has no games to analyse yet."));
        return;
      }
      onLoaded({
        databasePath: result.path,
        databaseTitle: result.title,
        playerId: record.id,
        playerName: record.name,
      });
      setUsername("");
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={() => {
        if (!busy) onClose();
      }}
      centered
      title={t("Players.Online.Title", "Load a Lichess or Chess.com profile")}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {t(
            "Players.Online.Description",
            "Onyx downloads the player's games into a local database and opens their card. Save it as a rival, a student or anyone else to keep it in the list.",
          )}
        </Text>
        <SegmentedControl
          fullWidth
          value={site}
          onChange={(value) => setSite(value as Site)}
          disabled={busy}
          data={[
            { value: "lichess", label: "Lichess" },
            { value: "chesscom", label: "Chess.com" },
          ]}
        />
        <TextInput
          label={t("Players.RivalGames.Username", "Username")}
          value={username}
          onChange={(event) => setUsername(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void load();
          }}
          disabled={busy}
          data-autofocus
        />
        {busy && (
          <Stack gap={4}>
            <Progress value={progress ?? 100} animated striped={progress === null} />
            <Text size="xs" c="dimmed">
              {t(
                "Players.Online.Downloading",
                "Downloading the games… a large account can take a few minutes.",
              )}
            </Text>
          </Stack>
        )}
        {error && (
          <Alert color="red" py={8}>
            {error}
          </Alert>
        )}
        <Button
          leftSection={<IconCloudDownload size={16} />}
          disabled={!username.trim()}
          loading={busy}
          onClick={() => void load()}
        >
          {t("Players.Online.Load", "Load profile")}
        </Button>
      </Stack>
    </Modal>
  );
}
