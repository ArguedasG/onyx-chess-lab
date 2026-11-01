import { createFileRoute } from "@tanstack/react-router";
import { getVersion } from "@tauri-apps/api/app";
import SettingsPage from "@/components/settings/SettingsPage";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  // The section to open, for links such as "Change shortcuts" in a first-time hint.
  validateSearch: (search: Record<string, unknown>): { section?: string } =>
    typeof search.section === "string" ? { section: search.section } : {},
  loader: async ({ context: { loadDirs } }) => ({
    dirs: await loadDirs(),
    version: await getVersion(),
  }),
});
