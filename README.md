# Merge Function — Reference Replacement Tool

A Kontent.ai Custom App that consolidates a duplicate content cluster in one
reviewed operation: repoints every reference to a set of **losers** onto a
single **winner**, then retires the losers to an archive workflow step.
Nothing is deleted. Every run produces a downloadable audit changeset and can
be undone.

See `merge-function-prd-reference-replacement_2.md` for the full spec this
was built against (M1–M7, edge cases, and open questions).

## What it does

1. **Define set** — enter a winner codename and a list of loser codenames
   (M1: validates the winner isn't also a loser, dedupes, checks existence,
   warns on content-type mismatch).
2. **Discover** — runs Delivery `Used-In` for every loser, paginated and
   scoped by content type, aggregated into one referencing-item set tagged by
   which loser(s) each item references (M2).
3. **Build plan** — reads every referencing variant once via the Management
   API, resolves each element against its content type schema to find
   `modular_content` and `rich_text` references to a loser, and produces a
   labelled diff. Rich-text references inside a **component** are flagged
   MANUAL and excluded from the writable plan — nothing is written yet (M3).
4. **Confirm** — a plain-language summary gates the actual writes (M4).
5. **Commit + verify** — one upsert per variant with every loser reference
   collapsed to the winner, followed by a Used-In re-query per loser to
   confirm zero references remain (M5).
6. **Retire** — every loser variant moves to the configured archive workflow
   step (never deleted); its prior step and slug are recorded (M6).
7. **Audit + undo** — the whole run is downloadable as JSON/CSV, and can be
   reversed with a single "Undo this run" action that restores prior element
   values and workflow steps (M7).

## Running it inside Kontent.ai

This is a **Custom App**, so it only fully functions when embedded in the
Kontent.ai iframe (the SDK requires it). To deploy:

1. Build it: `npm run build` (outputs to `dist/`).
2. Host `dist/` somewhere Kontent.ai can iframe (e.g. static hosting/CDN).
3. In your environment: **Environment settings → Custom apps → Create app**,
   set the hosted URL, and set the app's **config** JSON to:

   ```json
   {
     "managementApiKey": "<a Management API key with access to this environment>",
     "archiveWorkflowCodename": "<workflow codename that owns the archive step>",
     "archiveStepCodename": "<the archive/retirement step codename>"
   }
   ```

4. Open the app from the environment's Custom Apps menu.

## Local development

```bash
npm install
npm run dev
```

The Custom App SDK throws if the page isn't inside an iframe, which is always
true for `npm run dev`. The app detects this and shows a one-time manual
setup form (environment ID, operator email, Management API key, archive
workflow/step codenames) so you can drive the whole flow against a real,
non-production environment without deploying anything. This is session-only
and never touches `localStorage`.

## Notes / deliberate MVP scope (see PRD §3, §10)

- Published-only discovery: Delivery `Used-In` reflects published content, so
  references that exist only in unpublished drafts may be missed. This is
  called out in the UI implicitly by the review table's workflow-step column.
- No chunk/content merging, no slug/redirect handling, single environment
  only — all out of scope per the PRD.
- Multi-language: all languages discovered for a loser are handled by
  default (no per-language operator scoping in this MVP).
