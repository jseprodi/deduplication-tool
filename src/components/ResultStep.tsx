import { useState } from "react";
import type { Changeset, LoserRetireAudit, VariantWriteAudit } from "../types";
import type { ResolvedMergeSet } from "../lib/discovery";
import { undoRun, type UndoResult } from "../lib/audit";
import type { ManagementClient } from "../lib/clients";

export function ResultStep({
  resolved,
  variantWrites,
  verification,
  loserRetires,
  changeset,
  mapi,
  onDownloadJson,
  onDownloadCsv,
  onStartOver,
}: {
  resolved: ResolvedMergeSet;
  variantWrites: VariantWriteAudit[];
  verification: Record<string, boolean>;
  loserRetires: LoserRetireAudit[];
  changeset: Changeset;
  mapi: ManagementClient;
  onDownloadJson: () => void;
  onDownloadCsv: () => void;
  onStartOver: () => void;
}) {
  const [undoing, setUndoing] = useState(false);
  const [undoResult, setUndoResult] = useState<UndoResult | null>(null);

  const succeeded = variantWrites.filter((v) => v.status === "success").length;
  const failed = variantWrites.filter((v) => v.status === "failed").length;

  async function handleUndo() {
    setUndoing(true);
    try {
      const result = await undoRun(mapi, changeset);
      setUndoResult(result);
    } finally {
      setUndoing(false);
    }
  }

  return (
    <div className="step">
      <h2>4. Result</h2>

      <div className="summary-counts">
        <span>{succeeded} write(s) succeeded</span>
        {failed > 0 && <span className="warn-text">{failed} write(s) failed</span>}
      </div>

      <h3>Variant writes</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Language</th>
              <th>Status</th>
              <th>New version?</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {variantWrites.map((v) => (
              <tr key={`${v.itemCodename}__${v.languageCodename}`} className={v.status === "failed" ? "manual-row" : ""}>
                <td>{v.itemCodename}</td>
                <td>{v.languageCodename}</td>
                <td>{v.status}</td>
                <td>{v.createdNewVersion ? "Yes" : ""}</td>
                <td>{v.error ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Post-run Used-In verification</h3>
      <ul className="verification-list">
        {resolved.losers.map((l) => (
          <li key={l.codename} className={verification[l.codename] ? "ok" : "warn-text"}>
            {l.codename}: {verification[l.codename] ? "0 references remain" : "references still remain — check before retiring"}
          </li>
        ))}
      </ul>

      <h3>Loser retirement</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Loser</th>
              <th>Language</th>
              <th>Prior step</th>
              <th>Status</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {loserRetires.map((r) => (
              <tr key={`${r.loserCodename}__${r.languageCodename}`} className={r.status === "failed" ? "manual-row" : ""}>
                <td>{r.loserCodename}</td>
                <td>{r.languageCodename}</td>
                <td>{r.priorStepCodename}</td>
                <td>{r.status}</td>
                <td>{r.error ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="result-actions">
        <button className="secondary" onClick={onDownloadJson}>
          Download audit (JSON)
        </button>
        <button className="secondary" onClick={onDownloadCsv}>
          Download audit (CSV)
        </button>
        {!changeset.undoneAt && (
          <button className="primary danger" disabled={undoing} onClick={handleUndo}>
            {undoing ? "Undoing…" : "Undo this run"}
          </button>
        )}
      </div>

      {undoResult && (
        <div className="banner warn">
          Undo complete: {undoResult.variantResults.filter((r) => r.status === "success").length}/
          {undoResult.variantResults.length} variant(s) restored,{" "}
          {undoResult.retireResults.filter((r) => r.status === "success").length}/{undoResult.retireResults.length}{" "}
          loser(s) returned to prior step.
        </div>
      )}

      <button className="secondary" onClick={onStartOver}>
        Start a new merge
      </button>
    </div>
  );
}
