import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/training/openings")({
  component: Outlet,
  loader: ({ context: { loadDirs } }) => loadDirs(),
});
