import type { PlanEntry, ReferencingRecord } from "../types";
import type { ResolvedMergeSet } from "../lib/discovery";

export function ReviewStep({
  resolved,
  referencing,
  plan,
  isBuildingPlan,
  archiveStepCodename,
  onBuildPlan,
  onConfirm,
  onBack,
}: {
  resolved: ResolvedMergeSet;
  referencing: ReferencingRecord[];
  plan: PlanEntry[] | null;
  isBuildingPlan: boolean;
  archiveStepCodename: string;
  onBuildPlan: () => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const totalChanges = plan?.reduce((sum, e) => sum + e.changes.length, 0) ?? 0;
  const totalManual = plan?.reduce((sum, e) => sum + e.manualChanges.length, 0) ?? 0;
  const affectedItems = plan?.filter((e) => e.changes.length > 0).length ?? 0;
  const losersCovered = plan ? new Set(plan.flatMap((e) => e.losers)).size : 0;

  return (
    <div className="step">
      <h2>2. Review</h2>
      <div className="set-header">
        <span>
          <strong>Winner:</strong> {resolved.winner.name} ({resolved.winner.codename})
        </span>
        <span>
          <strong>Losers ({resolved.losers.length}):</strong> {resolved.losers.map((l) => l.codename).join(", ")}
        </span>
        <span>
          <strong>Archive target step:</strong> {archiveStepCodename}
        </span>
      </div>

      {resolved.warnings.length > 0 && (
        <div className="banner warn">
          {resolved.warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      )}

      <h3>Referencing items ({referencing.length})</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Collection</th>
              <th>Step</th>
              <th>Language</th>
              <th>Loser(s)</th>
            </tr>
          </thead>
          <tbody>
            {referencing.map((r) => (
              <tr key={`${r.itemCodename}__${r.languageCodename}`}>
                <td>{r.itemName}</td>
                <td>{r.typeCodename}</td>
                <td>{r.collectionCodename}</td>
                <td>{r.workflowStepCodename}</td>
                <td>{r.languageCodename}</td>
                <td>
                  {Array.from(r.losers).map((l) => (
                    <span className="chip" key={l}>
                      {l}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
            {referencing.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  No items reference any loser for the selected content-type scope.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!plan && (
        <button className="primary" disabled={isBuildingPlan} onClick={onBuildPlan}>
          {isBuildingPlan
            ? "Building plan…"
            : referencing.length === 0
              ? "Continue (no references found)"
              : "Build plan"}
        </button>
      )}

      {plan && (
        <>
          <h3>Plan</h3>
          <div className="summary-counts">
            <span>{totalChanges} change(s)</span>
            <span>{affectedItems} item(s)</span>
            <span>{losersCovered} loser(s) covered</span>
            {totalManual > 0 && <span className="warn-text">{totalManual} manual (excluded)</span>}
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Language</th>
                  <th>Element</th>
                  <th>Kind</th>
                  <th>Loser(s)</th>
                  <th>Status</th>
                  <th>New version?</th>
                </tr>
              </thead>
              <tbody>
                {plan.flatMap((entry) =>
                  [...entry.changes, ...entry.manualChanges].map((change, i) => (
                    <tr key={`${entry.itemCodename}__${entry.languageCodename}__${i}`} className={change.matchKind === "manual" ? "manual-row" : ""}>
                      <td>{entry.itemName}</td>
                      <td>{entry.languageCodename}</td>
                      <td>{change.elementCodename}</td>
                      <td>{change.elementKind}</td>
                      <td>{change.losersInElement.join(", ")}</td>
                      <td>{change.matchKind === "manual" ? "Manual — review by hand" : "Will repoint to winner"}</td>
                      <td>{change.matchKind === "swap" && entry.willCreateNewVersion ? "Yes" : ""}</td>
                    </tr>
                  ))
                )}
                {plan.every((e) => e.changes.length === 0 && e.manualChanges.length === 0) && (
                  <tr>
                    <td colSpan={7} className="empty">
                      No swappable or manual references found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <button className="primary" onClick={onConfirm}>
            Confirm &amp; run
          </button>
          {affectedItems === 0 && (
            <p className="hint">
              No reference swaps needed (already up to date, or no losers had references) — confirming will still
              retire the loser(s) to the archive step.
            </p>
          )}
        </>
      )}

      <button className="secondary" onClick={onBack}>
        Start over
      </button>
    </div>
  );
}
