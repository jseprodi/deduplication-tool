export type ElementKind = "modular_content" | "rich_text" | "url_slug" | "other";

export interface AppConfig {
  managementApiKey: string;
  archiveWorkflowCodename: string;
  archiveStepCodename: string;
}

export interface ReferencingRecord {
  itemCodename: string;
  itemId: string;
  itemName: string;
  typeCodename: string;
  collectionCodename: string;
  workflowCodename: string;
  workflowStepCodename: string;
  languageCodename: string;
  losers: Set<string>; // loser codenames referenced by this (item, language)
}

export type MatchKind = "swap" | "manual";

export interface ElementChange {
  elementId: string;
  elementCodename: string;
  elementKind: ElementKind;
  losersInElement: string[]; // codenames matched in this element
  matchKind: MatchKind;
  before: unknown;
  after: unknown; // undefined when matchKind === "manual"
}

export interface PlanEntry {
  itemCodename: string;
  itemId: string;
  itemName: string;
  typeCodename: string;
  collectionCodename: string;
  workflowCodename: string;
  workflowStepCodename: string;
  languageCodename: string;
  losers: string[]; // all losers referenced by this variant
  changes: ElementChange[]; // swappable changes only (manual changes tracked separately)
  manualChanges: ElementChange[];
  willCreateNewVersion: boolean;
}

export interface LoserInfo {
  codename: string;
  id: string;
  name: string;
  typeId: string;
  languages: string[];
  workflowByLanguage: Record<string, { workflowCodename: string; stepCodename: string }>;
  slugByLanguage: Record<string, string | null>;
}

export interface WinnerInfo {
  codename: string;
  id: string;
  name: string;
}

export type RunStatus = "idle" | "discovering" | "planning" | "committing" | "retiring" | "done" | "error";

export interface VariantWriteAudit {
  itemCodename: string;
  languageCodename: string;
  before: { elementId: string; value: unknown }[];
  after: { elementId: string; value: unknown }[];
  status: "pending" | "success" | "failed";
  error?: string;
  createdNewVersion: boolean;
}

export interface LoserRetireAudit {
  loserCodename: string;
  languageCodename: string;
  priorWorkflowCodename: string;
  priorStepCodename: string;
  slug: string | null;
  status: "pending" | "success" | "failed";
  error?: string;
}

export interface Changeset {
  runId: string;
  timestamp: string;
  operatorEmail: string;
  winner: string;
  losers: string[];
  variantWrites: VariantWriteAudit[];
  loserRetires: LoserRetireAudit[];
  undoneAt?: string;
}

export interface MergeSetInput {
  winner: string;
  losers: string[];
  typeFilter: string[]; // content type codenames to scope discovery; empty = all types
}
