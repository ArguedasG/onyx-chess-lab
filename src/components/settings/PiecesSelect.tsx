import {
  Box,
  Button,
  Combobox,
  Flex,
  Group,
  Input,
  InputBase,
  ScrollArea,
  Stack,
  Text,
  useCombobox,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconFolderOpen, IconTrash } from "@tabler/icons-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useAtom } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { customPieceSetsAtom, pieceSetAtom } from "@/state/atoms";
import {
  customPieceSetIdOf,
  customPieceSetValue,
  importPieceSetFromFolder,
  isCustomPieceSet,
  MissingPiecesError,
  PieceFileTooLargeError,
  removeCustomPieceSet,
} from "@/utils/customPieces";
import PieceComponent from "../common/Piece";

type Item = {
  label: string;
  value: string;
};

const DEFAULT_PIECE_SET = "maestro";

const pieceSets: Item[] = [
  { label: "Alpha", value: "alpha" },
  { label: "Anarcandy", value: "anarcandy" },
  { label: "California", value: "california" },
  { label: "Cardinal", value: "cardinal" },
  { label: "Cburnett", value: "cburnett" },
  { label: "Chess7", value: "chess7" },
  { label: "Chessnut", value: "chessnut" },
  { label: "Companion", value: "companion" },
  { label: "Disguised", value: "disguised" },
  { label: "Dubrovny", value: "dubrovny" },
  { label: "Fantasy", value: "fantasy" },
  { label: "Fresca", value: "fresca" },
  { label: "Gioco", value: "gioco" },
  { label: "Governor", value: "governor" },
  { label: "Horsey", value: "horsey" },
  { label: "ICpieces", value: "icpieces" },
  { label: "Kosal", value: "kosal" },
  { label: "Leipzig", value: "leipzig" },
  { label: "Letter", value: "letter" },
  { label: "Libra", value: "libra" },
  { label: "Maestro", value: "maestro" },
  { label: "Merida", value: "merida" },
  { label: "Pirouetti", value: "pirouetti" },
  { label: "Pixel", value: "pixel" },
  { label: "Reillycraig", value: "reillycraig" },
  { label: "Riohacha", value: "riohacha" },
  { label: "Shapes", value: "shapes" },
  { label: "Spatial", value: "spatial" },
  { label: "Staunty", value: "staunty" },
  { label: "Tatiana", value: "tatiana" },
];

function DisplayPieces() {
  const pieces = ["rook", "knight", "bishop", "queen", "king", "pawn"] as const;
  return (
    <Flex gap="xs">
      {pieces.map((role, index) => (
        <Box key={index} h="2.5rem" w="2.5rem">
          <PieceComponent piece={{ color: "white", role }} />
        </Box>
      ))}
    </Flex>
  );
}

export default function PiecesSelect() {
  const { t } = useTranslation();
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const [pieceSet, setPieceSet] = useAtom(pieceSetAtom);
  const [customSets, setCustomSets] = useAtom(customPieceSetsAtom);
  const [loading, setLoading] = useState(false);
  const customItems: Item[] = customSets.map((set) => ({
    label: set.name,
    value: customPieceSetValue(set.id),
  }));

  const optionsOf = (items: Item[]) =>
    items.map((item) => (
      <Combobox.Option
        value={item.value}
        key={item.value}
        onMouseOver={() => setPieceSet(item.value)}
      >
        <Text fz="sm" fw={500}>
          {item.label}
        </Text>
      </Combobox.Option>
    ));

  const selected = [...customItems, ...pieceSets].find((p) => p.value === pieceSet);

  async function loadFromFolder() {
    const directory = await open({ directory: true, multiple: false });
    if (typeof directory !== "string") return;
    setLoading(true);
    try {
      const set = await importPieceSetFromFolder(directory);
      setCustomSets((previous) => [...previous.filter((s) => s.id !== set.id), set]);
      setPieceSet(customPieceSetValue(set.id));
      notifications.show({
        color: "green",
        message: t("Settings.Appearance.PieceSet.Custom.Loaded", {
          defaultValue: "Piece set “{{name}}” loaded.",
          name: set.name,
        }),
      });
    } catch (error) {
      notifications.show({
        color: "red",
        title: t("Settings.Appearance.PieceSet.Custom.Error", "Could not load the piece set"),
        message:
          error instanceof MissingPiecesError
            ? t("Settings.Appearance.PieceSet.Custom.Missing", {
                defaultValue: "The folder has no image for: {{pieces}}.",
                pieces: error.missing.join(", "),
              })
            : error instanceof PieceFileTooLargeError
              ? t("Settings.Appearance.PieceSet.Custom.TooLarge", {
                  defaultValue: "{{file}} is larger than 2 MB.",
                  file: error.fileName,
                })
              : String(error),
      });
    } finally {
      setLoading(false);
    }
  }

  async function removeSelected() {
    const id = customPieceSetIdOf(pieceSet);
    setPieceSet(DEFAULT_PIECE_SET);
    setCustomSets((previous) => previous.filter((s) => s.id !== id));
    await removeCustomPieceSet(id).catch(() => undefined);
  }

  return (
    <Stack gap="xs" align="flex-end">
      <Flex justify="space-between" align="center" gap="md" w="100%">
        <DisplayPieces />
        <Combobox
          store={combobox}
          withinPortal={false}
          onOptionSubmit={(val) => {
            setPieceSet(val);
            combobox.closeDropdown();
          }}
        >
          <Combobox.Target>
            <InputBase
              component="button"
              type="button"
              pointer
              onClick={() => combobox.toggleDropdown()}
              multiline
              w="10rem"
            >
              {selected ? (
                <Text fz="sm" fw={500}>
                  {selected.label}
                </Text>
              ) : (
                <Input.Placeholder>{t("Common.PickValue")}</Input.Placeholder>
              )}
            </InputBase>
          </Combobox.Target>

          <Combobox.Dropdown>
            <Combobox.Options>
              <ScrollArea.Autosize mah={200} type="always" scrollbars="y">
                {customItems.length > 0 && (
                  <Combobox.Group
                    label={t("Settings.Appearance.PieceSet.Custom.Group", "Your sets")}
                  >
                    {optionsOf(customItems)}
                  </Combobox.Group>
                )}
                {customItems.length > 0 ? (
                  <Combobox.Group
                    label={t("Settings.Appearance.PieceSet.Custom.Included", "Included")}
                  >
                    {optionsOf(pieceSets)}
                  </Combobox.Group>
                ) : (
                  optionsOf(pieceSets)
                )}
              </ScrollArea.Autosize>
            </Combobox.Options>
          </Combobox.Dropdown>
        </Combobox>
      </Flex>
      <Group gap="xs">
        {isCustomPieceSet(pieceSet) && (
          <Button
            size="xs"
            variant="subtle"
            color="red"
            leftSection={<IconTrash size="0.9rem" />}
            onClick={() => void removeSelected()}
          >
            {t("Settings.Appearance.PieceSet.Custom.Remove", "Remove this set")}
          </Button>
        )}
        <Button
          size="xs"
          variant="default"
          leftSection={<IconFolderOpen size="0.9rem" />}
          loading={loading}
          onClick={() => void loadFromFolder()}
        >
          {t("Settings.Appearance.PieceSet.Custom.Load", "Load from a folder…")}
        </Button>
      </Group>
      <Text size="xs" c="dimmed" ta="right" maw="24rem">
        {t(
          "Settings.Appearance.PieceSet.Custom.Hint",
          "A folder with 12 images (PNG, SVG or WebP) named wP, wN, wB, wR, wQ, wK, bP, bN, bB, bR, bQ, bK.",
        )}
      </Text>
    </Stack>
  );
}
