interface Ref {
  id?: string;
  codename?: string;
}

/** Which loser codenames appear in a linked-items/modular-content value, matched by id or codename. */
export function scanLinkedItems(
  value: Ref[] | null | undefined,
  loserCodenames: Set<string>,
  loserIdByCodename: Map<string, string>
): Set<string> {
  const matched = new Set<string>();
  if (!value) return matched;
  const idToCodename = new Map<string, string>();
  for (const [codename, id] of loserIdByCodename) idToCodename.set(id, codename);

  for (const ref of value) {
    if (ref.codename && loserCodenames.has(ref.codename)) matched.add(ref.codename);
    else if (ref.id) {
      const cn = idToCodename.get(ref.id);
      if (cn) matched.add(cn);
    }
  }
  return matched;
}

/** Replaces every loser reference with the winner, deduping so the winner appears once. */
export function swapLinkedItems(
  value: Ref[] | null | undefined,
  loserCodenames: Set<string>,
  loserIdByCodename: Map<string, string>,
  winnerId: string
): Ref[] {
  if (!value) return [];
  const idToCodename = new Map<string, string>();
  for (const [codename, id] of loserIdByCodename) idToCodename.set(id, codename);

  const result: Ref[] = [];
  let winnerIncluded = false;
  for (const ref of value) {
    const isLoser =
      (ref.codename && loserCodenames.has(ref.codename)) || (ref.id && idToCodename.has(ref.id));
    const isWinnerAlready = ref.id === winnerId;
    if (isLoser || isWinnerAlready) {
      if (!winnerIncluded) {
        result.push({ id: winnerId });
        winnerIncluded = true;
      }
    } else {
      result.push(ref);
    }
  }
  return result;
}
