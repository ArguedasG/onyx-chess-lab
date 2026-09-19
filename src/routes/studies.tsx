import { createFileRoute } from "@tanstack/react-router";
import StudiesPage from "@/components/studies/StudiesPage";

export const Route = createFileRoute("/studies")({
  component: StudiesPage,
  loader: ({ context: { loadDirs } }) => loadDirs(),
});
