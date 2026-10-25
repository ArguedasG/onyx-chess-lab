/** Turns a generated PGN into an editable repertoire, as Studies does with a copy (8.0). */
import type { OpeningsState } from "@/utils/trainingAreas";
import { addOpeningRepertoire } from "@/utils/trainingAreas";
import { createFile } from "@/utils/files";
import { inspectOpeningPgn, prepareOpeningImport } from "@/utils/openingTraining";
import { writeStudySourcePgn } from "@/utils/studies";
import type { GeneratorColor } from "./types";

export async function createGeneratedRepertoire(input: {
    name: string;
    description: string;
    color: GeneratorColor;
    pgn: string;
    documentDir: string;
}): Promise<(openings: OpeningsState) => OpeningsState> {
    // The generated PGN is kept as an immutable source, like every repertoire copy.
    const sourcePath = await writeStudySourcePgn(input.name, input.pgn);
    const config = {
        color: input.color,
        subvariationPolicy: "all",
        groupingMode: "single",
    } as const;
    const inspection = await inspectOpeningPgn(sourcePath, config);
    const prepared = await prepareOpeningImport(inspection, config);
    if (prepared.variants.length === 0) throw new Error("The generated repertoire has no lines.");
    const created = await createFile({
        filename: `${input.name} - Editable`,
        filetype: "repertoire",
        uniqueName: true,
        pgn: prepared.trainingPgn,
        dir: input.documentDir,
    });
    if (created.isErr) throw created.error;
    return (openings) =>
        addOpeningRepertoire(openings, {
            name: input.name,
            color: input.color,
            description: input.description,
            path: created.value.path,
            sourcePath,
            recordCount: prepared.variants.length,
            subvariationPolicy: "all",
            variants: prepared.variants,
        });
}
