import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/training/openings/$repertoireId")({
  component: Outlet,
});
