import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/tournaments")({
  // Loaded on first visit: the section never weighs on startup.
  component: lazyRouteComponent(() => import("@/components/tournaments/TournamentsPage")),
});
