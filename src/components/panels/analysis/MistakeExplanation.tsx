import { List, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { ExplanationSentence } from "@/utils/moveExplanation";

const PIECES = {
  pawn: "the pawn",
  knight: "the knight",
  bishop: "the bishop",
  rook: "the rook",
  queen: "the queen",
  king: "the king",
} as const;

/** Sentences of a mistake explanation; every one comes from engine facts (see moveExplanation). */
export default function MistakeExplanation({ sentences }: { sentences: ExplanationSentence[] }) {
  const { t } = useTranslation();
  if (sentences.length === 0) return null;

  const text = ({ key, params }: ExplanationSentence) => {
    const piece = typeof params.piece === "string" ? params.piece : null;
    const values = piece
      ? {
          ...params,
          piece: t(`Explain.Piece.${piece}`, PIECES[piece as keyof typeof PIECES] ?? piece),
        }
      : params;
    switch (key) {
      case "Explain.AllowsMate":
        return t("Explain.AllowsMate", "{{move}} allows mate in {{moves}}: {{line}}.", values);
      case "Explain.AllowsCapture":
        return t(
          "Explain.AllowsCapture",
          "{{move}} allows {{reply}}, which takes {{piece}} on {{square}}.",
          values,
        );
      case "Explain.Allows":
        return t("Explain.Allows", "{{move}} allows {{reply}}.", values);
      case "Explain.EvalChange":
        return t("Explain.EvalChange", "The evaluation goes from {{before}} to {{after}}.", values);
      case "Explain.BestMates":
        return t("Explain.BestMates", "The best move was {{best}}, mating in {{moves}}.", values);
      default:
        return t("Explain.Best", "The best move was {{best}}.", values);
    }
  };

  return (
    <List size="xs" spacing={2} mt={4}>
      {sentences.map((sentence) => (
        <List.Item key={sentence.key}>
          <Text size="xs">{text(sentence)}</Text>
        </List.Item>
      ))}
    </List>
  );
}
