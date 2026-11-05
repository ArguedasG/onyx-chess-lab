import {
  Alert,
  Autocomplete,
  Button,
  Checkbox,
  Group,
  InputWrapper,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { Modal } from "@/components/common/Modal";
import { IconPlus } from "@tabler/icons-react";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DatabaseInfo } from "@/bindings";
import { sessionsAtom } from "@/state/atoms";
import { getChessComAccount } from "@/utils/chess.com/api";
import { getDatabases } from "@/utils/db";
import { getLichessAccount } from "@/utils/lichess/api";
import {
  cancelLichessLogin,
  startLichessLogin,
  useLichessLoginPending,
} from "@/utils/lichess/login";
import type { ChessComSession, LichessSession } from "@/utils/session";
import AccountCards from "../common/AccountCards";
import GenericCard from "../common/GenericCard";
import LichessLogo from "./LichessLogo";

function Accounts() {
  const { t } = useTranslation();
  const [sessions, setSessions] = useAtom(sessionsAtom);
  const [databases, setDatabases] = useState<DatabaseInfo[]>([]);
  useEffect(() => {
    getDatabases().then((dbs) => setDatabases(dbs));
  }, []);
  const [open, setOpen] = useState(false);

  function addChessComSession(alias: string, session: ChessComSession) {
    setSessions((sessions) => {
      const newSessions = sessions.filter((s) => s.chessCom?.username !== session.username);
      return [
        ...newSessions,
        {
          chessCom: session,
          player: alias,
          updatedAt: Date.now(),
        },
      ];
    });
  }

  const addLichessSession = useCallback(
    (alias: string, session: LichessSession) => {
      setSessions((sessions) => {
        const newSessions = sessions.filter((s) => s.lichess?.username !== session.username);
        return [
          ...newSessions,
          {
            lichess: session,
            player: alias,
            updatedAt: Date.now(),
          },
        ];
      });
    },
    [setSessions],
  );

  async function addChessCom(player: string, username: string) {
    const p = player !== "" ? player : username;
    const stats = await getChessComAccount(username);
    if (!stats) {
      return;
    }
    addChessComSession(p, { username, stats });
  }

  async function addLichessNoLogin(player: string, username: string) {
    const p = player !== "" ? player : username;
    const account = await getLichessAccount({ username });
    if (!account) return;
    addLichessSession(p, { username, account });
  }

  async function addLichess(player: string, username: string, withLogin: boolean) {
    if (withLogin) {
      await startLichessLogin(username, player);
      return;
    }
    return await addLichessNoLogin(player, username);
  }

  return (
    <>
      <LichessLoginWaiting />
      <AccountCards
        databases={databases}
        setDatabases={setDatabases}
        onAddAccount={() => setOpen(true)}
      />
      {sessions.length > 0 && (
        <Group>
          <Button
            fullWidth
            variant="light"
            rightSection={<IconPlus size="1rem" />}
            onClick={() => setOpen(true)}
          >
            {t("Home.Accounts.Add")}
          </Button>
        </Group>
      )}
      <AccountModal
        open={open}
        setOpen={setOpen}
        addLichess={addLichess}
        addChessCom={addChessCom}
      />
    </>
  );
}

export default Accounts;

/** While Lichess is open in the browser: what to do there, and a way to try again. */
export function LichessLoginWaiting() {
  const { t } = useTranslation();
  const pending = useLichessLoginPending();
  const sessions = useAtomValue(sessionsAtom);
  if (!pending) return null;
  const alias =
    sessions.find((s) => s.lichess?.username.toLowerCase() === pending.toLowerCase())?.player ?? "";
  return (
    <Alert
      color="blue"
      variant="light"
      title={t("Accounts.Lichess.Waiting", "Waiting for Lichess…")}
    >
      <Stack gap="xs">
        <Text size="sm">
          {t(
            "Accounts.Lichess.Waiting.Desc",
            "Authorize Onyx in the Lichess page that opened in your browser (sign in there first if it asks). If you closed it or nothing changes, open it again.",
          )}
        </Text>
        <Group gap="xs">
          <Button size="xs" onClick={() => void startLichessLogin(pending, alias)}>
            {t("Home.Accounts.LoginAgain", "Open Lichess again")}
          </Button>
          <Button size="xs" variant="subtle" color="gray" onClick={cancelLichessLogin}>
            {t("Common.Cancel")}
          </Button>
        </Group>
      </Stack>
    </Alert>
  );
}

function AccountModal({
  open,
  setOpen,
  addLichess,
  addChessCom,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  addLichess: (player: string, username: string, withLogin: boolean) => void;
  addChessCom: (player: string, username: string) => void;
}) {
  const { t } = useTranslation();
  const sessions = useAtomValue(sessionsAtom);
  const [username, setUsername] = useState("");
  const [player, setPlayer] = useState<string>("");
  const [website, setWebsite] = useState<"lichess" | "chesscom">("lichess");
  const [withLogin, setWithLogin] = useState(false);

  const players = new Set(
    sessions.map((s) => s.player || s.lichess?.username || s.chessCom?.username || ""),
  );

  function addAccount() {
    if (website === "lichess") {
      addLichess(player, username, withLogin);
    } else {
      addChessCom(player, username);
    }
    setOpen(false);
  }

  return (
    <Modal opened={open} onClose={() => setOpen(false)} title={t("Home.Accounts.Add")}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          addAccount();
        }}
      >
        <Stack>
          <Autocomplete
            label={t("Home.Accounts.PlayerName")}
            description={t("Home.Accounts.PlayerName.Desc")}
            data={Array.from(players)}
            value={player}
            onChange={(value) => setPlayer(value)}
            placeholder={t("Home.Accounts.SelectPlayer")}
          />
          <InputWrapper label={t("Home.Accounts.Website")} required>
            <Group grow>
              <GenericCard
                id={"lichess"}
                isSelected={website === "lichess"}
                setSelected={() => setWebsite("lichess")}
                Header={
                  <Group>
                    <LichessLogo />
                    Lichess
                  </Group>
                }
              />
              <GenericCard
                id={"chesscom"}
                isSelected={website === "chesscom"}
                setSelected={() => setWebsite("chesscom")}
                Header={
                  <Group>
                    <img width={30} height={30} src="/chesscom.png" alt="chess.com" />
                    Chess.com
                  </Group>
                }
              />
            </Group>
          </InputWrapper>

          <TextInput
            label={t("Home.Accounts.Username")}
            placeholder={t("Home.Accounts.EnterUsername")}
            required
            value={username}
            onChange={(e) => setUsername(e.currentTarget.value)}
          />
          {website === "lichess" && (
            <Checkbox
              label={t("Home.Accounts.LoginWithBrowser")}
              description={t(
                "Home.Accounts.LoginWithBrowser.Explain",
                "Optional. Without it you can still download the account's games, analyse them and use them as a database. Lichess only opens its opening explorer (Lichess and Masters, in the board's database panel) to signed-in users: tick it if you want the explorer. You can also sign in later from the account card.",
              )}
              checked={withLogin}
              onChange={(e) => setWithLogin(e.currentTarget.checked)}
            />
          )}
          <Button mt="1rem" type="submit">
            {t("Common.Add")}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
