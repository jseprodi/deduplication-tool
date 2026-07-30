import { useMemo, useState } from "react";
import "./App.css";
import { useEnv } from "./lib/context";
import { makeDeliveryClient, makeManagementClient } from "./lib/clients";
import { ContentTypeCache } from "./lib/contentTypeCache";
import { RefCaches } from "./lib/refCaches";
import { resolveMergeSet, discoverReferences, ValidationError, type ResolvedMergeSet } from "./lib/discovery";
import { buildPlan } from "./lib/planBuilder";
import { commitPlan, verifyLoserHasNoReferences } from "./lib/commit";
import { retireLosers } from "./lib/retire";
import { buildChangeset, newRunId, changesetToJson, changesetToCsv } from "./lib/audit";
import type {
  Changeset,
  LoserRetireAudit,
  MergeSetInput,
  PlanEntry,
  ReferencingRecord,
  VariantWriteAudit,
} from "./types";
import { DefineSetStep } from "./components/DefineSetStep";
import { ReviewStep } from "./components/ReviewStep";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { ResultStep } from "./components/ResultStep";

type Phase = "define" | "discovering" | "review" | "building-plan" | "confirm" | "committing" | "result";

export default function App() {
  const { environmentId, userEmail, config } = useEnv();

  const delivery = useMemo(() => makeDeliveryClient(environmentId), [environmentId]);
  const mapi = useMemo(() => makeManagementClient(environmentId, config.managementApiKey), [environmentId, config]);
  const contentTypeCache = useMemo(() => new ContentTypeCache(mapi), [mapi]);
  const refCaches = useMemo(() => new RefCaches(mapi), [mapi]);

  const [phase, setPhase] = useState<Phase>("define");
  const [error, setError] = useState<string | null>(null);

  const [input, setInput] = useState<MergeSetInput>({ winner: "", losers: [], typeFilter: [] });
  const [resolved, setResolved] = useState<ResolvedMergeSet | null>(null);
  const [referencing, setReferencing] = useState<ReferencingRecord[]>([]);
  const [plan, setPlan] = useState<PlanEntry[] | null>(null);

  const [variantWrites, setVariantWrites] = useState<VariantWriteAudit[]>([]);
  const [verification, setVerification] = useState<Record<string, boolean>>({});
  const [loserRetires, setLoserRetires] = useState<LoserRetireAudit[]>([]);
  const [changeset, setChangeset] = useState<Changeset | null>(null);
  const [runProgress, setRunProgress] = useState<string>("");

  async function handleDiscover(newInput: MergeSetInput) {
    setError(null);
    setInput(newInput);
    setPhase("discovering");
    try {
      const resolvedSet = await resolveMergeSet(mapi, refCaches, newInput);
      setResolved(resolvedSet);
      const refs = await discoverReferences(
        delivery,
        resolvedSet.losers.map((l) => l.codename),
        newInput.typeFilter
      );
      setReferencing(refs);
      setPlan(null);
      setPhase("review");
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : `Discovery failed: ${(err as Error).message}`);
      setPhase("define");
    }
  }

  async function handleBuildPlan() {
    if (!resolved) return;
    setError(null);
    setPhase("building-plan");
    try {
      const builtPlan = await buildPlan(mapi, contentTypeCache, refCaches, resolved.winner, resolved.losers, referencing);
      setPlan(builtPlan);
      setPhase("review");
    } catch (err) {
      setError(`Plan build failed: ${(err as Error).message}`);
      setPhase("review");
    }
  }

  async function handleConfirmAndRun() {
    if (!resolved || !plan) return;
    setPhase("committing");
    setError(null);

    try {
      setRunProgress("Writing repointed references…");
      const writes = await commitPlan(mapi, plan, new Set(), (audit) => {
        setVariantWrites((prev) => [
          ...prev.filter((a) => a.itemCodename !== audit.itemCodename || a.languageCodename !== audit.languageCodename),
          audit,
        ]);
      });
      setVariantWrites(writes);

      setRunProgress("Verifying no references remain…");
      const verificationResults: Record<string, boolean> = {};
      for (const loser of resolved.losers) {
        verificationResults[loser.codename] = await verifyLoserHasNoReferences(
          delivery,
          loser.codename,
          input.typeFilter
        );
      }
      setVerification(verificationResults);

      setRunProgress(`Moving ${resolved.losers.length} loser(s) to the archive step…`);
      const retires = await retireLosers(mapi, contentTypeCache, resolved.losers, config, (audit) => {
        setLoserRetires((prev) => [
          ...prev.filter((a) => a.loserCodename !== audit.loserCodename || a.languageCodename !== audit.languageCodename),
          audit,
        ]);
      });
      setLoserRetires(retires);

      const finalChangeset = buildChangeset({
        runId: newRunId(),
        operatorEmail: userEmail,
        winner: resolved.winner.codename,
        losers: resolved.losers.map((l) => l.codename),
        variantWrites: writes,
        loserRetires: retires,
      });
      setChangeset(finalChangeset);
      setRunProgress("");
      setPhase("result");
    } catch (err) {
      setError(`Run failed: ${(err as Error).message}`);
      setRunProgress("");
      setPhase("result");
    }
  }

  function handleStartOver() {
    setPhase("define");
    setError(null);
    setResolved(null);
    setReferencing([]);
    setPlan(null);
    setVariantWrites([]);
    setVerification({});
    setLoserRetires([]);
    setChangeset(null);
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Merge Function</h1>
        <span className="subtitle">Reference replacement &amp; safe retirement · {environmentId}</span>
      </header>

      {error && <div className="banner error">{error}</div>}

      {phase === "define" && <DefineSetStep initial={input} onSubmit={handleDiscover} />}

      {phase === "discovering" && <div className="centered">Resolving merge set and discovering references…</div>}

      {(phase === "review" || phase === "building-plan") && resolved && (
        <ReviewStep
          resolved={resolved}
          referencing={referencing}
          plan={plan}
          isBuildingPlan={phase === "building-plan"}
          archiveStepCodename={config.archiveStepCodename}
          onBuildPlan={handleBuildPlan}
          onConfirm={() => setPhase("confirm")}
          onBack={handleStartOver}
        />
      )}

      {phase === "confirm" && resolved && plan && (
        <ConfirmDialog
          resolved={resolved}
          plan={plan}
          archiveStepCodename={config.archiveStepCodename}
          onCancel={() => setPhase("review")}
          onConfirm={handleConfirmAndRun}
        />
      )}

      {phase === "committing" && <div className="centered">{runProgress || "Running merge…"}</div>}

      {phase === "result" && resolved && changeset && (
        <ResultStep
          resolved={resolved}
          variantWrites={variantWrites}
          verification={verification}
          loserRetires={loserRetires}
          changeset={changeset}
          mapi={mapi}
          onDownloadJson={() => downloadFile(`merge-${changeset.runId}.json`, changesetToJson(changeset), "application/json")}
          onDownloadCsv={() => downloadFile(`merge-${changeset.runId}.csv`, changesetToCsv(changeset), "text/csv")}
          onStartOver={handleStartOver}
        />
      )}
    </div>
  );
}

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
