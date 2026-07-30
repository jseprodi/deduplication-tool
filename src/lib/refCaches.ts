import type { ManagementClient } from "./clients";

/** id -> codename lookups for languages and workflow steps. Fetched once, reused for the whole run. */
export class RefCaches {
  private languageIdToCodename = new Map<string, string>();
  private workflowIdToCodename = new Map<string, string>();
  private stepIdToCodename = new Map<string, string>();
  private publishedStepByWorkflowCodename = new Map<string, string>();
  private loaded = false;
  private mapi: ManagementClient;

  constructor(mapi: ManagementClient) {
    this.mapi = mapi;
  }

  async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    const [languages, workflows] = await Promise.all([
      this.mapi.listLanguages().toAllPromise(),
      this.mapi.listWorkflows().toPromise(),
    ]);

    for (const lang of languages.data.items) {
      this.languageIdToCodename.set(lang.id, lang.codename);
    }

    for (const wf of workflows.data) {
      this.workflowIdToCodename.set(wf.id, wf.codename);
      const steps = [wf.publishedStep, wf.scheduledStep, wf.archivedStep, ...wf.steps];
      for (const step of steps) {
        if (step?.id && step?.codename) this.stepIdToCodename.set(step.id, step.codename);
      }
      if (wf.publishedStep?.codename) this.publishedStepByWorkflowCodename.set(wf.codename, wf.publishedStep.codename);
    }

    this.loaded = true;
  }

  languageCodename(id: string): string {
    return this.languageIdToCodename.get(id) ?? id;
  }

  workflowCodename(id: string): string {
    return this.workflowIdToCodename.get(id) ?? id;
  }

  stepCodename(id: string): string {
    return this.stepIdToCodename.get(id) ?? id;
  }

  isPublishedStep(workflowCodename: string, stepCodename: string): boolean {
    return this.publishedStepByWorkflowCodename.get(workflowCodename) === stepCodename;
  }
}
