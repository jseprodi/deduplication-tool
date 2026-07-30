import type { ManagementClient } from "./clients";
import type { ContentTypeCache } from "./contentTypeCache";
import type { AppConfig, LoserInfo, LoserRetireAudit } from "../types";
import { mapWithConcurrency } from "./concurrency";

interface LoserLanguageTask {
  loser: LoserInfo;
  languageCodename: string;
}

async function readSlug(
  mapi: ManagementClient,
  contentTypeCache: ContentTypeCache,
  loser: LoserInfo,
  languageCodename: string
): Promise<string | null> {
  try {
    const [variant, schema] = await Promise.all([
      mapi.viewLanguageVariant().byItemCodename(loser.codename).byLanguageCodename(languageCodename).toPromise(),
      contentTypeCache.getById(loser.typeId),
    ]);
    for (const element of variant.data.elements) {
      const info = element.element.id ? schema.elementsById.get(element.element.id) : undefined;
      if (info?.kind === "url_slug") {
        return (element.value as string | null) ?? null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * M6 — move every loser variant to the configured archive workflow step. Never
 * deletes. Records the prior step and slug for each variant so a run can be
 * reversed and redirects can be handled downstream later.
 */
export async function retireLosers(
  mapi: ManagementClient,
  contentTypeCache: ContentTypeCache,
  losers: LoserInfo[],
  config: AppConfig,
  onProgress?: (audit: LoserRetireAudit) => void,
  concurrency = 4
): Promise<LoserRetireAudit[]> {
  const tasks: LoserLanguageTask[] = losers.flatMap((loser) =>
    loser.languages.map((languageCodename) => ({ loser, languageCodename }))
  );

  return mapWithConcurrency(tasks, concurrency, async ({ loser, languageCodename }) => {
    const priorWorkflow = loser.workflowByLanguage[languageCodename];
    const slug = await readSlug(mapi, contentTypeCache, loser, languageCodename);

    const audit: LoserRetireAudit = {
      loserCodename: loser.codename,
      languageCodename,
      priorWorkflowCodename: priorWorkflow?.workflowCodename ?? "",
      priorStepCodename: priorWorkflow?.stepCodename ?? "",
      slug,
      status: "pending",
    };

    try {
      await mapi
        .changeWorkflowOfLanguageVariant()
        .byItemCodename(loser.codename)
        .byLanguageCodename(languageCodename)
        .withData({
          workflow_identifier: { codename: config.archiveWorkflowCodename },
          step_identifier: { codename: config.archiveStepCodename },
        })
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
