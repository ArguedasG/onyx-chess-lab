import { createFileRoute } from "@tanstack/react-router";
import { OpeningRepertoirePage } from "@/components/training/OpeningRepertoireBrowser";

export const Route = createFileRoute("/training/openings/$repertoireId/")({
  component: RepertoireRoute,
});

function RepertoireRoute() {
  const { repertoireId } = Route.useParams();
  return <OpeningRepertoirePage repertoireId={repertoireId} />;
}
