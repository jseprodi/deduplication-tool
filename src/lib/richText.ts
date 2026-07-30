/**
 * Rich text values are stored as an HTML-ish string. Inline item references look like
 * <object type="application/kenticocloud" data-type="item" data-rel="link" data-codename="X"></object>
 * and are addressed by codename. Content links look like <a data-item-id="GUID">...</a> and are
 * addressed by internal id. Components (data-rel="component") are inline-only structures, not
 * references to a separate item — they're never a loser target themselves, but if a component's
 * nested elements happen to mention a loser we can't safely rewrite them here, so we flag MANUAL.
 */

export interface RichTextScan {
  swappableLosers: Set<string>;
  manualLosers: Set<string>;
}

function parseHtml(value: string): Document {
  return new DOMParser().parseFromString(`<body>${value}</body>`, "text/html");
}

function serializeBody(doc: Document): string {
  return doc.body.innerHTML;
}

export function scanRichText(
  value: string | null,
  loserCodenames: Set<string>,
  loserIdByCodename: Map<string, string>
): RichTextScan {
  const swappableLosers = new Set<string>();
  const manualLosers = new Set<string>();
  if (!value) return { swappableLosers, manualLosers };

  const loserIds = new Set(loserIdByCodename.values());
  const idToCodename = new Map<string, string>();
  for (const [codename, id] of loserIdByCodename) idToCodename.set(id, codename);

  const doc = parseHtml(value);

  for (const obj of Array.from(doc.querySelectorAll('object[data-type="item"]'))) {
    const rel = obj.getAttribute("data-rel");
    const codename = obj.getAttribute("data-codename");
    if (rel === "link" && codename && loserCodenames.has(codename)) {
      swappableLosers.add(codename);
    } else if (rel === "component") {
      // A component can't itself be a loser reference, but scan its guideline text /
      // nested markup for a stray mention of a loser codename or id as a safety net.
      const html = obj.outerHTML;
      for (const codename2 of loserCodenames) {
        if (html.includes(codename2)) manualLosers.add(codename2);
      }
      for (const id of loserIds) {
        if (html.includes(id)) {
          const cn = idToCodename.get(id);
          if (cn) manualLosers.add(cn);
        }
      }
    }
  }

  for (const link of Array.from(doc.querySelectorAll("a[data-item-id]"))) {
    const itemId = link.getAttribute("data-item-id");
    if (itemId && loserIds.has(itemId)) {
      const codename = idToCodename.get(itemId);
      if (codename) swappableLosers.add(codename);
    }
  }

  return { swappableLosers, manualLosers };
}

export function rewriteRichText(
  value: string,
  loserCodenamesToWinnerCodename: Map<string, string>,
  loserIdsToWinnerId: Map<string, string>
): string {
  const doc = parseHtml(value);

  for (const obj of Array.from(doc.querySelectorAll('object[data-type="item"][data-rel="link"]'))) {
    const codename = obj.getAttribute("data-codename");
    if (codename && loserCodenamesToWinnerCodename.has(codename)) {
      obj.setAttribute("data-codename", loserCodenamesToWinnerCodename.get(codename)!);
    }
  }

  for (const link of Array.from(doc.querySelectorAll("a[data-item-id]"))) {
    const itemId = link.getAttribute("data-item-id");
    if (itemId && loserIdsToWinnerId.has(itemId)) {
      link.setAttribute("data-item-id", loserIdsToWinnerId.get(itemId)!);
    }
  }

  return serializeBody(doc);
}
