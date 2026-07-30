import type { PlanEntry } from "../types";
import type { ResolvedMergeSet } from "../lib/discovery";

export function ConfirmDialog({
  resolved,
  plan,
  archiveStepCodename,
  onCancel,
  onConfirm,
}: {
  resolved: ResolvedMergeSet;
  plan: PlanEntry[];
  archiveStepCodename: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const affected = plan.filter((e) => e.changes.length > 0);
  const totalChanges = affected.reduce((sum, e) => sum + e.changes.length, 0);
  const losersCovered = new Set(plan.flatMap((e) => e.losers)).size;
  const newVersionCount = affected.filter((e) => e.willCreateNewVersion).length;

  return (
    <div className="step confirm-dialog">
      <h2>3. Confirm</h2>
      <p className="confirm-text">
        <strong>{totalChanges}</strong> reference{totalChanges === 1 ? "" : "s"} across{" "}
        <strong>{affected.length}</strong> item{affected.length === 1 ? "" : "s"} will be repointed to the winner{" "}
        <strong>{resolved.winner.codename}</strong> from <strong>{losersCovered}</strong> loser
        {losersCovered === 1 ? "" : "s"}.
      </p>
      <p className="confirm-text">
        All {resolved.losers.length} loser{resolved.losers.length === 1 ? "" : "s"} will move to{" "}
        <strong>{archiveStepCodename}</strong>.
      </p>
      {newVersionCount > 0 && (
        <p className="confirm-text warn-text">
          {newVersionCount} of these item{newVersionCount === 1 ? "" : "s"} {newVersionCount === 1 ? "is" : "are"}{" "}
          currently published — updating {newVersionCount === 1 ? "it" : "them"} will create a new version.
        </p>
      )}
      <p className="hint">This is not reversible from within Kontent.ai directly, but this tool records everything
        needed to undo the run afterwards.</p>
      <div className="confirm-buttons">
        <button className="secondary" onClick={onCancel}>
          Back
        </button>
        <button className="primary danger" onClick={onConfirm}>
          Confirm &amp; run
        </button>
      </div>
    </div>
  );
}
