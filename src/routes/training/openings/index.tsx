import { createFileRoute } from "@tanstack/react-router";
import { OpeningLibraryPage } from "@/components/training/OpeningRepertoireBrowser";

export const Route = createFileRoute("/training/openings/")({
  component: OpeningLibraryPage,
});
