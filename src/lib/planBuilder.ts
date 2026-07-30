import type { ManagementClient } from "./clients";
import type { ContentTypeCache } from "./contentTypeCache";
import type { RefCaches } from "./refCaches";
import type { ElementChange, LoserInfo, PlanEntry, ReferencingRecord, WinnerInfo } from "../types";
import { scanLinkedItems, swapLinkedItems } from "./linkedItems";
import { scanRichText, rewriteRichText } from "./richText";
import { mapWithConcurrency } from "./concurrency";

interface RefValue {
  id?: string;
  codename?: string;
}

/**
 * M3 — read each referencing variant once via MAPI, locate every loser reference
 * in linked-items and rich-text elements, and build the (not-yet-written) plan.
 * Nothing is written here; re-reading a variant afterwards proves nothing changed.
 */
export async function buildPlan(
  mapi: ManagementClient,
  contentTypeCache: ContentTypeCache,
  refCaches: RefCaches,
  winner: WinnerInfo,
  losers: LoserInfo[],
  referencing: ReferencingRecord[],
  concurrency = 6
): Promise<PlanEntry[]> {
  const loserCodenames = new Set(losers.map((l) => l.codename));
  const loserIdByCodename = new Map(losers.map((l) => [l.codename, l.id] as const));
  const loserCodenameToWinnerCodename = new Map(losers.map((l) => [l.codename, winner.codename] as const));
  const loserIdToWinnerId = new Map(losers.map((l) => [l.id, winner.id] as const));

  const entries = await mapWithConcurrency(referencing, concurrency, async (record) => {
    const [variantResponse, schema] = await Promise.all([
      mapi
        .viewLanguageVariant()
        .byItemCodename(record.itemCodename)
        .byLanguageCodename(record.languageCodename)
        .toPromise(),
      contentTypeCache.getByCodename(record.typeCodename),
    ]);

    const changes: ElementChange[] = [];
    const manualChanges: ElementChange[] = [];

    for (const element of variantResponse.data.elements) {
      const elementId = element.element.id;
      if (!elementId) continue;
      const info = schema.elementsById.get(elementId);
      if (!info) continue;

      if (info.kind === "modular_content") {
        const value = (element.value as RefValue[] | null) ?? null;
        const matched = scanLinkedItems(value, loserCodenames, loserIdByCodename);
        if (matched.size > 0) {
          const after = swapLinkedItems(value, loserCodenames, loserIdByCodename, winner.id);
          changes.push({
            elementId,
            elementCodename: info.codename,
            elementKind: "modular_content",
            losersInElement: Array.from(matched),
            matchKind: "swap",
            before: value,
            after,
          });
        }
      } else if (info.kind === "rich_text") {
        const value = (element.value as string | null) ?? null;
        const scan = scanRichText(value, loserCodenames, loserIdByCodename);
        if (scan.swappableLosers.size > 0 && value) {
          const after = rewriteRichText(value, loserCodenameToWinnerCodename, loserIdToWinnerId);
          changes.push({
            elementId,
            elementCodename: info.codename,
            elementKind: "rich_text",
            losersInElement: Array.from(scan.swappableLosers),
            matchKind: "swap",
            before: value,
            after,
          });
        }
        if (scan.manualLosers.size > 0) {
          manualChanges.push({
            elementId,
            elementCodename: info.codename,
            elementKind: "rich_text",
            losersInElement: Array.from(scan.manualLosers),
            matchKind: "manual",
            before: value,
            after: undefined,
          });
        }
      }
    }

    if (changes.length === 0 && manualChanges.length === 0) return null;

    const entry: PlanEntry = {
      itemCodename: record.itemCodename,
      itemId: record.itemId,
      itemName: record.itemName,
      typeCodename: record.typeCodename,
      collectionCodename: record.collectionCodename,
      workflowCodename: record.workflowCodename,
      workflowStepCodename: record.workflowStepCodename,
      languageCodename: record.languageCodename,
      losers: Array.from(record.losers),
      changes,
      manualChanges,
      willCreateNewVersion: refCaches.isPublishedStep(record.workflowCodename, record.workflowStepCodename),
    };
    return entry;
  });

  return entries.filter((e): e is PlanEntry => e !== null);
}
