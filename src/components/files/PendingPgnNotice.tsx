import { Alert, Text } from "@mantine/core";
import { IconFileImport } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

function baseName(path: string) {
  return path.split(/[\\/]/).pop() ?? path;
}

/** Tells the user which file from Files the next import will use, and lets them drop it. */
export default function PendingPgnNotice({
  path,
  onClear,
}: {
  path: string | null;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  if (!path) return null;
  return (
    <Alert
      color="blue"
      variant="light"
      icon={<IconFileImport size={18} />}
      withCloseButton
      closeButtonLabel={t("Files.Pending.Discard", "Use another file")}
      onClose={onClear}
      title={t("Files.Pending.Title", "PGN sent from Files")}
    >
      <Text size="sm">
        {t(
          "Files.Pending.Message",
          "{{name}} will be used when you continue; adjust the name and settings first if needed.",
          { name: baseName(path) },
        )}
      </Text>
    </Alert>
  );
}
