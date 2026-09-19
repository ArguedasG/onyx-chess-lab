import { getMainLine, getPGN, parsePGN } from "@/utils/chess";
import type { Study, StudyChapter } from "@/utils/studies";
import type {
    EndgameStudentColor,
    ParsedTrainingRecord,
    TrainingObjective,
} from "@/utils/trainingAreas";
import { getNodeAtPath, treeIterator, type TreeNode } from "@/utils/treeReducer";

export type StudyPositionCandidate = {
    path: number[];
    key: string;
    sanTrail: string;
    fen: string;
    continuationPlies: number;
    hasVariations: boolean;
};

function sanPath(root: TreeNode, path: number[]): string[] {
    const moves: string[] = [];
    let node = root;
    for (const index of path) {
        const child = node.children[index];
        if (!child) break;
        if (child.san) moves.push(child.san);
        node = child;
    }
    return moves;
}

function treeHasVariations(node: TreeNode): boolean {
    return node.children.length > 1 || node.children.some(treeHasVariations);
}

export async function getStudyPositionCandidates(
    pgn: string,
    purpose: "tactics" | "endgames",
): Promise<StudyPositionCandidate[]> {
    const tree = await parsePGN(pgn);
    return [...treeIterator(tree.root)]
        .filter(({ node }) => purpose === "endgames" || node.children.length > 0)
        .map(({ node, position }) => {
            const moves = sanPath(tree.root, position);
            const recent = moves.slice(-4).join(" ");
            return {
                path: position,
                key: position.join(","),
                sanTrail: recent,
                fen: node.fen,
                continuationPlies: getMainLine(node).length,
                hasVariations: treeHasVariations(node),
            };
        });
}

function trainingPgn(
    chapter: StudyChapter,
    node: TreeNode,
    input: { studyId: string; studyName: string; path: number[] },
): string {
    const root: TreeNode = structuredClone({ ...node, move: null, san: null });
    return getPGN(root, {
        headers: {
            id: 0,
            fen: node.fen,
            event: chapter.title,
            site: "Onyx Study",
            white: "",
            black: "",
            result: "*",
            other: {
                StudyName: input.studyName,
                ChapterName: chapter.title,
                OnyxStudyId: input.studyId,
                OnyxChapterId: chapter.id,
                OnyxStudyPath: input.path.join(","),
            },
        },
        comments: true,
        extraMarkups: true,
        glyphs: true,
        variations: true,
    });
}

export async function createStudyTacticsRecord(
    study: Study,
    chapter: StudyChapter,
    path: number[],
): Promise<ParsedTrainingRecord> {
    const tree = await parsePGN(chapter.pgn);
    const node = getNodeAtPath(tree.root, path);
    const moves = getMainLine(node);
    if (moves.length === 0)
        throw new Error(`«${chapter.title}» no tiene solución desde esa posición.`);
    return {
        fen: node.fen,
        moves,
        title: chapter.title,
        sourcePgn: trainingPgn(chapter, node, {
            studyId: study.id,
            studyName: study.name,
            path,
        }),
        studySource: { studyId: study.id, chapterId: chapter.id, path },
        hasExplicitFen: true,
    };
}

export async function createStudyEndgameRecord(
    study: Study,
    chapter: StudyChapter,
    path: number[],
    objective: TrainingObjective,
    studentColor: EndgameStudentColor,
): Promise<ParsedTrainingRecord> {
    const tree = await parsePGN(chapter.pgn);
    const node = getNodeAtPath(tree.root, path);
    return {
        fen: node.fen,
        moves: getMainLine(node),
        title: chapter.title,
        sourcePgn: trainingPgn(chapter, node, {
            studyId: study.id,
            studyName: study.name,
            path,
        }),
        studySource: { studyId: study.id, chapterId: chapter.id, path },
        endgameObjective: objective,
        endgameStudentColor: studentColor,
        hasExplicitFen: true,
    };
}
