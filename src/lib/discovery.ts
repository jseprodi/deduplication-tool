import type { DeliveryClient, ManagementClient } from "./clients";
import type { LoserInfo, MergeSetInput, ReferencingRecord, WinnerInfo } from "../types";
import { RefCaches } from "./refCaches";
import { mapWithConcurrency } from "./concurrency";

export class ValidationError extends Error {}

export interface ResolvedMergeSet {
  winner: WinnerInfo;
  losers: LoserInfo[];
  warnings: string[];
}

function normalizeCodenameList(raw: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

/** Splits a pasted textarea (newline or comma separated) into codenames. */
export function parseLoserList(raw: string): string[] {
  return normalizeCodenameList(raw.split(/[\n,]/));
}

/**
 * M1 — validate and resolve the merge set: winner must not be in the losers list,
 * losers are deduped, every item must exist, and a content-type mismatch is a
 * warning (not a block).
 */
export async function resolveMergeSet(
  mapi: ManagementClient,
  refCaches: RefCaches,
  input: MergeSetInput
): Promise<ResolvedMergeSet> {
  const winnerCodename = input.winner.trim();
  if (!winnerCodename) throw new ValidationError("Winner codename is required.");

  const loserCodenames = normalizeCodenameList(input.losers);
  if (loserCodenames.includes(winnerCodename)) {
    throw new ValidationError("The winner cannot also appear in the losers list.");
  }
  if (loserCodenames.length === 0) {
    throw new ValidationError("At least one loser codename is required.");
  }

  await refCaches.ensureLoaded();

  const winnerItem = await mapi.viewContentItem().byItemCodename(winnerCodename).toPromise().catch(() => {
    throw new ValidationError(`Winner "${winnerCodename}" does not exist.`);
  });

  const loserItems = await mapWithConcurrency(loserCodenames, 6, async (codename) => {
    try {
      return await mapi.viewContentItem().byItemCodename(codename).toPromise();
    } catch {
      throw new ValidationError(`Loser "${codename}" does not exist.`);
    }
  });

  const warnings: string[] = [];
  for (const loserItem of loserItems) {
    if (loserItem.data.type.id !== winnerItem.data.type.id) {
      warnings.push(
        `"${loserItem.data.codename}" is a different content type than the winner "${winnerItem.data.codename}".`
      );
    }
  }

  const losers = await mapWithConcurrency(loserItems, 6, async (loserItem) => buildLoserInfo(mapi, refCaches, loserItem.data));

  return {
    winner: { codename: winnerItem.data.codename, id: winnerItem.data.id, name: winnerItem.data.name },
    losers,
    warnings,
  };
}

async function buildLoserInfo(
  mapi: ManagementClient,
  refCaches: RefCaches,
  loserItem: { id: string; codename: string; name: string; type: { id?: string } }
): Promise<LoserInfo> {
  const variants = await mapi.listLanguageVariantsOfItem().byItemCodename(loserItem.codename).toPromise();

  const languages: string[] = [];
  const workflowByLanguage: LoserInfo["workflowByLanguage"] = {};
  const slugByLanguage: LoserInfo["slugByLanguage"] = {};

  for (const variant of variants.data.items) {
    const languageCodename = refCaches.languageCodename(variant.language.id!);
    languages.push(languageCodename);
    workflowByLanguage[languageCodename] = {
      workflowCodename: refCaches.workflowCodename(variant.workflow.workflowIdentifier.id!),
      stepCodename: refCaches.stepCodename(variant.workflow.stepIdentifier.id!),
    };
    slugByLanguage[languageCodename] = null; // filled in lazily by planBuilder/retire using contentTypeCache
  }

  return {
    codename: loserItem.codename,
    id: loserItem.id,
    name: loserItem.name,
    typeId: loserItem.type.id ?? "",
    languages,
    workflowByLanguage,
    slugByLanguage,
  };
}

/**
 * M2 — run Delivery Used-In for each loser, paginate to completion, scope by
 * content type, and aggregate into one referencing-item set keyed by
 * (item codename, language) so a shared item is only handled once even if it
 * references multiple losers.
 */
export async function discoverReferences(
  delivery: DeliveryClient,
  losers: string[],
  typeFilter: string[]
): Promise<ReferencingRecord[]> {
  const byKey = new Map<string, ReferencingRecord>();

  await mapWithConcurrency(losers, 4, async (loserCodename) => {
    let query = delivery.itemUsedIn(loserCodename);
    if (typeFilter.length > 0) query = query.types(typeFilter);
    const result = await query.toAllPromise();

    for (const item of result.data.items) {
      const key = `${item.system.codename}__${item.system.language}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.losers.add(loserCodename);
      } else {
        byKey.set(key, {
          itemCodename: item.system.codename,
          itemId: item.system.id,
          itemName: item.system.name,
          typeCodename: item.system.type,
          collectionCodename: item.system.collection,
          workflowCodename: item.system.workflow,
          workflowStepCodename: item.system.workflowStep,
          languageCodename: item.system.language,
          losers: new Set([loserCodename]),
        });
      }
    }
  });

  return Array.from(byKey.values());
}
