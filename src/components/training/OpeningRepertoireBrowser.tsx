import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Container,
  Group,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconBook2,
  IconChevronRight,
  IconDownload,
  IconFileSearch,
  IconFolder,
  IconPlayerPlay,
  IconPlus,
  IconSettings,
} from "@tabler/icons-react";
import { Link, useLoaderData, useLocation } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOpeningPractice } from "@/hooks/useOpeningPractice";
import { useOpeningScrollRestoration } from "@/hooks/useOpeningScrollRestoration";
import { trainingAreasAtom } from "@/state/trainingAreas";
import {
  getOpeningCompletion,
  getOpeningMoveTokens,
  getOpeningNoveltyStarts,
} from "@/utils/openingPresentation";
import type { OpeningLine, OpeningRepertoire, OpeningVariant } from "@/utils/trainingAreas";
import OpeningExportModal from "./OpeningExportModal";

function getVariantLines(
  variant: OpeningVariant,
  lines: Record<string, OpeningLine>,
): OpeningLine[] {
  return variant.lineIds.flatMap((lineId) => (lines[lineId] ? [lines[lineId]] : []));
}

function getRepertoireLines(
  repertoire: OpeningRepertoire,
  variants: Record<string, OpeningVariant>,
  lines: Record<string, OpeningLine>,
): OpeningLine[] {
  return repertoire.variantIds.flatMap((variantId) => {
    const variant = variants[variantId];
    return variant?.contentType === "theory" ? getVariantLines(variant, lines) : [];
  });
}

function BrowserError({ error, onClose }: { error: string | null; onClose: () => void }) {
  if (!error) return null;
  return (
    <Alert color="red" withCloseButton onClose={onClose}>
      {error}
    </Alert>
  );
}

function EmptyBrowserState({ children }: { children: React.ReactNode }) {
  return (
    <Card withBorder padding="xl">
      <Stack align="center" py="xl">
        <IconBook2 size={44} color="var(--mantine-color-dimmed)" />
        <Text c="dimmed" ta="center">
          {children}
        </Text>
      </Stack>
    </Card>
  );
}

export function OpeningLibraryPage() {
  const { t } = useTranslation();
  const areas = useAtomValue(trainingAreasAtom);
  const launcher = useOpeningPractice();
  const repertoires = Object.values(areas.openings.repertoires);
  const scrollRef = useOpeningScrollRestoration("library");

  return (
    <Container ref={scrollRef} size="xl" py="md">
      <Stack gap="xl">
        <Group justify="space-between" align="flex-start">
          <Group align="flex-start">
            <Button
              component={Link}
              to="/training"
              variant="subtle"
              p="xs"
              aria-label={t("OpeningBrowser.BackToTraining", "Back to training")}
            >
              <IconArrowLeft size={20} />
            </Button>
            <div>
              <Title order={2}>{t("OpeningBrowser.Title", "Opening repertoires")}</Title>
              <Text c="dimmed" mt={4} maw={720}>
                {t(
                  "OpeningBrowser.LibraryDescription",
                  "Choose a repertoire to explore its sections or continue training.",
                )}
              </Text>
            </div>
          </Group>
          <Group>
            <Button
              component={Link}
              to="/training/openings/manage"
              variant="default"
              leftSection={<IconSettings size={16} />}
            >
              {t("OpeningBrowser.ManageRepertoires", "Manage repertoires")}
            </Button>
            <Button
              component={Link}
              to="/training/openings/manage"
              hash="import"
              leftSection={<IconPlus size={16} />}
            >
              {t("OpeningBrowser.NewRepertoireOrImport", "New repertoire or import")}
            </Button>
          </Group>
        </Group>

        <BrowserError error={launcher.error} onClose={launcher.clearError} />

        {repertoires.length === 0 ? (
          <EmptyBrowserState>
            {t(
              "OpeningBrowser.EmptyLibrary",
              "There are no repertoires yet. Create one from scratch or import a PGN.",
            )}
          </EmptyBrowserState>
        ) : (
          <Stack gap="md">
            {repertoires.map((repertoire) => {
              const variants = repertoire.variantIds.flatMap((variantId) => {
                const variant = areas.openings.variants[variantId];
                return variant?.contentType === "theory" ? [variant] : [];
              });
              const modelGames = repertoire.variantIds.filter(
                (variantId) => areas.openings.variants[variantId]?.contentType === "modelGame",
              ).length;
              const completion = getOpeningCompletion(
                getRepertoireLines(repertoire, areas.openings.variants, areas.openings.lines),
              );
              return (
                <Card key={repertoire.id} withBorder padding="lg" shadow="xs">
                  <Group align="stretch" wrap="nowrap">
                    <ThemeIcon
                      size={104}
                      radius="md"
                      variant="gradient"
                      gradient={
                        repertoire.color === "black"
                          ? { from: "gray.7", to: "dark.9" }
                          : { from: "blue.4", to: "indigo.7" }
                      }
                      visibleFrom="sm"
                    >
                      <IconBook2 size={48} stroke={1.4} />
                    </ThemeIcon>
                    <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
                      <Group justify="space-between" align="flex-start">
                        <div style={{ minWidth: 0 }}>
                          <Link
                            to="/training/openings/$repertoireId"
                            params={{ repertoireId: repertoire.id }}
                            hash="top"
                            style={{ textDecoration: "none" }}
                          >
                            <Text component="span" fw={700} size="lg" c="var(--mantine-color-text)">
                              {repertoire.name}
                            </Text>
                          </Link>
                          {repertoire.description && (
                            <Text c="dimmed" size="sm" mt={3} lineClamp={2}>
                              {repertoire.description}
                            </Text>
                          )}
                        </div>
                        <Badge color={repertoire.color === "black" ? "gray" : "blue"}>
                          {repertoire.color === "black"
                            ? t("OpeningBrowser.Black", "Black")
                            : repertoire.color === "white"
                              ? t("OpeningBrowser.White", "White")
                              : t("OpeningBrowser.Both", "Both")}
                        </Badge>
                      </Group>
                      <Text size="sm">
                        {t(
                          "OpeningBrowser.LibraryCounts",
                          "{{completed}} / {{total}} lines practiced · {{sections}} sections",
                          {
                            completed: completion.completed,
                            total: completion.total,
                            sections: variants.length,
                          },
                        )}
                        {modelGames > 0
                          ? t("OpeningBrowser.ModelGamesSuffix", " · {{count}} model games", {
                              count: modelGames,
                            })
                          : ""}
                      </Text>
                      <Progress value={completion.percent} color="blue" />
                      <Group justify="flex-end" mt="xs">
                        <Link
                          to="/training/openings/$repertoireId"
                          params={{ repertoireId: repertoire.id }}
                          hash="top"
                          style={{ textDecoration: "none" }}
                        >
                          <Button
                            component="span"
                            variant="default"
                            rightSection={<IconChevronRight size={16} />}
                          >
                            {t("OpeningBrowser.Explore", "Explore")}
                          </Button>
                        </Link>
                        <Button
                          leftSection={<IconPlayerPlay size={16} />}
                          disabled={completion.total === 0}
                          loading={launcher.busy}
                          onClick={() => void launcher.practiceRepertoire(repertoire)}
                        >
                          {t("OpeningBrowser.ContinueTraining", "Continue training")}
                        </Button>
                      </Group>
                    </Stack>
                  </Group>
                </Card>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}

export function OpeningRepertoirePage({ repertoireId }: { repertoireId: string }) {
  const { t } = useTranslation();
  const { documentDir } = useLoaderData({ from: "/training/openings" });
  const areas = useAtomValue(trainingAreasAtom);
  const launcher = useOpeningPractice();
  const [exportOpen, setExportOpen] = useState(false);
  const repertoire = areas.openings.repertoires[repertoireId];
  const locationHash = useLocation({ select: (location) => location.hash });
  const scrollRef = useOpeningScrollRestoration(
    `repertoire:${repertoireId}`,
    locationHash !== "top",
  );

  if (!repertoire) {
    return (
      <Container size="xl" py="md">
        <EmptyBrowserState>
          {t("OpeningBrowser.MissingRepertoire", "Repertoire not found.")}
        </EmptyBrowserState>
      </Container>
    );
  }

  const variants = repertoire.variantIds.flatMap((variantId) => {
    const variant = areas.openings.variants[variantId];
    return variant?.contentType === "theory" ? [variant] : [];
  });
  const allLines = getRepertoireLines(repertoire, areas.openings.variants, areas.openings.lines);
  const completion = getOpeningCompletion(allLines);

  return (
    <Container ref={scrollRef} size="xl" py="md">
      <Stack gap="xl">
        {exportOpen && (
          <OpeningExportModal
            repertoireId={repertoire.id}
            documentDir={documentDir}
            onClose={() => setExportOpen(false)}
          />
        )}
        <BrowserError error={launcher.error} onClose={launcher.clearError} />
        <Group justify="space-between" align="flex-start">
          <Group align="flex-start">
            <Button
              component={Link}
              to="/training/openings"
              variant="subtle"
              p="xs"
              aria-label={t("OpeningBrowser.BackToLibrary", "Back to repertoires")}
            >
              <IconArrowLeft size={20} />
            </Button>
            <div>
              <Text size="sm" c="dimmed">
                {t("OpeningBrowser.Repertoires", "Repertoires")}
              </Text>
              <Title order={2}>{repertoire.name}</Title>
              {repertoire.description && (
                <Text c="dimmed" mt={4} maw={760}>
                  {repertoire.description}
                </Text>
              )}
            </div>
          </Group>
          <Group>
            <Button
              variant="default"
              leftSection={<IconDownload size={16} />}
              onClick={() => setExportOpen(true)}
            >
              {t("OpeningExport.Export", "Export")}
            </Button>
            <Button
              component={Link}
              to="/training/openings/manage"
              variant="default"
              leftSection={<IconSettings size={16} />}
            >
              {t("OpeningBrowser.ManageRepertoires", "Manage repertoires")}
            </Button>
            <Button
              leftSection={<IconPlayerPlay size={16} />}
              disabled={completion.total === 0}
              loading={launcher.busy}
              onClick={() => void launcher.practiceRepertoire(repertoire)}
            >
              {t("OpeningBrowser.TrainRepertoire", "Train repertoire")}
            </Button>
          </Group>
        </Group>

        <Card withBorder padding="lg">
          <Group justify="space-between">
            <Text fw={600}>{t("OpeningBrowser.RepertoireProgress", "Repertoire progress")}</Text>
            <Text size="sm" c="dimmed">
              {t("OpeningBrowser.LinesPracticed", "{{completed}} of {{total}} lines practiced", {
                completed: completion.completed,
                total: completion.total,
              })}
            </Text>
          </Group>
          <Progress value={completion.percent} color="blue" size="lg" mt="sm" />
        </Card>

        <div>
          <Title order={3}>{t("OpeningBrowser.Sections", "Sections")}</Title>
          <Text size="sm" c="dimmed" mt={3}>
            {t(
              "OpeningBrowser.SectionsDescription",
              "Open a section to see every training line and its complete move sequence.",
            )}
          </Text>
        </div>

        {variants.length === 0 ? (
          <EmptyBrowserState>
            {t("OpeningBrowser.NoSections", "This repertoire has no theory sections yet.")}
          </EmptyBrowserState>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
            {variants.map((variant) => {
              const lines = getVariantLines(variant, areas.openings.lines);
              const variantCompletion = getOpeningCompletion(lines);
              return (
                <Card key={variant.id} withBorder padding="lg" mih={230}>
                  <Stack h="100%" justify="space-between">
                    <div>
                      <Group justify="space-between" align="flex-start" wrap="nowrap">
                        <ThemeIcon variant="light" size="lg">
                          <IconFolder size={20} />
                        </ThemeIcon>
                        <Badge variant="light">
                          {variantCompletion.completed}/{variantCompletion.total}
                        </Badge>
                      </Group>
                      <Link
                        to="/training/openings/$repertoireId/$variantId"
                        params={{ repertoireId, variantId: variant.id }}
                        hash="top"
                        style={{ textDecoration: "none", overflowWrap: "anywhere" }}
                      >
                        <Text
                          component="span"
                          fw={700}
                          size="lg"
                          mt="md"
                          c="var(--mantine-color-text)"
                        >
                          {variant.name}
                        </Text>
                      </Link>
                      <Text size="sm" c="dimmed" mt={6}>
                        {t("OpeningBrowser.SectionLineCount", "{{count}} training lines", {
                          count: variantCompletion.total,
                        })}
                      </Text>
                      <Progress value={variantCompletion.percent} mt="sm" />
                    </div>
                    <Group grow>
                      <Link
                        to="/training/openings/$repertoireId/$variantId"
                        params={{ repertoireId, variantId: variant.id }}
                        hash="top"
                        style={{ textDecoration: "none", flex: 1 }}
                      >
                        <Button component="span" variant="default" fullWidth>
                          {t("OpeningBrowser.ViewLines", "View lines")}
                        </Button>
                      </Link>
                      <Button
                        variant="light"
                        disabled={variantCompletion.total === 0}
                        loading={launcher.busy}
                        onClick={() => void launcher.practiceVariant(repertoire, variant)}
                      >
                        {t("OpeningBrowser.Train", "Train")}
                      </Button>
                    </Group>
                  </Stack>
                </Card>
              );
            })}
          </SimpleGrid>
        )}
      </Stack>
    </Container>
  );
}

export function OpeningVariantPage({
  repertoireId,
  variantId,
}: {
  repertoireId: string;
  variantId: string;
}) {
  const { t } = useTranslation();
  const areas = useAtomValue(trainingAreasAtom);
  const launcher = useOpeningPractice();
  const locationHash = useLocation({ select: (location) => location.hash });
  const requestedLineId = locationHash.startsWith("line-") ? locationHash.slice(5) : null;
  const scrollRef = useOpeningScrollRestoration(
    `section:${repertoireId}:${variantId}`,
    locationHash !== "top" && requestedLineId === null,
  );
  const repertoire = areas.openings.repertoires[repertoireId];
  const variant = areas.openings.variants[variantId];
  const lines = useMemo(
    () => (variant ? getVariantLines(variant, areas.openings.lines) : []),
    [areas.openings.lines, variant],
  );
  const noveltyStarts = useMemo(() => getOpeningNoveltyStarts(lines), [lines]);

  useEffect(() => {
    if (!requestedLineId) return;
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(`opening-line-${requestedLineId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [requestedLineId, lines.length]);

  if (!repertoire || !variant || variant.repertoireId !== repertoire.id) {
    return (
      <Container size="xl" py="md">
        <EmptyBrowserState>
          {t("OpeningBrowser.MissingSection", "Section not found.")}
        </EmptyBrowserState>
      </Container>
    );
  }

  const completion = getOpeningCompletion(lines);

  return (
    <Container ref={scrollRef} size="xl" py="md">
      <Stack gap="xl">
        <BrowserError error={launcher.error} onClose={launcher.clearError} />
        <Group justify="space-between" align="flex-start">
          <Group align="flex-start">
            <Link
              to="/training/openings/$repertoireId"
              params={{ repertoireId }}
              aria-label={t("OpeningBrowser.BackToSections", "Back to sections")}
              style={{ textDecoration: "none" }}
            >
              <Button component="span" variant="subtle" p="xs">
                <IconArrowLeft size={20} />
              </Button>
            </Link>
            <div>
              <Text size="sm" c="dimmed">
                {repertoire.name} / {t("OpeningBrowser.Sections", "Sections")}
              </Text>
              <Title order={2} style={{ overflowWrap: "anywhere" }}>
                {variant.name}
              </Title>
              <Text c="dimmed" mt={4}>
                {t("OpeningBrowser.LinesPracticed", "{{completed}} of {{total}} lines practiced", {
                  completed: completion.completed,
                  total: completion.total,
                })}
              </Text>
            </div>
          </Group>
          <Group>
            <Button
              variant="default"
              leftSection={<IconFileSearch size={16} />}
              loading={launcher.busy}
              onClick={() => void launcher.analyzeVariant(repertoire, variant)}
            >
              {t("OpeningBrowser.EditAnalyze", "Edit and analyze")}
            </Button>
            <Button
              leftSection={<IconPlayerPlay size={16} />}
              disabled={completion.total === 0}
              loading={launcher.busy}
              onClick={() => void launcher.practiceVariant(repertoire, variant)}
            >
              {t("OpeningBrowser.TrainSection", "Train section")}
            </Button>
          </Group>
        </Group>

        <Alert color="blue" variant="light">
          {t(
            "OpeningBrowser.NovelMovesExplanation",
            "Bold moves are the continuation that is new compared with the preceding lines in this section.",
          )}
        </Alert>

        {lines.length === 0 ? (
          <EmptyBrowserState>
            {t("OpeningBrowser.NoLines", "This section has no training lines yet.")}
          </EmptyBrowserState>
        ) : (
          <Stack gap="md">
            {lines.map((line, index) => {
              const tokens = getOpeningMoveTokens(line, noveltyStarts[index]);
              return (
                <Card
                  id={`opening-line-${line.id}`}
                  key={line.id}
                  withBorder
                  padding="lg"
                  style={{
                    contentVisibility: "auto",
                    containIntrinsicSize: "160px",
                    borderColor:
                      requestedLineId === line.id ? "var(--mantine-color-blue-6)" : undefined,
                    boxShadow:
                      requestedLineId === line.id
                        ? "0 0 0 2px var(--mantine-color-blue-light)"
                        : undefined,
                  }}
                >
                  <Stack gap="md">
                    <Group justify="space-between" align="flex-start" wrap="nowrap">
                      <div style={{ minWidth: 0 }}>
                        <Group gap="xs">
                          <Badge variant="light">{index + 1}</Badge>
                          {line.session.completions > 0 && (
                            <Badge color="teal" variant="light">
                              {t("OpeningBrowser.Practiced", "Practiced")}
                            </Badge>
                          )}
                        </Group>
                        <Text fw={700} size="lg" mt="xs" style={{ overflowWrap: "anywhere" }}>
                          {line.name}
                        </Text>
                      </div>
                      {!line.trainable && (
                        <Badge color="gray" variant="outline">
                          {t("OpeningBrowser.Paused", "Paused")}
                        </Badge>
                      )}
                    </Group>

                    <Box
                      p="md"
                      bg="var(--mantine-color-default-hover)"
                      style={{ borderRadius: "var(--mantine-radius-sm)", lineHeight: 1.9 }}
                    >
                      {tokens.length > 0 ? (
                        tokens.map((token) => (
                          <Text
                            component="span"
                            key={token.key}
                            fw={token.novel ? 700 : 400}
                            c={token.novel ? "blue" : undefined}
                            mr={7}
                          >
                            {token.text}
                          </Text>
                        ))
                      ) : (
                        <Text c="dimmed" size="sm">
                          {t("OpeningBrowser.EmptyLine", "This line has no moves.")}
                        </Text>
                      )}
                    </Box>

                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">
                        {t("OpeningBrowser.PlyCount", "{{count}} plies", {
                          count: line.plyCount,
                        })}
                      </Text>
                      <Group>
                        <Button
                          variant="default"
                          onClick={() => void launcher.analyzeVariant(repertoire, variant)}
                        >
                          {t("OpeningBrowser.OpenBoard", "Open board")}
                        </Button>
                        <Button
                          leftSection={<IconPlayerPlay size={16} />}
                          disabled={!line.trainable}
                          loading={launcher.busy}
                          onClick={() => void launcher.practiceLine(repertoire, variant, line.id)}
                        >
                          {t("OpeningBrowser.TrainLine", "Train line")}
                        </Button>
                      </Group>
                    </Group>
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
