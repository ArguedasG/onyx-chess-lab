import { Button, Paper, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconLogin, IconDatabase } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { sessionsAtom } from "@/state/atoms";
import { startLichessLogin, useLichessLoginPending } from "@/utils/lichess/login";

/**
 * The local source needs a reference database. A new user has none yet; someone with databases
 * only needs to pick one in the selector above.
 */
function NoDatabaseWarning({ hasDatabases }: { hasDatabases: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Paper withBorder radius="md" p="md">
      <Stack align="center" gap="xs" ta="center">
        <ThemeIcon size={40} radius="xl" variant="light">
          <IconDatabase size={22} />
        </ThemeIcon>
        <Text fw={600}>
          {hasDatabases
            ? t("Board.Database.PickReference.Title")
            : t("Board.Database.NoDatabases.Title")}
        </Text>
        <Text size="sm" c="dimmed" maw={420}>
          {hasDatabases
            ? t("Board.Database.PickReference.Desc")
            : t("Board.Database.NoDatabases.Desc")}
        </Text>
        {!hasDatabases && (
          <Button
            size="xs"
            mt={4}
            onClick={() => void navigate({ to: "/databases", search: { add: true } })}
          >
            {t("Board.Database.NoDatabases.Action")}
          </Button>
        )}
      </Stack>
    </Paper>
  );
}

/**
 * Lichess and Masters need a Lichess account signed in through the browser (OAuth). An account
 * added only by username can sign in from here, without going to Accounts.
 */
export function LichessLoginRequired() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const sessions = useAtomValue(sessionsAtom);
  const pending = useLichessLoginPending();
  const account = sessions.find((session) => session.lichess && !session.lichess.accessToken);
  const username = account?.lichess?.username;

  return (
    <Paper withBorder radius="md" p="md">
      <Stack align="center" gap="xs" ta="center">
        <ThemeIcon size={40} radius="xl" variant="light" color="gray">
          <IconLogin size={22} />
        </ThemeIcon>
        <Text fw={600}>{t("Board.Database.LichessLogin.Title")}</Text>
        <Text size="sm" c="dimmed" maw={420}>
          {username
            ? t(
                "Board.Database.LichessLogin.DescAccount",
                "Lichess only opens its explorer to signed-in users. {{name}} was added without signing in: sign in once and the explorer works from then on.",
                { name: username },
              )
            : t("Board.Database.LichessLogin.Desc")}
        </Text>
        {username ? (
          <Stack gap={4} align="center">
            <Button
              size="xs"
              mt={4}
              leftSection={<IconLogin size={14} />}
              onClick={() => void startLichessLogin(username, account?.player ?? "")}
            >
              {pending
                ? t("Home.Accounts.LoginAgain", "Open Lichess again")
                : t("Board.Database.LichessLogin.As", "Sign in as {{name}}", { name: username })}
            </Button>
            {pending && (
              <Text size="xs" c="dimmed" maw={380}>
                {t(
                  "Accounts.Lichess.Waiting.Desc",
                  "Authorize Onyx in the Lichess page that opened in your browser (sign in there first if it asks). If you closed it or nothing changes, open it again.",
                )}
              </Text>
            )}
          </Stack>
        ) : (
          <Button size="xs" mt={4} onClick={() => void navigate({ to: "/accounts" })}>
            {t("Board.Database.LichessLogin.Action")}
          </Button>
        )}
      </Stack>
    </Paper>
  );
}

export default NoDatabaseWarning;
