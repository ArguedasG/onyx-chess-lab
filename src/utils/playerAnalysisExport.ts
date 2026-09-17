import { ask, save } from "@tauri-apps/plugin-dialog";
import { exists, writeTextFile } from "@tauri-apps/plugin-fs";
import type { StoredPlayerAnalysis } from "@/state/playerAnalysis";

const escapeHtml = (value: unknown) =>
    String(value ?? "").replace(
        /[&<>"']/g,
        (character) =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
    );

export function playerAnalysisHtml(profile: StoredPlayerAnalysis): string {
    const metadata = profile.metadata;
    const bucketRows = (rows: typeof metadata.byColor) =>
        rows
            .map(
                (row) =>
                    `<tr><td>${escapeHtml(row.key)}</td><td>${row.games}</td><td>${row.wins}-${row.draws}-${row.losses}</td><td>${row.scorePercent?.toFixed(1) ?? "—"}%</td><td>${row.averageOpponentElo?.toFixed(0) ?? "—"}</td></tr>`,
            )
            .join("");
    const table = (title: string, rows: typeof metadata.byColor) =>
        `<h2>${escapeHtml(title)}</h2><table><thead><tr><th>Group</th><th>Games</th><th>W-D-L</th><th>Score</th><th>Opponent Elo</th></tr></thead><tbody>${bucketRows(rows)}</tbody></table>`;
    const findings = metadata.findings
        .map(
            (finding) =>
                `<li><strong>${escapeHtml(finding.subject)}</strong> · ${escapeHtml(finding.priority)} · ${finding.sampleSize} games · ${finding.scorePercent?.toFixed(1) ?? "—"}%</li>`,
        )
        .join("");
    const engine = profile.engine
        ? `<h2>Engine sample</h2><p>${profile.engine.engine.name} · ${profile.engine.analyzedGames}/${profile.engine.eligibleGames} games · ACPL ${profile.engine.acpl?.toFixed(1) ?? "—"} · ${profile.engine.inaccuracies} inaccuracies · ${profile.engine.mistakes} mistakes · ${profile.engine.blunders} blunders</p>`
        : "";
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${escapeHtml(profile.playerName)}</title><style>body{font:15px system-ui,sans-serif;max-width:1100px;margin:auto;padding:32px;color:#202522}h1{margin-bottom:4px}small{color:#65706a}table{width:100%;border-collapse:collapse;margin-bottom:28px}th,td{text-align:left;padding:8px;border-bottom:1px solid #ddd}th{background:#edf1ee}li{margin:8px 0}@media print{body{padding:0}}</style></head><body><h1>${escapeHtml(profile.playerName)}</h1><small>${escapeHtml(metadata.generatedAt)} · ${metadata.sampleSize} games · schema ${profile.schemaVersion}</small><p>Sources: ${metadata.sources.map((source) => escapeHtml(`${source.playerName} — ${source.databaseTitle}`)).join(" · ")}</p>${table("By color", metadata.byColor)}${table("By time control", metadata.byTimeControl)}${table("Openings", metadata.openings)}<h2>Findings</h2><ul>${findings}</ul>${engine}</body></html>`;
}

export async function savePlayerAnalysisExport(
    profile: StoredPlayerAnalysis,
    format: "json" | "html",
): Promise<boolean> {
    const selected = await save({
        defaultPath: `player-analysis-${profile.playerName.replace(/[^a-z0-9_-]+/gi, "-")}.${format}`,
        filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });
    if (!selected) return false;
    const destination = selected.toLowerCase().endsWith(`.${format}`)
        ? selected
        : `${selected}.${format}`;
    if (
        (await exists(destination)) &&
        !(await ask(`Overwrite ${destination}?`, { kind: "warning" }))
    )
        return false;
    const content =
        format === "json" ? JSON.stringify(profile, null, 2) : playerAnalysisHtml(profile);
    await writeTextFile(destination, content);
    return true;
}
