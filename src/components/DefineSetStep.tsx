import { useState } from "react";
import type { MergeSetInput } from "../types";
import { parseLoserList } from "../lib/discovery";

export function DefineSetStep({
  initial,
  onSubmit,
}: {
  initial: MergeSetInput;
  onSubmit: (input: MergeSetInput) => void;
}) {
  const [winner, setWinner] = useState(initial.winner);
  const [losersRaw, setLosersRaw] = useState(initial.losers.join("\n"));
  const [typeFilterRaw, setTypeFilterRaw] = useState(initial.typeFilter.join(", "));

  const losers = parseLoserList(losersRaw);
  const winnerInLosers = winner.trim().length > 0 && losers.includes(winner.trim());
  const canSubmit = winner.trim().length > 0 && losers.length > 0 && !winnerInLosers;

  function handleSubmit() {
    if (!canSubmit) return;
    const typeFilter = typeFilterRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    onSubmit({ winner: winner.trim(), losers, typeFilter });
  }

  return (
    <div className="step">
      <h2>1. Define the merge set</h2>
      <p className="hint">Enter the winner (the item to keep) and the losers (the duplicates to retire).</p>

      <label className="field">
        Winner codename
        <input value={winner} onChange={(e) => setWinner(e.target.value)} placeholder="article-diabetes-overview" />
      </label>

      <label className="field">
        Loser codenames (one per line, or paste a comma/newline list)
        <textarea
          rows={6}
          value={losersRaw}
          onChange={(e) => setLosersRaw(e.target.value)}
          placeholder={"article-diabetes-overview-copy\narticle-diabetes-basics-old"}
        />
      </label>

      <label className="field">
        Content-type scope (optional, comma-separated codenames — leave blank for all types)
        <input value={typeFilterRaw} onChange={(e) => setTypeFilterRaw(e.target.value)} placeholder="article" />
      </label>

      {winnerInLosers && <div className="banner error">The winner cannot also appear in the losers list.</div>}

      <div className="live-count">
        1 winner, {losers.length} loser{losers.length === 1 ? "" : "s"}
      </div>

      <button className="primary" disabled={!canSubmit} onClick={handleSubmit}>
        Discover references
      </button>
    </div>
  );
}
