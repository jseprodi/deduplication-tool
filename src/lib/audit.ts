import type { ManagementClient } from "./clients";
import type { Changeset, VariantWriteAudit, LoserRetireAudit } from "../types";
import { mapWithConcurrency } from "./concurrency";

export function newRunId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function buildChangeset(params: {
  runId: string;
  operatorEmail: string;
  winner: string;
  losers: string[];
  variantWrites: VariantWriteAudit[];
  loserRetires: LoserRetireAudit[];
}): Changeset {
  return {
    runId: params.runId,
    timestamp: new Date().toISOString(),
    operatorEmail: params.operatorEmail,
    winner: params.winner,
    losers: params.losers,
    variantWrites: params.variantWrites,
    loserRetires: params.loserRetires,
  };
}

export function changesetToJson(changeset: Changeset): string {
  return JSON.stringify(changeset, null, 2);
}

export function changesetToCsv(changeset: Changeset): string {
  const rows: string[] = ["record_type,item_or_loser,language,status,detail"];
  for (const v of changeset.variantWrites) {
    rows.push(
      `variant_write,${v.itemCodename},${v.languageCodename},${v.status},"${v.error ?? `${v.after.length} element(s) changed`}"`
    );
  }
  for (const r of changeset.loserRetires) {
    rows.push(
      `loser_retire,${r.loserCodename},${r.languageCodename},${r.status},"${r.error ?? `moved to ${r.priorStepCodename} -> archive`}"`
    );
  }
  return rows.join("\n");
}

export interface UndoResult {
  variantResults: { itemCodename: string; languageCodename: string; status: "success" | "failed"; error?: string }[];
  retireResults: { loserCodename: string; languageCodename: string; status: "success" | "failed"; error?: string }[];
}

/** Restores every recorded before-value and returns every loser to its prior step. */
export async function undoRun(mapi: ManagementClient, changeset: Changeset, concurrency = 4): Promise<UndoResult> {
  const variantResults = await mapWithConcurrency(
    changeset.variantWrites.filter((v) => v.status === "success"),
    concurrency,
    async (write) => {
      try {
        await mapi
          .upsertLanguageVariant()
          .byItemCodename(write.itemCodename)
          .byLanguageCodename(write.languageCodename)
          .withData((builder) => ({
            elements: write.before.map((c) => builder.any({ element: { id: c.elementId }, value: c.value })),
          }))
          .toPromise();
        return { itemCodename: write.itemCodename, languageCodename: write.languageCodename, status: "success" as const };
      } catch (err) {
        return {
          itemCodename: write.itemCodename,
          languageCodename: write.languageCodename,
          status: "failed" as const,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
  );

  const retireResults = await mapWithConcurrency(
    changeset.loserRetires.filter((r) => r.status === "success"),
    concurrency,
    async (retire) => {
      try {
        await mapi
          .changeWorkflowOfLanguageVariant()
          .byItemCodename(retire.loserCodename)
          .byLanguageCodename(retire.languageCodename)
          .withData({
            workflow_identifier: { codename: retire.priorWorkflowCodename },
            step_identifier: { codename: retire.priorStepCodename },
          })
          .toPromise();
        return { loserCodename: retire.loserCodename, languageCodename: retire.languageCodename, status: "success" as const };
      } catch (err) {
        return {
          loserCodename: retire.loserCodename,
          languageCodename: retire.languageCodename,
          status: "failed" as const,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
  );

  changeset.undoneAt = new Date().toISOString();
  return { variantResults, retireResults };
}
