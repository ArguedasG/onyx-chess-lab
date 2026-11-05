import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import DatabasesPage from "@/components/databases/DatabasesPage";
import { activeDatabaseViewStore } from "@/state/store/database";

export const Route = createFileRoute("/databases/")({
  component: DatabasesPage,
  /** `add` opens the Add database dialog on arrival. */
  validateSearch: z.object({ add: z.boolean().optional() }),
  beforeLoad: async ({ search }) => {
    const db = activeDatabaseViewStore.getState().database;

    if (db && !search.add) {
      throw redirect({
        to: "/databases/$databaseId",
        params: { databaseId: db.title },
      });
    }
    return null;
  },
});
