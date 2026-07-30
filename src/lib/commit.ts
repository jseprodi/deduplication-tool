import type { ManagementClient } from "./clients";
import type { PlanEntry, VariantWriteAudit } from "../types";
import { mapWithConcurrency } from "./concurrency";

function variantKey(itemCodename: string, languageCodename: string): string {
  return `${itemCodename}__${languageCodename}`;
}

/**
 * M5 — one upsert per variant, only the changed elements included so untouched
 * values are left exactly as they were. Skips variants already recorded as
 * successful in `alreadySucceeded` so a retry after a partial failure can't
 * double-apply a swap.
 */
export async function commitPlan(
  mapi: ManagementClient,
  plan: PlanEntry[],
  alreadySucceeded: Set<string> = new Set(),
  onProgress?: (audit: VariantWriteAudit) => void,
  concurrency = 4
): Promise<VariantWriteAudit[]> {
  return mapWithConcurrency(plan, concurrency, async (entry) => {
    const key = variantKey(entry.itemCodename, entry.languageCodename);
    const audit: VariantWriteAudit = {
      itemCodename: entry.itemCodename,
      languageCodename: entry.languageCodename,
      before: entry.changes.map((c) => ({ elementId: c.elementId, value: c.before })),
      after: entry.changes.map((c) => ({ elementId: c.elementId, value: c.after })),
      status: alreadySucceeded.has(key) ? "success" : "pending",
      createdNewVersion: entry.willCreateNewVersion,
    };

    if (audit.status === "success") {
      onProgress?.(audit);
      return audit;
    }

    try {
      await mapi
        .upsertLanguageVariant()
        .byItemCodename(entry.itemCodename)
        .byLanguageCodename(entry.languageCodename)
        .withData((builder) => ({
          elements: entry.changes.map((c) => builder.any({ element: { id: c.elementId }, value: c.after })),
        }))
        .toPromise();
      audit.status = "success";
    } catch (err) {
      audit.status = "failed";
      audit.error = err instanceof Error ? err.message : String(err);
    }

    onProgress?.(audit);
    return audit;
  });
}

/** M6 verify step — re-queries Used-In for a loser and confirms it comes back empty. */
export async function verifyLoserHasNoReferences(
  delivery: import("./clients").DeliveryClient,
  loserCodename: string,
  typeFilter: string[]
): Promise<boolean> {
  let query = delivery.itemUsedIn(loserCodename);
  if (typeFilter.length > 0) query = query.types(typeFilter);
  const result = await query.toAllPromise();
  return result.data.items.length === 0;
}
