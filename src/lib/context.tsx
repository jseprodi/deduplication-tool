import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AppConfig } from "../types";

interface EnvContext {
  environmentId: string;
  userEmail: string;
  config: AppConfig;
}

const EnvContextInternal = createContext<EnvContext | null>(null);

function isValidConfig(value: unknown): value is AppConfig {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.managementApiKey === "string" &&
    v.managementApiKey.length > 0 &&
    typeof v.archiveWorkflowCodename === "string" &&
    v.archiveWorkflowCodename.length > 0 &&
    typeof v.archiveStepCodename === "string" &&
    v.archiveStepCodename.length > 0
  );
}

/**
 * Wraps getCustomAppContext(). The SDK throws at import time when the page
 * isn't hosted inside the Kontent.ai iframe (e.g. local dev), so it's imported
 * dynamically here and only once we've confirmed we're actually framed —
 * otherwise this falls back to a manual setup form instead of crashing.
 */
export function EnvProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "needs-setup"; environmentId?: string; userEmail?: string; reason: string }
    | { status: "ready"; value: EnvContext }
  >({ status: "loading" });

  useEffect(() => {
    if (window.self === window.top) {
      setState({
        status: "needs-setup",
        reason:
          "This page isn't running inside the Kontent.ai iframe (expected for local development). Enter connection details below for this session.",
      });
      return;
    }

    import("@kontent-ai/custom-app-sdk")
      .then(({ getCustomAppContext }) => getCustomAppContext())
      .then((res) => {
        if (res.isError) {
          setState({ status: "needs-setup", reason: res.description });
          return;
        }
        const ctx = res.context;
        const environmentId = ctx.environmentId;
        const userEmail = ctx.userEmail ?? "unknown";
        if (isValidConfig(ctx.appConfig)) {
          setState({ status: "ready", value: { environmentId, userEmail, config: ctx.appConfig } });
        } else {
          setState({
            status: "needs-setup",
            environmentId,
            userEmail,
            reason:
              "Custom App config is missing or incomplete. Set managementApiKey, archiveWorkflowCodename and archiveStepCodename in Environment Settings > Custom Apps, or enter them below for this session.",
          });
        }
      })
      .catch((err) => {
        setState({ status: "needs-setup", reason: err instanceof Error ? err.message : String(err) });
      });
  }, []);

  if (state.status === "loading") {
    return <div className="centered">Loading Kontent.ai context…</div>;
  }

  if (state.status === "needs-setup") {
    return (
      <ManualSetup
        reason={state.reason}
        defaultEnvironmentId={state.environmentId}
        defaultUserEmail={state.userEmail}
        onSubmit={(value) => setState({ status: "ready", value })}
      />
    );
  }

  return <EnvContextInternal.Provider value={state.value}>{children}</EnvContextInternal.Provider>;
}

function ManualSetup({
  reason,
  defaultEnvironmentId,
  defaultUserEmail,
  onSubmit,
}: {
  reason: string;
  defaultEnvironmentId?: string;
  defaultUserEmail?: string;
  onSubmit: (value: EnvContext) => void;
}) {
  const [environmentId, setEnvironmentId] = useState(defaultEnvironmentId ?? "");
  const [userEmail, setUserEmail] = useState(defaultUserEmail ?? "");
  const [managementApiKey, setManagementApiKey] = useState("");
  const [archiveWorkflowCodename, setArchiveWorkflowCodename] = useState("");
  const [archiveStepCodename, setArchiveStepCodename] = useState("");

  const canSubmit =
    environmentId.trim() && managementApiKey.trim() && archiveWorkflowCodename.trim() && archiveStepCodename.trim();

  return (
    <div className="setup-screen">
      <h1>Merge Function — Setup needed</h1>
      <p className="hint">{reason}</p>
      <div className="form-grid">
        <label>
          Environment ID
          <input value={environmentId} onChange={(e) => setEnvironmentId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" />
        </label>
        <label>
          Operator email
          <input value={userEmail} onChange={(e) => setUserEmail(e.target.value)} placeholder="you@company.com" />
        </label>
        <label>
          Management API key
          <input
            type="password"
            value={managementApiKey}
            onChange={(e) => setManagementApiKey(e.target.value)}
            placeholder="ey..."
          />
        </label>
        <label>
          Archive workflow codename
          <input value={archiveWorkflowCodename} onChange={(e) => setArchiveWorkflowCodename(e.target.value)} placeholder="default" />
        </label>
        <label>
          Archive step codename
          <input value={archiveStepCodename} onChange={(e) => setArchiveStepCodename(e.target.value)} placeholder="archived" />
        </label>
      </div>
      <button
        className="primary"
        disabled={!canSubmit}
        onClick={() =>
          onSubmit({
            environmentId: environmentId.trim(),
            userEmail: userEmail.trim() || "unknown",
            config: {
              managementApiKey: managementApiKey.trim(),
              archiveWorkflowCodename: archiveWorkflowCodename.trim(),
              archiveStepCodename: archiveStepCodename.trim(),
            },
          })
        }
      >
        Continue
      </button>
      <p className="hint small">
        This session-only override is for local testing. For the deployed Custom App, set these values as JSON in
        Environment Settings → Custom Apps → your app's config instead.
      </p>
    </div>
  );
}

export function useEnv(): EnvContext {
  const ctx = useContext(EnvContextInternal);
  if (!ctx) throw new Error("useEnv() must be used within EnvProvider");
  return ctx;
}
