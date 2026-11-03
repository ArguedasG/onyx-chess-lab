import { Alert, Box, Button, Group, Image, Loader, Stack, Text } from "@mantine/core";
import { IconPhoto, IconRotate } from "@tabler/icons-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { parseFen } from "chessops/fen";
import { useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { type BoardReading, commands } from "@/bindings";
import { diagramDoubtsAtom } from "@/state/diagramReading";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "bmp", "gif"];
const IMAGE_PATH = new RegExp(`\\.(${IMAGE_EXTENSIONS.join("|")})$`, "i");

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** The same board seen from the other side: placement reversed, squares mirrored. */
function flipPlacement(placement: string): string {
  return placement
    .split("/")
    .reverse()
    .map((rank) => [...rank].reverse().join(""))
    .join("/");
}

function flipSquare(square: string): string {
  const file = String.fromCharCode("a".charCodeAt(0) + "h".charCodeAt(0) - square.charCodeAt(0));
  return `${file}${9 - Number(square[1])}`;
}

/** Castling rights a diagram allows: king and rook still on their starting squares. */
function inferCastling(placement: string): string {
  const ranks = placement
    .split("/")
    .map((rank) => rank.replace(/\d/g, (n) => ".".repeat(Number(n))));
  const at = (square: string) => ranks[8 - Number(square[1])]?.[square.charCodeAt(0) - 97];
  let rights = "";
  if (at("e1") === "K" && at("h1") === "R") rights += "K";
  if (at("e1") === "K" && at("a1") === "R") rights += "Q";
  if (at("e8") === "k" && at("h8") === "r") rights += "k";
  if (at("e8") === "k" && at("a8") === "r") rights += "q";
  return rights || "-";
}

type Source = { preview: string | null; label: string };

function ImageReader({
  currentFen,
  onRead,
}: {
  currentFen: string;
  onRead: (fen: string) => void;
}) {
  const { t } = useTranslation();
  const setDoubts = useSetAtom(diagramDoubtsAtom);
  const [reading, setReading] = useState<BoardReading | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const objectUrl = useRef<string | null>(null);

  const apply = useCallback(
    (result: BoardReading, flip: boolean) => {
      if (!result.placement) {
        setDoubts(null);
        return;
      }
      const placement = flip ? flipPlacement(result.placement) : result.placement;
      const turn = parseFen(currentFen).unwrap(
        (setup) => (setup.turn === "white" ? "w" : "b"),
        () => "w",
      );
      onRead(`${placement} ${turn} ${inferCastling(placement)} - 0 1`);
      const doubts: Record<string, string | null> = {};
      for (const square of result.squares) {
        if (result.doubtful.includes(square.square)) {
          doubts[flip ? flipSquare(square.square) : square.square] = square.piece;
        }
      }
      setDoubts(Object.keys(doubts).length > 0 ? doubts : null);
    },
    [currentFen, onRead, setDoubts],
  );

  const read = useCallback(
    async (
      request: Promise<{ status: "ok"; data: BoardReading } | { status: "error"; error: string }>,
      next: Source,
    ) => {
      setLoading(true);
      setError(null);
      setSource(next);
      try {
        const result = await request;
        if (result.status === "error") {
          setReading(null);
          setDoubts(null);
          setError(result.error);
          return;
        }
        setReading(result.data);
        setFlipped(false);
        apply(result.data, false);
      } finally {
        setLoading(false);
      }
    },
    [apply, setDoubts],
  );

  const readBlob = useCallback(
    async (blob: Blob) => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(blob);
      const data = await blobToBase64(blob);
      await read(commands.recognizeBoardImage(data), {
        preview: objectUrl.current,
        label: t("Board.ImageReader.Pasted"),
      });
    },
    [read, t],
  );

  const readPath = useCallback(
    (path: string) =>
      read(commands.recognizeBoardImageFile(path), {
        preview: convertFileSrc(path),
        label: path.split(/[\\/]/).pop() ?? path,
      }),
    [read],
  );

  // Ctrl+V with an image in the clipboard.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const item = [...(event.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      const blob = item?.getAsFile();
      if (!blob) return;
      event.preventDefault();
      void readBlob(blob);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [readBlob]);

  // Image files dropped on the window while the editor is open.
  const readPathRef = useRef(readPath);
  readPathRef.current = readPath;
  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent(({ payload }) => {
        if (payload.type !== "drop") return;
        const image = payload.paths.find((path) => IMAGE_PATH.test(path));
        if (image) void readPathRef.current(image);
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

  // Marks and the preview belong to this editor session.
  useEffect(
    () => () => {
      setDoubts(null);
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [setDoubts],
  );

  const chooseFile = async () => {
    const path = await open({
      multiple: false,
      filters: [{ name: t("Board.ImageReader.Images"), extensions: IMAGE_EXTENSIONS }],
    });
    if (typeof path === "string") await readPath(path);
  };

  const flip = () => {
    if (!reading) return;
    setFlipped(!flipped);
    apply(reading, !flipped);
  };

  const problemText = (problem: string) =>
    problem === "kings"
      ? t("Board.ImageReader.ProblemKings")
      : problem === "pawnOnEdge"
        ? t("Board.ImageReader.ProblemPawnOnEdge")
        : problem === "tooManyPawns"
          ? t("Board.ImageReader.ProblemTooManyPawns")
          : t("Board.ImageReader.ProblemTooManyPieces");
  const problems = reading?.problems.map(problemText) ?? [];
  const grid = reading?.grid;

  return (
    <Stack gap="xs">
      <Group gap="xs" wrap="nowrap">
        <Button
          size="xs"
          variant="default"
          leftSection={<IconPhoto size="1rem" />}
          onClick={() => void chooseFile()}
          loading={loading}
        >
          {t("Board.ImageReader.Open")}
        </Button>
        <Text size="xs" c="dimmed">
          {t("Board.ImageReader.Hint")}
        </Text>
      </Group>

      {loading && (
        <Group gap="xs">
          <Loader size="xs" />
          <Text size="xs">{t("Board.ImageReader.Reading")}</Text>
        </Group>
      )}

      {error && (
        <Alert color="red" p="xs">
          <Text size="xs">{t("Board.ImageReader.Error", { error })}</Text>
        </Alert>
      )}

      {reading && !loading && (
        <Alert
          p="xs"
          color={
            reading.status === "accepted" ? "green" : reading.status === "review" ? "yellow" : "red"
          }
        >
          <Stack gap={6}>
            <Text size="xs" fw={600}>
              {reading.status === "accepted"
                ? t("Board.ImageReader.Accepted")
                : reading.status === "review"
                  ? t("Board.ImageReader.Review", { count: reading.doubtful.length })
                  : t("Board.ImageReader.NoBoard")}
            </Text>
            {problems.length > 0 && <Text size="xs">{problems.join(" · ")}</Text>}
            {reading.status !== "noBoard" && (
              <Text size="xs" c="dimmed">
                {t("Board.ImageReader.Check")}
              </Text>
            )}
            {source?.preview && (
              <Box pos="relative" maw={220}>
                <Image src={source.preview} alt={source.label} radius="xs" />
                {grid && (
                  <Box
                    pos="absolute"
                    style={{
                      left: `${(grid[0] / reading.imageWidth) * 100}%`,
                      top: `${(grid[1] / reading.imageHeight) * 100}%`,
                      width: `${((grid[2] - grid[0]) / reading.imageWidth) * 100}%`,
                      height: `${((grid[3] - grid[1]) / reading.imageHeight) * 100}%`,
                      border: "2px solid var(--mantine-color-blue-5)",
                      pointerEvents: "none",
                    }}
                  />
                )}
              </Box>
            )}
            <Group gap="xs" justify="space-between">
              {reading.status !== "noBoard" && (
                <Button
                  size="compact-xs"
                  variant="default"
                  leftSection={<IconRotate size="0.9rem" />}
                  onClick={flip}
                >
                  {t("Board.ImageReader.Flip")}
                </Button>
              )}
              <Text size="xs" c="dimmed">
                {t("Board.ImageReader.Timing", {
                  ms: reading.elapsedMs,
                  version: reading.modelVersion,
                })}
              </Text>
            </Group>
          </Stack>
        </Alert>
      )}
    </Stack>
  );
}

export default ImageReader;
