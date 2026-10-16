import { createFileRoute } from "@tanstack/react-router";
import PlayersPage from "@/components/players/PlayersPage";

export const Route = createFileRoute("/players")({
  component: PlayersPage,
});
