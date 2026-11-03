import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { useNavigate } from "@tanstack/react-router";
import { IconBook, IconFilePlus, IconTrash } from "@tabler/icons-react";
import { open } from "@tauri-apps/plugin-dialog";
import { exists } from "@tauri-apps/plugin-fs";
import { useAtom, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { activeTabAtom, tabsAtom } from "@/state/atoms";
import { addBooks, type Book, type BookLibrary, loadBookLibrary, removeBook } from "@/utils/books";
import { createTab } from "@/utils/tabs";

/**
 * Books (phase 9.4, I-55): the user's PDF library. Only paths are kept; opening a book shows it
 * beside an analysis board, where a double click on a diagram sets up the position.
 */
export default function BooksPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tabs, setTabs] = useAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const [library, setLibrary] = useState<BookLibrary | null>(null);
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadBookLibrary().then(setLibrary);
  }, []);

  useEffect(() => {
    if (!library) return;
    void Promise.all(
      library.books.map(async (b) => [b.id, await exists(b.path).catch(() => false)] as const),
    ).then((checks) => setMissing(new Set(checks.filter(([, ok]) => !ok).map(([id]) => id))));
  }, [library]);

  async function add() {
    const picked = await open({ multiple: true, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    const paths = Array.isArray(picked) ? picked : picked ? [picked] : [];
    if (paths.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      setLibrary(await addBooks(paths));
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function openBook(book: Book) {
    const existing = tabs.find((tab) => tab.book?.id === book.id);
    if (existing) {
      setActiveTab(existing.value);
    } else {
      await createTab({
        tab: {
          name: book.title,
          type: "analysis",
          book: { id: book.id, path: book.path, title: book.title },
        },
        setTabs,
        setActiveTab,
      });
    }
    await navigate({ to: "/" });
  }

  const books = [...(library?.books ?? [])].sort((a, b) =>
    (b.lastOpenedAt ?? b.addedAt).localeCompare(a.lastOpenedAt ?? a.addedAt),
  );

  return (
    <Stack h="100%" p="md" gap="md">
      <Group justify="space-between">
        <div>
          <Title order={2}>{t("Books.Title")}</Title>
          <Text size="sm" c="dimmed">
            {t("Books.Description")}
          </Text>
        </div>
        <Button
          leftSection={<IconFilePlus size="1rem" />}
          onClick={() => void add()}
          loading={busy}
        >
          {t("Books.Add")}
        </Button>
      </Group>
      {error && <Alert color="red">{error}</Alert>}
      {!library ? (
        <Loader size="sm" />
      ) : books.length === 0 ? (
        <Text c="dimmed">{t("Books.Empty")}</Text>
      ) : (
        <ScrollArea style={{ flex: 1 }}>
          <Stack gap="xs">
            {books.map((book) => (
              <Card key={book.id} withBorder padding="sm">
                <Group justify="space-between" wrap="nowrap">
                  <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                    <IconBook size="1.4rem" />
                    <div style={{ minWidth: 0 }}>
                      <Text fw={600} truncate>
                        {book.title}
                      </Text>
                      <Text size="xs" c="dimmed" truncate title={book.path}>
                        {book.path}
                      </Text>
                    </div>
                  </Group>
                  <Group gap="xs" wrap="nowrap">
                    {missing.has(book.id) ? (
                      <Badge color="red" variant="light">
                        {t("Books.Missing")}
                      </Badge>
                    ) : (
                      book.pages > 0 && (
                        <Text size="xs" c="dimmed">
                          {t("Books.Progress", { page: book.lastPage, pages: book.pages })}
                        </Text>
                      )
                    )}
                    <Button
                      size="xs"
                      variant="light"
                      disabled={missing.has(book.id)}
                      onClick={() => void openBook(book)}
                    >
                      {t("Books.Open")}
                    </Button>
                    <Tooltip label={t("Books.Remove")}>
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        onClick={() => void removeBook(book.id).then(setLibrary)}
                      >
                        <IconTrash size="1rem" />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>
              </Card>
            ))}
          </Stack>
        </ScrollArea>
      )}
    </Stack>
  );
}
