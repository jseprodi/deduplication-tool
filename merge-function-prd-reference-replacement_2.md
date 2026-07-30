# PRD — Merge Function (Reference Replacement Tool)

**Owner:** Mike Berry (Solution Engineering, Kontent.ai) · **Builder:** Technical Support Engineer (prototype)
**Status:** MVP prototype spec — ready to build
**Source of truth:** Initiatives doc row "Merge Function" + WebMD Ignite call (10 Jun 2026, Tara Records / Michael Berry)
**Driver:** WebMD Ignite (Healthwise) — ~18,000-article library deduplication program

> **Audience tags.** Each section is marked for who should read it:
> **[HUMAN]** product/stakeholder reasoning · **[AI BUILDER]** instructions/contracts for the coding agent · **[BOTH]** review as a human, implement as the agent.
> A separate 1-page implementer briefing will follow this PRD.

---

## 0. How to use this document — [BOTH]

Build the prototype as a **Kontent.ai Custom App** (environment-level), single-page web app, TypeScript + React. This is an **MVP-only** spec: build exactly what's here, nothing more. Don't invent endpoints — the SDK methods and request shapes are pinned in section 8. Build in the phase order in section 9; each phase has testable acceptance criteria. Where something is undecided, it's in **Open Questions** (section 10) with a sensible default — use the default and keep moving.

**Scope in one sentence:** Given one *preferred* item (the **winner**) and a *set* of deprecated items (the **losers**), find every item that references any loser, let a human review the planned changes, repoint all those references to the winner on commit, then archive every loser — auditable and reversible.

**Why a set, not a pair:** A winner rarely has a single duplicate. WebMD's library produces clusters — one item is the keeper and several others are near-duplicates. The unit of work is a **merge set**: one winner plus a list of losers, consolidated in one reviewed operation.

---

## 1. Problem Statement — [HUMAN]

WebMD Ignite has run on Kontent.ai for about a year and now has a large library (~18,000 articles) with accidental duplication. They already have detection tooling — an 800k-row scored spreadsheet — that surfaces, for a given topic, one item worth keeping and several near-duplicates. What they lack is a safe way to *act on that decision inside Kontent.ai*: repoint everything that links to the duplicates so it points at the keeper instead, then retire the duplicates without breaking links or deleting content.

Doing this by hand across a cluster — each duplicate referenced by many items, across many languages — is slow and error-prone, and it risks orphaned references and broken pages. Retiring legacy content is also client-sensitive for WebMD ("we get a lot of communication about it"), so the process has to be reviewable, reversible, and non-destructive. Not solving it stalls their consolidation program and degrades content discovery for end users.

---

## 2. Goals — [HUMAN]

1. **Consolidate a whole cluster in one pass** — the winner plus N losers, discovered, reviewed, and executed as a single operation, not N separate runs.
2. **No orphaned references** — after a run, zero items reference any loser for the handled element types (linked items + rich text), verified by re-querying Used-In.
3. **Reviewable before it's real** — every change is shown in a preview and explicitly confirmed by a human before any write.
4. **Retire safely, not destructively** — every loser moves to an archive workflow step, never hard-deleted.
5. **Fully reversible** — every run produces an audit record sufficient to restore prior state.
6. **Fast at cluster scale** — target: one winner + 5 losers, ~200 references, executed in under 10 minutes of operator time.

---

## 3. Out of Scope — [HUMAN]

Excluded by direct evidence from the call and the requirements row — not parked for later, not built:

1. **Duplicate detection / clustering.** WebMD brings its own scored list. The tool's input is decided already: one item is the winner, the rest are losers.
2. **Modular chunk merging.** The tool does not merge the *contents* of a loser into the winner. Mike on the call: a reference-replacement tool "rather than a modular merging," with chunk-level merge "probably very difficult." An editor who wants a chunk from a loser inside the winner makes that edit by hand first, then runs the tool.
3. **The keep-both / "different moment in care" decision.** Human editorial judgment; the tool only executes a decision already made.
4. **URL slug / redirect handling.** The tool does not modify slug elements or create redirects. The requirements row raises this as an open question (are slugs even in scope? preserve as a redirect?), so it's unresolved and excluded from MVP. The tool *records* each retired loser's slug in the audit so redirects can be handled downstream later.
5. **Cross-environment operation.** Single environment only.

---

## 4. Users & Stories — [HUMAN]

Primary persona: **Integration / Content-Ops editor** (Tara's "integration side — we have to go in and fix a lot of stuff"). Secondary: **Editorial lead** (Heather-type approver).

- As an editor, I want to enter a winner and a *list* of losers so I can consolidate a whole duplicate cluster in one operation.
- As an editor, I want to see every item that references any loser, and which loser(s) each one references, so I understand the blast radius before changing anything.
- As an editor, I want a preview of exactly which references will change to the winner — labelled by source loser — so I can sanity-check before committing.
- As an editor, I want to confirm once and have all references to all losers swapped to the winner so I don't repeat the process N times.
- As an editor, I want every loser moved to an archive step (not deleted) after a successful merge so we keep the content but stop displaying it, pending client approval.
- As an editor, I want one record of everything that changed and a way to reverse it so a bad run can be undone and a client-sensitive change can be explained.

---

## 5. Requirements (MVP) — [BOTH]

Each requirement is anchored to the call or the requirements row so the scope is defensible.

**M1 — Define the merge set.** Operator enters the winner and a list of losers (individual entry and/or paste of a newline list of codenames). Validate: the winner is not in the loser list; dedupe losers; all items exist; warn on content-type mismatch.
*Evidence:* reference-replacement value (row); multi-loser clusters are the core ask.
*Acceptance:* a valid winner + loser list proceeds to discovery; the winner appearing in the loser list is blocked; duplicate losers are deduped.

**M2 — Discover references per loser, aggregated, scoped by content type.** Run Delivery Used-In for each loser, paginate to completion, scope by content type, and aggregate into one referencing-item set that records which loser(s) each item references.
*Evidence:* Mike — "see where a piece of content is used"; "narrow it by content type." Row — Used-In is the deterministic way to retrieve references.
*Acceptance:* the full deduplicated referencing set is retrieved (no page or loser missed), each item showing its loser(s); an item referencing two losers appears once, tagged with both; references inside rich-text components are tagged "manual."

**M3 — Build and show the plan (no writes).** For each referencing variant, read it via the Management API and locate every loser reference in (a) linked-items / modular-content elements and (b) rich-text elements (inline item objects and content links). Show a per-element diff labelled by source loser, grouped per variant. Write nothing yet.
*Evidence:* Row — human review required before replacing; clear confirmation; rich-text and modular references "need handling."
*Acceptance:* operator sees every planned change grouped by item and labelled by loser, with change/item/loser counts; re-reading an item proves nothing changed.

**M4 — Human review and explicit commit.** No write happens until the operator confirms a plain-language summary of what will happen.
*Evidence:* Row — human review + clear confirmation. Call — client-sensitivity of any change.
*Acceptance:* before confirm, zero writes; on confirm, execution begins.

**M5 — Execute the replacement, one write per variant.** Upsert each affected variant with *all* loser references replaced by the winner across linked-items and rich-text elements, in a single write per variant. Dedupe the winner to one entry. Leave untouched values exactly as they were. Surface — don't silently trigger — that upserting a published variant creates a new version.
*Evidence:* Row — rich-text + modular references need handling; "workflow state must be respected or clearly indicated." Call — "replace that reference with the content item I'm looking at."
*Acceptance:* post-run Used-In is empty for every loser (handled types); the winner appears where each loser did; an item referencing two losers is written exactly once with both collapsed to a single winner reference; no unrelated values change.

**M6 — Retire every loser to an archive step (never delete).** Once a loser's references are fully replaced, move its variant(s) to a configurable retirement/archive workflow step. Repeat for all losers. Never call delete.
*Evidence:* Call — Mike: "drop it into a workflow step that's re-archived… get that client approval… not delete it outright but archive it." Row — workflow state respected.
*Acceptance:* each loser sits in the configured archive step, out of the active/published state, with its content still present.

**M7 — Audit and reversibility.** Persist one changeset per run: run id, timestamp, operator, the winner, the full loser list, per-variant before/after element values, each loser's prior workflow step, and each retired loser's slug. Provide a reversal that restores all before-values and returns every loser to its prior step.
*Evidence:* Row — "changes need to be somehow auditable and reversible."
*Acceptance:* the changeset alone can reconstruct prior state; a triggered reversal restores every touched variant and every loser; the reversal is itself logged.

**Edge cases the MVP must handle correctly** (these are correctness, not extra features):
- A loser with zero references → retire it cleanly, or skip.
- The winner appears in the loser list → block.
- Duplicate loser codenames → dedupe silently.
- An item references several losers at once → all collapse to the winner; the item is written **once**.
- An item already references the winner and a loser → dedupe so the winner appears once.
- A loser references another loser in the set → replace references first (loser→loser becomes a reference to the winner), then retire; record both in the audit.
- A reference sits inside a rich-text **component** (inline, not a separate item) → flag/skip, do not mis-handle.
- A published variant where upsert creates a new version → surface it, respect workflow.
- A write fails partway through → partial-failure handling + resumable per-variant audit so a retry doesn't double-apply.

---

## 6. Core Algorithm (pseudocode) — [AI BUILDER]

```
input: winner, losers = [list of loser codenames], typeFilter

1. validate(winner, losers)            // winner not in losers; dedupe losers; all exist
2. refMap = {}                         // referencingItem -> set of losers it references
   for each loser in losers:
     refs = deliveryClient.itemUsedIn(loser)   // paginate via X-Continuation, scope by type
     for each ref in refs: refMap[ref].add(loser)
   tag component-only refs as MANUAL
3. plan = []                           // grouped by (referencingItem, language) -> one future upsert
   for each (ref, losersReferenced) in refMap:
     for each language in ref.languages:
       variant = mapi.getLanguageVariant(ref.codename, language)
       changes = []
       for each element in variant.elements:
         if element.type == "modular_content":
           for loser in losersReferenced:
             if loser in element.value: changes.push({element, op:"swap-linked", from:loser, to:winner})
         if element.type == "rich_text":
           for loser in losersReferenced:
             if richTextReferences(element, loser): changes.push({element, op:"rewrite-richtext", from:loser, to:winner})
       if changes: plan.push({ref, language, changes})
4. render(plan) -> STOP; wait for explicit operator confirm           // M3 + M4
5. on confirm:                                                        // M5
     for each entry in plan:
       patched = applyAllSwaps(entry.changes)   // collapse all losers -> winner; dedupe winner once
       record before/after in changeset
       mapi.upsertLanguageVariant(entry.ref.codename, entry.language, patched)   // ONE write per variant
6. verify: for each loser in losers: itemUsedIn(loser) for handled types == empty
7. retire: for each loser in losers: move loser variant(s) -> configured archive step  (NEVER delete)   // M6
8. persist one changeset                                              // M7
   (run id, operator, timestamp, winner, full losers list, all before/after, each loser prior step + slug)

undo(runId): re-upsert recorded before-values; restore every loser's prior step; log undo
```

Correctness rules: one upsert per variant even if it referenced several losers; the winner deduped to a single entry in any linked-items array; discovery aggregates across losers so a shared item is handled once; slug elements untouched (recorded only).

---

## 7. UX Flow — [BOTH]

1. **Define set** — winner input (codename or picker); a multi-entry losers control (add individually or paste a newline list); content-type scope. Inline validation. Live count: "1 winner, N losers." → Discover.
2. **Review** — header shows the winner, the N losers, and the archive target step. A table of referencing items lists name, type, collection, workflow step, language, and loser chip(s); multi-loser items show multiple chips. "Manual" rows (component / ambiguous) are flagged and excluded from the plan. Summary counts: total changes, affected items, losers covered. Buttons: **Build plan** → **Confirm & run** (disabled until the plan is built and acknowledged).
3. **Confirm dialog** — plain language: "X references across Y items will be repointed to the winner from N losers. All N losers will move to <step>." Explicit Confirm.
4. **Result** — progress, a per-item success/failure list, post-run Used-In verification per loser, each loser's new step, and an **Undo this run** button. Audit changeset downloadable as JSON/CSV.

Keep it boring and legible — this is a near-destructive operation on client-sensitive content at scale. Clarity over polish.

---

## 8. Tech & API Contracts (pinned — use exactly these) — [AI BUILDER]

**App shell:** Kontent.ai **Custom App** (environment-level), TypeScript + React, browser-only.

**Custom App context** — `@kontent-ai/custom-app-sdk`:
```ts
import { getCustomAppContext } from "@kontent-ai/custom-app-sdk";
const res = await getCustomAppContext();
// res.context.environmentId -> use for API clients
// res.config -> JSON config set in Environment Settings > Custom Apps (store MAPI key + archive-step codename here)
```
The SDK provides environment + user context and your config object; it does **not** hand you a Management API key. Store the MAPI key and archive-step codename in the Custom App `config`. Browser-only — it attaches window event listeners.

**Discovery (per loser, then aggregate)** — Delivery SDK `@kontent-ai/delivery-sdk`:
```ts
import { createDeliveryClient } from "@kontent-ai/delivery-sdk";
const delivery = createDeliveryClient({ environmentId });
const usedIn = await delivery.itemUsedIn(loserCodename).type("article").toAllPromise();
// Returns parent items referencing the loser via rich text OR linked items.
// Scope by type. toAllPromise() handles X-Continuation pagination.
// Works even for archived/deleted losers. Reflects PUBLISHED content (see Open Questions re: drafts).
```

**Read + write** — Management SDK `@kontent-ai/management-sdk`:
```ts
import { createManagementClient } from "@kontent-ai/management-sdk";
const mapi = createManagementClient({ environmentId, apiKey });

// read once to locate ALL loser references in a variant:
const variant = await mapi.viewLanguageVariant()
  .byItemCodename(refCodename).byLanguageCodename(lang).toPromise();

// write once per variant with every loser reference repointed to the winner:
await mapi.upsertLanguageVariant()
  .byItemCodename(refCodename).byLanguageCodename(lang)
  .withData(builder => patchedElements).toPromise();

// retire each loser (do NOT delete):
await mapi.changeWorkflowOfLanguageVariant()
  .byItemCodename(loserCodename).byLanguageCodename(lang)
  .withData({ workflow_identifier:{codename:"<workflow>"}, step_identifier:{codename:"<archive_step>"} })
  .toPromise();
```

**Reference shapes to swap (loser → winner):**
- **Linked items / modular content:** `value` is an array of references `[{codename:"..."}]` (or by id). Replace each loser; dedupe so the winner appears once even if multiple losers and/or the winner were already present.
- **Rich text:** a loser appears as an inline item object `<object type="application/kenticocloud" data-type="item" data-rel="link" data-codename="LOSER">` or a content link `<a data-item-id="LOSER_id">`. Rewrite the markup, swapping each loser's codename/id for the winner's. **Components** (`data-rel="component"`) are inline-only, not separate items — not losers; tag MANUAL.
- **URL slug element:** not touched. Record the retired loser's slug in the audit only.

**Audit store:** one changeset per run as JSON; in-memory plus downloadable export is fine for the prototype. Do not use browser localStorage in the deployed Custom App.

**Throughput:** at cluster scale (N losers × many items × languages) you'll make many MAPI calls. Respect rate limits, bound write concurrency, and make the run resumable from per-variant audit entries so a partial failure can be retried without double-applying.

---

## 9. Build Sequence — [BOTH]

All four phases are MVP. Ship nothing beyond Phase 4.

**Phase 1 — Read-only discovery.** App shell + context + Define-set screen (winner + pasted loser list) + per-loser Used-In with pagination + content-type scope + aggregation into one referencing-item set tagged by loser. *Done when M2 passes (including the multi-loser-item case) against a real environment.*

**Phase 2 — Plan builder (no writes).** Read each referencing variant once via MAPI, locate every loser reference in linked-items and rich-text, group changes per variant, render the labelled diff, tag MANUAL. *Done when M3 passes and re-reading items proves nothing changed.*

**Phase 3 — Commit + verify.** Confirm gate → one upsert per variant repointing all losers to the winner (deduped) → post-run Used-In verification per loser. Surface workflow versioning. Bounded concurrency + resumable. *Done when M4 + M5 pass, including the multi-loser single-write case.*

**Phase 4 — Retire losers + audit + undo.** Archive-step move for every loser, one-run changeset persistence, reversal. *Done when M6 + M7 pass.*

**Test data:** a non-prod environment with one winner and three losers — one item referencing a single loser via linked-items, one referencing a different loser in rich-text inline, one referencing a third loser via a rich-text link, **one item referencing two of the losers at once** (must be written once, repointed to the winner), one item already referencing both the winner and a loser (dedupe path), one component-only MANUAL case, and a loser that references another loser (ordering/audit case).

---

## 10. Open Questions — [HUMAN] (decisions needed from people)

Blocking before Phase 3:
- **Draft vs published references [Engineering].** Delivery Used-In reflects published content; references that exist only in unpublished drafts may be missed. Accept published-only for the prototype, or also query the Preview API? *Default:* published-only, stated clearly in the UI.

Non-blocking (resolve during build):
- **Archive step codename [Tara / stakeholder].** The exact agreed retirement step at WebMD — configurable via Custom App config; confirm the real value for the demo.
- **Intra-set references [Engineering].** Ordering when a loser references another loser in the set. *Default:* replace all references first (a loser→loser reference becomes a reference to the winner), then retire; record both in the audit.
- **Multi-language commit [Engineering].** Replace across all discovered languages by default, or let the operator scope languages? *Lean:* operator-scoped, default = all discovered.
- **Slug / redirect handling [Engineering / Heather].** Out of MVP scope (see section 3), but the eventual answer — preserve a retired loser's slug as a redirect to the winner? — affects later work. MVP records slugs in the audit so this isn't lost.

---

## 11. Success Metrics — [HUMAN]

Leading (days–weeks):
- **Reference-orphan rate post-run** — 0 handled references to any loser remain (per-loser Used-In re-query).
- **Operator time per merge set** — under 10 minutes for a one-winner / 5-loser / ~200-reference cluster.
- **Write efficiency** — an item referencing K losers is written exactly once (audit-verifiable).
- **Preview-to-commit accuracy** — committed changes match the previewed plan, 100%.
- **Reversal success rate** — 100% of runs fully reversible in test.

Lagging (weeks–months):
- **Consolidation throughput at WebMD** — merge sets completed against the scored list per week; average losers retired per set.
- **Client-escalation reduction** tied to legacy-content displacement (qualitative, via Tara's team).

---

## 12. Provenance — [HUMAN]

- **Reference replacement, not chunk merge**, and **archive-not-delete** come directly from the 10 Jun WebMD Ignite call.
- **One winner / many losers** reflects how duplication appears in WebMD's library — the scored spreadsheet surfaces clusters with one keeper and several near-duplicates — so the unit of work is a merge set.
- **The MVP scope** follows the requirements row: its risks/dependencies (rich-text + modular references, workflow state, human review, auditable/reversible) are the safety requirements that define a shippable tool, so they are MVP (M3–M7). Its open question about slugs marks slug handling as unresolved, so slugs are out of MVP scope.
- **Detection/clustering** is WebMD's own (18k articles, 310M matches, 800k rows) — hence a non-goal.
