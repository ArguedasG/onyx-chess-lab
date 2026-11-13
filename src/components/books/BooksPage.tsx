import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Menu,
  Paper,
  Progress,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from "@mantine/core";
import {
  IconBook2,
  IconDots,
  IconFilePlus,
  IconFileUpload,
  IconFolderSearch,
  IconPlayerPlay,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { exists } from "@tauri-apps/plugin-fs";
import { useAtom, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { activeTabAtom, tabsAtom } from "@/state/atoms";
import {
  addBooks,
  type Book,
  type BookLibrary,
  loadBookLibrary,
  loadCover,
  relocateBook,
  removeBook,
  saveCover,
} from "@/utils/books";
import { createTab } from "@/utils/tabs";
import classes from "./BooksPage.module.css";
import SectionHelp from "@/components/common/SectionHelp";

const progress = (book: Book) =>
  book.pages > 0 ? Math.min(100, Math.round((book.lastPage / book.pages) * 100)) : 0;

/**
 * Covers of the library: the saved ones are read from disk; the missing ones are drawn from the
 * first page of each book, one at a time, with pdf.js loaded only then.
 */
function useCovers(library: BookLibrary | null, missing: Set<string>) {
  const [covers, setCovers] = useState<Map<string, string>>(new Map());
  const tried = useRef(new Set<string>());
  const urls = useRef<string[]>([]);

  useEffect(() => {
    if (!library) return;
    let cancelled = false;
    void (async () => {
      for (const book of library.books) {
        if (cancelled) return;
        if (tried.current.has(book.id) || missing.has(book.id)) continue;
        tried.current.add(book.id);
        try {
          let jpeg = await loadCover(book.id);
          if (!jpeg) {
            const { renderCover } = await import("./cover");
            jpeg = await renderCover(book.path);
            await saveCover(book.id, jpeg);
          }
          const url = URL.createObjectURL(new Blob([jpeg as BlobPart], { type: "image/jpeg" }));
          urls.current.push(url);
          setCovers((previous) => new Map(previous).set(book.id, url));
        } catch {
          // No cover: the card shows the title instead.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [library, missing]);

  useEffect(() => () => urls.current.forEach((url) => URL.revokeObjectURL(url)), []);
  return covers;
}

function BookCard({
  book,
  cover,
  missing,
  opened,
  onOpen,
  onLocate,
  onRemove,
}: {
  book: Book;
  cover: string | undefined;
  missing: boolean;
  opened: boolean;
  onOpen: () => void;
  onLocate: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <UnstyledButton
      className={classes.card}
      onClick={missing ? onLocate : onOpen}
      title={book.path}
    >
      <div className={`${classes.cover} ${missing ? classes.missing : ""}`}>
        {cover ? (
          <img src={cover} alt="" draggable={false} />
        ) : (
          <div className={classes.placeholder}>
            <IconBook2 size="2rem" stroke={1.4} />
            <Text size="xs" lineClamp={4}>
              {book.title}
            </Text>
          </div>
        )}
        {missing ? (
          <Badge className={classes.badge} color="red" variant="filled" size="sm">
            {t("Books.Missing")}
          </Badge>
        ) : (
          opened && (
            <Badge className={classes.badge} variant="filled" size="sm">
              {t("Books.Opened")}
            </Badge>
          )
        )}
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon
              className={classes.menu}
              variant="default"
              size="sm"
              aria-label={t("Books.More")}
              onClick={(event) => event.stopPropagation()}
            >
              <IconDots size="0.9rem" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
            {!missing && (
              <Menu.Item leftSection={<IconPlayerPlay size="1rem" />} onClick={onOpen}>
                {t("Books.Open")}
              </Menu.Item>
            )}
            <Menu.Item leftSection={<IconFolderSearch size="1rem" />} onClick={onLocate}>
              {t("Books.Locate")}
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item color="red" leftSection={<IconTrash size="1rem" />} onClick={onRemove}>
              {t("Books.Remove")}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>
      <Text size="sm" fw={600} lineClamp={2} lh={1.3}>
        {book.title}
      </Text>
      {book.pages > 0 && book.lastOpenedAt ? (
        <Stack gap={4}>
          <Progress value={progress(book)} size={3} />
          <Text size="xs" c="dimmed">
            {t("Books.Progress", { page: book.lastPage, pages: book.pages })}
          </Text>
        </Stack>
      ) : (
        <Text size="xs" c="dimmed">
          {t("Books.NotStarted")}
        </Text>
      )}
    </UnstyledButton>
  );
}

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
  const [search, setSearch] = useState("");
  const [dragging, setDragging] = useState(false);
  const covers = useCovers(library, missing);

  useEffect(() => {
    void loadBookLibrary().then(setLibrary);
  }, []);

  useEffect(() => {
    if (!library) return;
    void Promise.all(
      library.books.map(async (b) => [b.id, await exists(b.path).catch(() => false)] as const),
    ).then((checks) => {
      const next = new Set(checks.filter(([, ok]) => !ok).map(([id]) => id));
      setMissing((previous) =>
        previous.size === next.size && [...next].every((id) => previous.has(id)) ? previous : next,
      );
    });
  }, [library]);

  const addPaths = useCallback(async (paths: string[]) => {
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
  }, []);

  async function add() {
    const picked = await open({ multiple: true, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    await addPaths(Array.isArray(picked) ? picked : picked ? [picked] : []);
  }

  // PDF files dragged from the system file explorer are added to the library.
  const addRef = useRef(addPaths);
  addRef.current = addPaths;
  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent(({ payload }) => {
        if (payload.type === "leave") return setDragging(false);
        if (payload.type === "over") return;
        const pdfs = payload.paths.filter((path) => /\.pdf$/i.test(path));
        if (payload.type === "enter") return setDragging(pdfs.length > 0);
        setDragging(false);
        void addRef.current(pdfs);
      })
      .then((unlisten) => {
        if (disposed) unlisten();
        else stop = unlisten;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      stop?.();
    };
  }, []);

  async function locate(book: Book) {
    const picked = await open({ multiple: false, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (typeof picked !== "string") return;
    setError(null);
    try {
      const next = await relocateBook(book.id, picked);
      if (next) setLibrary(next);
      else setError(t("Books.LocateWrong"));
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
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
  const query = search.trim().toLowerCase();
  const shown = query ? books.filter((b) => b.title.toLowerCase().includes(query)) : books;
  const recent = !query ? books.find((b) => b.lastOpenedAt && !missing.has(b.id)) : undefined;
  const openIds = new Set(tabs.map((tab) => tab.book?.id).filter(Boolean));

  return (
    <Box pos="relative" h="100%">
      <Stack h="100%" p="md" gap="md">
        <Group justify="space-between" align="flex-end" wrap="nowrap">
          <div style={{ minWidth: 0 }}>
            <Title order={2}>{t("Books.Title")}</Title>
            <Text size="sm" c="dimmed">
              {t("Books.Description")}
            </Text>
          </div>
          <Group gap="sm" wrap="nowrap">
            {books.length > 0 && (
              <TextInput
                w={240}
                leftSection={<IconSearch size="1rem" />}
                placeholder={t("Books.Search")}
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
              />
            )}
            <Button
              leftSection={<IconFilePlus size="1rem" />}
              onClick={() => void add()}
              loading={busy}
            >
              {t("Books.Add")}
            </Button>
            <SectionHelp section="books" />
          </Group>
        </Group>
        {error && (
          <Alert color="red" withCloseButton onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {!library ? (
          <Loader size="sm" />
        ) : books.length === 0 ? (
          <Center style={{ flex: 1 }}>
            <Stack align="center" gap="sm" maw={420}>
              <IconFileUpload size="3rem" stroke={1.2} color="var(--mantine-color-dimmed)" />
              <Text ta="center">{t("Books.Empty")}</Text>
              <Text ta="center" size="sm" c="dimmed">
                {t("Books.EmptyDrop")}
              </Text>
              <Button
                leftSection={<IconFilePlus size="1rem" />}
                onClick={() => void add()}
                loading={busy}
              >
                {t("Books.Add")}
              </Button>
            </Stack>
          </Center>
        ) : (
          <ScrollArea style={{ flex: 1 }} offsetScrollbars>
            <Stack gap="lg">
              {recent && (
                <Paper withBorder radius="md" p="md">
                  <div className={classes.hero}>
                    <UnstyledButton
                      className={`${classes.card} ${classes.heroCover}`}
                      onClick={() => void openBook(recent)}
                    >
                      <div className={classes.cover}>
                        {covers.get(recent.id) ? (
                          <img src={covers.get(recent.id)} alt="" draggable={false} />
                        ) : (
                          <div className={classes.placeholder}>
                            <IconBook2 size="2rem" stroke={1.4} />
                          </div>
                        )}
                      </div>
                    </UnstyledButton>
                    <Stack gap={6} justify="center" style={{ flex: 1, minWidth: 0 }}>
                      <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                        {t("Books.Continue")}
                      </Text>
                      <Title order={3} lineClamp={2}>
                        {recent.title}
                      </Title>
                      {recent.pages > 0 && (
                        <Group gap="sm" wrap="nowrap" maw={420}>
                          <Progress value={progress(recent)} size="sm" style={{ flex: 1 }} />
                          <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                            {t("Books.Progress", { page: recent.lastPage, pages: recent.pages })}
                          </Text>
                        </Group>
                      )}
                      <Group mt={4}>
                        <Button
                          leftSection={<IconPlayerPlay size="1rem" />}
                          onClick={() => void openBook(recent)}
                        >
                          {t("Books.ContinueButton")}
                        </Button>
                      </Group>
                    </Stack>
                  </div>
                </Paper>
              )}
              {shown.length === 0 ? (
                <Text c="dimmed">{t("Books.NoMatches")}</Text>
              ) : (
                <SimpleGrid
                  cols={{ base: 2, xs: 3, sm: 4, md: 5, lg: 6, xl: 7 }}
                  spacing="lg"
                  verticalSpacing="xl"
                >
                  {shown.map((book) => (
                    <BookCard
                      key={book.id}
                      book={book}
                      cover={covers.get(book.id)}
                      missing={missing.has(book.id)}
                      opened={openIds.has(book.id)}
                      onOpen={() => void openBook(book)}
                      onLocate={() => void locate(book)}
                      onRemove={() => void removeBook(book.id).then(setLibrary)}
                    />
                  ))}
                </SimpleGrid>
              )}
            </Stack>
          </ScrollArea>
        )}
      </Stack>
      {dragging && (
        <div className={classes.drop}>
          <Text fw={600}>{t("Books.DropHere")}</Text>
        </div>
      )}
    </Box>
  );
}
