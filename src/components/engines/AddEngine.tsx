import {
  Box,
  Button,
  Center,
  Group,
  Loader,
  Paper,
  ScrollArea,
  SimpleGrid,
  Tabs,
  Text,
} from "@mantine/core";
import { Modal } from "@/components/common/Modal";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconCloud, IconCpu, IconDatabase, IconTrophy } from "@tabler/icons-react";
import { useAtom } from "jotai";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { enginesAtom } from "@/state/atoms";
import { useRecommendedEnginesReady } from "@/hooks/useRecommendedEngines";
import { type CatalogEngine, downloadCatalogEngine } from "@/utils/engineSetup";
import { type LocalEngine, type RemoteEngine, useDefaultEngines } from "@/utils/engines";
import { usePlatform } from "@/utils/files";
import { formatBytes } from "@/utils/format";
import CatalogErrorAlert from "../common/CatalogErrorAlert";
import ProgressButton from "../common/ProgressButton";
import EngineForm from "./EngineForm";
import ManagedMaiaCard from "./ManagedMaiaCard";
import { RecommendedEngines } from "./RecommendedEngines";

function AddEngine({
  opened,
  setOpened,
}: {
  opened: boolean;
  setOpened: (opened: boolean) => void;
}) {
  const { t } = useTranslation();

  const [allEngines, setEngines] = useAtom(enginesAtom);
  const engines = (allEngines ?? []).filter((e): e is LocalEngine => e.type === "local");

  const { os } = usePlatform();
  const recommendedReady = useRecommendedEnginesReady();

  const { defaultEngines, error, isLoading, retry } = useDefaultEngines(os, opened);

  const form = useForm<LocalEngine>({
    initialValues: {
      type: "local",
      id: crypto.randomUUID(),
      version: "",
      name: "",
      path: "",
      args: [],
      image: "",
      elo: undefined,
    },

    validate: {
      name: (value) => {
        if (!value) return t("Common.RequireName");
        if (engines.find((e) => e.name === value)) return t("Common.NameAlreadyUsed");
      },
      path: (value) => {
        if (!value) return t("Common.RequirePath");
      },
    },
  });

  return (
    <Modal
      opened={opened}
      onClose={() => setOpened(false)}
      title={t("Engines.Add.Title")}
      size="80%"
    >
      <Tabs defaultValue="download">
        <Tabs.List>
          <Tabs.Tab value="download">{t("Common.Download")}</Tabs.Tab>
          <Tabs.Tab value="cloud">{t("Engines.Add.Cloud")}</Tabs.Tab>
          <Tabs.Tab value="local">{t("Common.Local")}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="download" pt="xs">
          {!recommendedReady && (
            <Paper withBorder radius="md" p="md" mb="md">
              <Text fw={600} mb={4}>
                {t("EngineSetup.Title")}
              </Text>
              <Text size="sm" c="dimmed" mb="sm">
                {t("EngineSetup.Intro")}
              </Text>
              <RecommendedEngines />
            </Paper>
          )}
          {isLoading && (
            <Center>
              <Loader />
            </Center>
          )}
          <ScrollArea.Autosize mah={720} offsetScrollbars>
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
              {os === "windows" && <ManagedMaiaCard opened={opened} />}
              {defaultEngines?.map((engine, i) => (
                <EngineCard
                  engine={engine}
                  engineId={i}
                  key={i}
                  initInstalled={engines.some((e) => e.name === engine.name)}
                />
              ))}
              {error && <CatalogErrorAlert message={t("Engines.Add.ErrorFetch")} onRetry={retry} />}
            </SimpleGrid>
          </ScrollArea.Autosize>
        </Tabs.Panel>
        <Tabs.Panel value="cloud" pt="xs">
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
            <CloudCard
              engine={{
                id: crypto.randomUUID(),
                name: "ChessDB",
                type: "chessdb",
                url: "https://chessdb.cn",
              }}
            />
            <CloudCard
              engine={{
                id: crypto.randomUUID(),
                name: "Lichess Cloud",
                type: "lichess",
                url: "https://lichess.org",
              }}
            />
          </SimpleGrid>
        </Tabs.Panel>
        <Tabs.Panel value="local" pt="xs">
          <EngineForm
            submitLabel={t("Common.Add")}
            form={form}
            onSubmit={(values: LocalEngine) => {
              setEngines(async (prev) => [...(await prev), values]);
              setOpened(false);
            }}
          />
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}

function CloudCard({ engine }: { engine: RemoteEngine }) {
  const { t } = useTranslation();

  const [engines, setEngines] = useAtom(enginesAtom);
  return (
    <Paper withBorder radius="md" p={0} key={engine.name}>
      <Group wrap="nowrap" gap={0} grow>
        <Box p="sm" flex={1}>
          <Group gap={6} wrap="nowrap">
            <IconCloud size={14} color="var(--mantine-color-dimmed)" />
            <Text tt="uppercase" c="dimmed" fw={700} size="xs">
              {t("Engines.Add.EngineLabel")}
            </Text>
          </Group>
          <Text fw="bold" size="sm">
            {engine.name}
          </Text>
          <Text size="xs" c="dimmed" mb="xs">
            {engine.url}
          </Text>
          <Button
            disabled={(engines ?? []).find((e) => e.type === engine.type) !== undefined}
            fullWidth
            size="xs"
            onClick={() => {
              setEngines(async (prev) => [
                ...(await prev),
                {
                  ...engine,
                  id: crypto.randomUUID(),
                  type: engine.type,
                  loaded: true,
                  settings: [
                    {
                      name: "MultiPV",
                      value: "1",
                    },
                  ],
                },
              ]);
            }}
          >
            {t("Common.Add")}
          </Button>
        </Box>
      </Group>
    </Paper>
  );
}

function EngineCard({
  engine,
  engineId,
  initInstalled,
}: {
  engine: CatalogEngine;
  engineId: number;
  initInstalled: boolean;
}) {
  const { t } = useTranslation();

  const [inProgress, setInProgress] = useState<boolean>(false);
  const [, setEngines] = useAtom(enginesAtom);
  const needsNvidia = /cuda/i.test(engine.downloadLink ?? "");
  const downloadEngine = useCallback(
    async (id: number) => {
      setInProgress(true);
      const installed = await downloadCatalogEngine(engine, `engine_${id}`);
      setEngines(async (prev) => [...(await prev), installed]);
    },
    [engine, setEngines],
  );

  return (
    <Paper withBorder radius="md" p={0} key={engine.name}>
      <Group wrap="nowrap" gap={0} grow>
        <Box p="sm" flex={1}>
          <Group gap={6} wrap="nowrap">
            <IconCpu size={14} color="var(--mantine-color-dimmed)" />
            <Text tt="uppercase" c="dimmed" fw={700} size="xs">
              {t("Engines.Add.EngineLabel")}
            </Text>
          </Group>
          <Text fw="bold" size="sm" mb={needsNvidia ? 0 : "xs"}>
            {engine.name} {engine.version}
          </Text>
          {needsNvidia && (
            <Text size="xs" c="dimmed" mb="xs">
              {t("Engines.Add.NvidiaOnly", "Needs an NVIDIA graphics card (CUDA)")}
            </Text>
          )}
          <Group wrap="nowrap" gap="xs" fz="xs">
            <IconTrophy size="1rem" />
            <Text size="xs">{`${engine.elo} ELO`}</Text>
          </Group>
          <Group wrap="nowrap" gap="xs" mb="xs" fz="xs">
            <IconDatabase size="1rem" />
            <Text size="xs">{formatBytes(engine.downloadSize ?? 0)}</Text>
          </Group>
          <ProgressButton
            id={`engine_${engineId}`}
            initInstalled={initInstalled}
            labels={{
              completed: t("Common.Installed"),
              action: t("Common.Install"),
              inProgress: t("Common.Downloading"),
              finalizing: t("Common.Extracting"),
            }}
            onClick={() => {
              if (!engine.downloadLink) return;
              downloadEngine(engineId).catch((error: unknown) => {
                setInProgress(false);
                notifications.show({
                  color: "red",
                  title: t("EngineSetup.DownloadFailed", { name: engine.name }),
                  message: String(error),
                });
              });
            }}
            inProgress={inProgress}
            setInProgress={setInProgress}
          />
        </Box>
      </Group>
    </Paper>
  );
}

export default AddEngine;
