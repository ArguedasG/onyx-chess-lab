import { Button, Group, Paper, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconArrowRight, IconUsersGroup } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { sessionsAtom } from "@/state/atoms";
import Accounts from "./Accounts";

/** Accounts connect Lichess and Chess.com; the player cards live in the Players section. */
function AccountsPage() {
  const { t } = useTranslation();
  const sessions = useAtomValue(sessionsAtom);

  return (
    <Group grow px="lg" pb="lg" h="100%" align="flex-start" style={{ overflow: "hidden" }}>
      <Stack h="100%">
        <Accounts />
      </Stack>

      {sessions.length > 0 && (
        <Paper withBorder radius="md" p="xl" mt="md">
          <Stack gap="sm" align="flex-start">
            <ThemeIcon size={48} radius="xl" variant="light">
              <IconUsersGroup size={26} />
            </ThemeIcon>
            <Title order={4}>{t("Accounts.PlayersMoved.Title", "Your card is in Players")}</Title>
            <Text size="sm" c="dimmed">
              {t(
                "Accounts.PlayersMoved.Description",
                "Summary, games, openings, rivals and Player Analysis of your accounts are now in the Players section, together with the cards of rivals and students.",
              )}
            </Text>
            <Button component={Link} to="/players" rightSection={<IconArrowRight size={16} />}>
              {t("Accounts.PlayersMoved.Open", "Open my card")}
            </Button>
          </Stack>
        </Paper>
      )}
    </Group>
  );
}

export default AccountsPage;
