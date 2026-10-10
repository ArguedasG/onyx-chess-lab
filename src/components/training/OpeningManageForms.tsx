import { Button, Card, Group, Select, SimpleGrid, Stack, Text, TextInput } from "@mantine/core";
import { IconPlus, IconUpload } from "@tabler/icons-react";
import { useRef, useState, type ReactNode, type Ref } from "react";
import { useTranslation } from "react-i18next";
import type { OpeningImportConfig } from "@/utils/openingTraining";

// These forms own their input state: typing must not re-render the whole management page, which
// renders every repertoire, section and line.

export type NewRepertoireInput = {
  name: string;
  description: string;
  color: "white" | "black";
};

export function CreateRepertoireCard({
  busy,
  onCreate,
}: {
  busy: boolean;
  /** Resolves to `true` when the repertoire was created, so the form can be cleared. */
  onCreate: (input: NewRepertoireInput) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<"white" | "black">("white");
  const nameRef = useRef<HTMLInputElement>(null);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      // Report the problem where the user is looking instead of in the page-level banner.
      setNameError(
        t("Training.Copy.Enteranameforthe.a8416594", "Enter a name for the repertoire."),
      );
      nameRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      nameRef.current?.focus();
      return;
    }
    if (await onCreate({ name: trimmed, description: description.trim(), color })) {
      setName("");
      setDescription("");
      setColor("white");
    }
  }

  return (
    <Card withBorder shadow="sm" style={{ borderColor: "var(--mantine-color-blue-5)", order: 2 }}>
      <Stack>
        <Group>
          <IconPlus size={28} color="var(--mantine-color-blue-6)" />
          <div>
            <Text fw={700}>
              {t(
                "Training.Copy.Createarepertoirefromscratch.7b3b4fef",
                "Create a repertoire from scratch",
              )}
            </Text>
            <Text size="sm" c="dimmed">
              {" "}
              {t(
                "OpeningManage.CreateDescription",
                "Set the repertoire's name and color, then add sections and build their lines on the board.",
              )}{" "}
            </Text>
          </div>
        </Group>
        <SimpleGrid cols={{ base: 1, md: 3 }}>
          <TextInput
            label={t("Training.Copy.Name.562bb157", "Name")}
            placeholder={t(
              "Training.Copy.egMyWhiterepertoire.ba1915a4",
              "e.g. My White repertoire",
            )}
            ref={nameRef}
            error={nameError}
            value={name}
            onChange={(event) => {
              setName(event.currentTarget.value);
              if (nameError) setNameError(null);
            }}
          />
          <TextInput
            label={t("Training.Copy.Description.ee00b96f", "Description")}
            placeholder={t("Training.Copy.Goalorstyle.59aa131a", "Goal or style")}
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
          />
          <Select
            label={t("Training.Copy.Color.6b73191a", "Color")}
            value={color}
            data={[
              { value: "white", label: t("Training.Copy.White.9666a8c0", "White") },
              { value: "black", label: t("Training.Copy.Black.ead8fe1f", "Black") },
            ]}
            onChange={(value) => value && setColor(value as typeof color)}
          />
        </SimpleGrid>
        <Button
          color="blue"
          leftSection={<IconPlus size={16} />}
          loading={busy}
          onClick={() => void submit()}
        >
          {" "}
          {t("Training.Copy.Createandstartbuilding.c91ef9ae", "Create and start building")}{" "}
        </Button>
      </Stack>
    </Card>
  );
}

export function ImportRepertoireCard({
  busy,
  config,
  onConfigChange,
  onSelectFile,
  cardRef,
  notice,
}: {
  busy: boolean;
  config: OpeningImportConfig;
  onConfigChange: (config: OpeningImportConfig) => void;
  onSelectFile: (input: { name: string; description: string }) => void;
  cardRef?: Ref<HTMLDivElement>;
  notice?: ReactNode;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  return (
    <Card ref={cardRef} withBorder style={{ order: 3 }}>
      <Stack>
        <Group>
          <IconUpload size={26} color="var(--mantine-color-blue-6)" />
          <div>
            <Text fw={600}>
              {t("Training.Copy.ImportPGNrepertoire.bc0efff0", "Import PGN repertoire")}
            </Text>
            <Text size="sm" c="dimmed">
              {" "}
              {t(
                "Training.Copy.Reviewthefileandchoose.d26d10d6",
                "Review the file and choose which branches to practice. A complete editable copy will be created; the original file remains untouched.",
              )}{" "}
            </Text>
          </div>
        </Group>
        {notice}
        <SimpleGrid cols={{ base: 1, md: 2, lg: 4 }}>
          <TextInput
            label={t("Training.Copy.Name.562bb157", "Name")}
            placeholder={t(
              "Training.Copy.egFrenchDefenseas.0e31cdee",
              "e.g. French Defense as Black",
            )}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <TextInput
            label={t("Training.Copy.Description.ee00b96f", "Description")}
            placeholder={t("Training.Copy.Goalorsource.c0fc0731", "Goal or source")}
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
          />
          <OpeningConfigFields config={config} onChange={onConfigChange} compact />
        </SimpleGrid>
        <Button
          color="blue"
          leftSection={<IconUpload size={16} />}
          loading={busy}
          onClick={() => onSelectFile({ name, description })}
        >
          {" "}
          {t("Training.Copy.SelectPGNfile.ab7fed1d", "Select PGN file")}{" "}
        </Button>
      </Stack>
    </Card>
  );
}

export function OpeningConfigFields({
  config,
  onChange,
  compact = false,
}: {
  config: OpeningImportConfig;
  onChange: (config: OpeningImportConfig) => void;
  compact?: boolean;
}) {
  const { t: trainingT } = useTranslation();

  const fields = (
    <>
      <Select
        label={trainingT("Training.Copy.Repertoirecolor.b3145869", "Repertoire color")}
        value={config.color}
        data={[
          { value: "white", label: trainingT("Training.Copy.White.9666a8c0", "White") },
          { value: "black", label: trainingT("Training.Copy.Black.ead8fe1f", "Black") },
          { value: "both", label: trainingT("Training.Copy.Bothcolors.c5bf9151", "Both colors") },
        ]}
        onChange={(value) =>
          value && onChange({ ...config, color: value as OpeningImportConfig["color"] })
        }
      />
      <Select
        label={trainingT("Training.Copy.Trainablebranches.33bbf995", "Trainable branches")}
        value={config.subvariationPolicy}
        data={[
          {
            value: "mainline",
            label: trainingT("Training.Copy.Mainlinesonly.92cf9aee", "Main lines only"),
          },
          {
            value: "all",
            label: trainingT("Training.Copy.Allsubvariations.3d1748e2", "All subvariations"),
          },
        ]}
        onChange={(value) =>
          value &&
          onChange({
            ...config,
            subvariationPolicy: value as OpeningImportConfig["subvariationPolicy"],
          })
        }
      />
      {!compact && (
        <Select
          label={trainingT("OpeningImport.Grouping", "Section grouping")}
          description={trainingT(
            "OpeningImport.GroupingDescription",
            "Controls how PGN records become repertoire sections.",
          )}
          value={config.groupingMode}
          data={[
            {
              value: "smart",
              label: trainingT("OpeningImport.GroupingSmart", "Smart grouping (recommended)"),
            },
            {
              value: "records",
              label: trainingT("OpeningImport.GroupingRecords", "One section per PGN record"),
            },
            {
              value: "single",
              label: trainingT("OpeningImport.GroupingSingle", "One combined section"),
            },
          ]}
          onChange={(value) =>
            value &&
            onChange({
              ...config,
              groupingMode: value as OpeningImportConfig["groupingMode"],
            })
          }
        />
      )}
    </>
  );
  return compact ? fields : <SimpleGrid cols={{ base: 1, sm: 3 }}>{fields}</SimpleGrid>;
}
