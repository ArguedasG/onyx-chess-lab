import { Alert, Button, Stack, Text } from "@mantine/core";
import { IconAlertCircle, IconRefresh } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/** Error shown when a download catalog could not be fetched, with a way to try again. */
export default function CatalogErrorAlert({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [retrying, setRetrying] = useState(false);

  return (
    <Alert icon={<IconAlertCircle size="1rem" />} title={t("Common.Error")} color="red">
      <Stack gap="xs" align="flex-start">
        <Text size="sm">{message}</Text>
        <Button
          size="compact-sm"
          variant="light"
          color="red"
          loading={retrying}
          leftSection={<IconRefresh size={14} />}
          onClick={async () => {
            setRetrying(true);
            try {
              await onRetry();
            } finally {
              setRetrying(false);
            }
          }}
        >
          {t("Common.Retry", "Retry")}
        </Button>
      </Stack>
    </Alert>
  );
}
