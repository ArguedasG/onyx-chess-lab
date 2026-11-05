import { Button, Paper, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconLogin, IconDatabase } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

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

/** Lichess and Masters need a Lichess account connected through OAuth. */
export function LichessLoginRequired() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Paper withBorder radius="md" p="md">
      <Stack align="center" gap="xs" ta="center">
        <ThemeIcon size={40} radius="xl" variant="light" color="gray">
          <IconLogin size={22} />
        </ThemeIcon>
        <Text fw={600}>{t("Board.Database.LichessLogin.Title")}</Text>
        <Text size="sm" c="dimmed" maw={420}>
          {t("Board.Database.LichessLogin.Desc")}
        </Text>
        <Button size="xs" mt={4} onClick={() => void navigate({ to: "/accounts" })}>
          {t("Board.Database.LichessLogin.Action")}
        </Button>
      </Stack>
    </Paper>
  );
}

export default NoDatabaseWarning;
