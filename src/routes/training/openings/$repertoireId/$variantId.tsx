import { createFileRoute } from "@tanstack/react-router";
import { OpeningVariantPage } from "@/components/training/OpeningRepertoireBrowser";

export const Route = createFileRoute("/training/openings/$repertoireId/$variantId")({
  component: VariantRoute,
});

function VariantRoute() {
  const { repertoireId, variantId } = Route.useParams();
  return <OpeningVariantPage repertoireId={repertoireId} variantId={variantId} />;
}
