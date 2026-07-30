# Merge Function — Reference Replacement Tool

A Kontent.ai Custom App for consolidating duplicate content. Given one
**winner** (the item to keep) and a set of **losers** (duplicates to retire),
it finds every item that references any loser, lets you review the exact
changes before anything is written, repoints all of those references to the
winner in a single reviewed operation, and retires the losers to an archive
workflow step. Nothing is ever deleted, every run is fully audited, and a run
can be undone.

This is built for consolidating large, duplicate-heavy content libraries —
the common scenario is an external scoring/matching process (a spreadsheet,
a script, whatever) has already decided which item should survive and which
ones are near-duplicates. This tool doesn't do that detection; it safely
*executes* the decision inside Kontent.ai.

## Core concepts

- **Winner** — the content item that survives. Every reference to a loser
  gets repointed here.
- **Loser** — a content item being retired. Its content is preserved (moved
  to an archive workflow step), never deleted.
- **Merge set** — one winner plus a list of losers, handled as a single
  reviewed operation. A winner rarely has just one duplicate; the whole
  cluster is discovered, reviewed, and executed together.

## How it works

The app is a four-step wizard:

### 1. Define the merge set

Enter the winner's codename and a list of loser codenames (typed one per
line, or pasted as a newline/comma-separated block). Before moving on, the
app:

- Blocks if the winner also appears in the loser list.
- Silently dedupes repeated loser codenames.
- Confirms every codename actually exists in the environment (via the
  Management API), and reports which one doesn't if it fails.
- Warns (without blocking) if a loser is a different content type than the
  winner — content-type mismatches are usually a sign of a bad merge set, but
  they're not always wrong, so this stays a warning.

You can optionally scope discovery to specific content types (comma
separated). Leaving it blank searches all types.

### 2. Discover references

For every loser, the app queries the Delivery API's `Used-In` endpoint
(paginated to completion) to find every item that references it. Results
are aggregated into one table keyed by (item, language) — so if an item
references two different losers, or the same loser is found via multiple
pages, it still shows up as a single row with all the losers it touches
listed as chips. Each row shows the item's name, content type, collection,
current workflow step, and language.

A loser that was never published won't have any Delivery-side record at
all — Delivery only knows about published content. The app treats that as
"zero references found" rather than an error, and calls it out explicitly
so you know why nothing showed up.

### 3. Build the plan (read-only)

Clicking **Build plan** reads every referencing item's actual current
content once via the Management API — deliberately *not* relying on the
(potentially stale, published-only) Delivery data from the discovery step,
since a variant may have unpublished changes that Delivery can't see. For
each element, the app looks up the owning content type's schema to
determine what kind of element it is, then:

- **Linked items / modular content elements** — scans the array of
  references (matched by id or codename) for any loser, and prepares a
  replacement where every loser reference collapses to a single winner
  entry, deduped even if the winner was already present alongside a loser.
- **Rich text elements** — parses the HTML for two loser-reference shapes:
  inline item objects (`data-rel="link"`, addressed by codename) and content
  links (`<a data-item-id>`, addressed by internal id), and rewrites both to
  point at the winner.
- **Rich text components** (`data-rel="component"`) are inline-only
  structures that can't themselves be a loser reference. If a component
  appears to mention a loser anyway, it's flagged **MANUAL** and excluded
  from the plan rather than risk mangling it — a human needs to look at
  that one directly in the item editor.
- Everything else (slugs, text, assets, etc.) is left completely untouched.

The result is a per-item, per-element diff: what will change, which loser(s)
triggered each change, and whether writing to that item will create a new
version (because it's currently published — see **Publishing behavior**
below). If a referencing item already has the winner alongside a loser, the
plan collapses them so the winner is written exactly once — nothing is
duplicated. If two losers point at the same item, that item is still written
exactly once with both collapsed to the winner.

Nothing is written during this step. Re-reading an item afterwards proves
nothing changed.

### 4. Confirm and run

A plain-language summary states exactly what's about to happen — how many
references, across how many items, from how many losers, and where the
losers are headed — and flags if any affected items are currently published
(since updating them creates a new version). Nothing is written until you
explicitly confirm here.

Once confirmed, the app:

1. **Writes** one upsert per affected variant, containing only the changed
   elements — everything else in that variant is left exactly as it was.
2. **Verifies** by re-querying Delivery `Used-In` for every loser and
   confirming zero references remain (for the handled element types).
3. **Retires** every loser variant to the configured archive workflow step.
4. **Records** a full changeset covering everything that happened.

Writes and retirements run with bounded concurrency, and a partial failure
doesn't get silently skipped or duplicated on a retry — the result screen
shows per-item / per-loser success or failure with the actual API error
message, so you can see exactly what needs attention.

## Publishing behavior

The Management API doesn't quietly version a published item as a side
effect of writing to it — it rejects the write outright unless you first
create a new version. Likewise, a published loser can't be moved straight to
an archive step; it has to be unpublished first. The app handles both of
these automatically:

- Writing to a published referencing item creates a new version first, then
  applies the change. The **old published version stays live** until someone
  publishes the new one — this tool intentionally doesn't auto-publish, so
  the reference fix won't be visible to end users until that happens.
- Retiring a published loser unpublishes it first, then moves it to the
  archive step.

Because Delivery `Used-In` only reflects published content, a "0 references
remain" verification after a run means the *published* copies are clear —
if a referencing item's fix is sitting in an unpublished draft, Delivery
won't reflect that until it's published.

## Audit and undo

Every run produces a changeset containing:

- The run id, timestamp, and operator.
- The winner and the full loser list.
- Every variant that was touched, with the exact before/after element
  values.
- Every loser's prior workflow step and its slug (recorded for reference —
  the tool never modifies slugs or creates redirects).

The changeset can be downloaded as JSON or CSV from the result screen. A
single **Undo this run** action re-applies every recorded before-value and
returns every loser to its prior workflow step, and logs its own outcome.

## Edge cases this handles correctly

- A loser with zero references discovered still gets retired — the plan
  simply has zero changes for it, and the run proceeds straight to
  retirement rather than being blocked.
- The winner appearing in the loser list is blocked at the first step.
- Duplicate loser codenames are silently deduped.
- An item referencing several losers at once is written exactly once, with
  all of them collapsed to the winner.
- An item already referencing both the winner and a loser is deduped to a
  single winner reference.
- If a loser references another loser in the merge set, that reference
  shows up like any other and gets repointed to the winner along with
  everything else — no special-casing needed, since a loser is just another
  content item as far as discovery and planning are concerned.
- A content item that exists but has never had any language variant
  authored is handled gracefully (nothing to retire for it) instead of
  crashing the run.

## Running it inside Kontent.ai

This is a **Custom App**, so it's designed to run embedded in the Kontent.ai
iframe (the Custom App SDK requires it in production). To deploy:

1. Build it: `npm run build` (outputs to `dist/`).
2. Host `dist/` somewhere Kontent.ai can iframe (static hosting/CDN).
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

The Custom App SDK throws if the page isn't hosted inside the Kontent.ai
iframe, which is always true for `npm run dev`. The app detects this and
shows a one-time manual setup form (environment ID, operator email,
Management API key, archive workflow/step codenames) so you can drive the
whole flow against a real, non-production environment without deploying
anything. This is session-only and never touches `localStorage`.

## Known limitations

- **Published-only discovery.** Delivery `Used-In` reflects published
  content, so a reference that exists only in an unpublished draft may be
  missed by discovery. The plan-building step re-reads live Management API
  data per item, so it won't miss a change once an item is discovered — but
  discovery itself can only find items that have a published version.
- **No content merging.** This tool replaces references; it doesn't merge
  the actual content/chunks of a loser into the winner. If an editor wants
  something from a loser inside the winner, that's a manual edit made before
  running the tool.
- **No slug or redirect handling.** Loser slugs are recorded in the audit
  for later use, but the tool doesn't touch slug elements or create
  redirects.
- **Single environment only.** No cross-environment operation.
- **All discovered languages are handled by default** — there's no
  per-language scoping in the operator UI.
