interface KontentErrorLike {
  message?: unknown;
  errorCode?: unknown;
  requestId?: unknown;
  validationErrors?: { message?: unknown }[];
}

/**
 * The Management SDK rejects with `SharedModels.ContentManagementBaseKontentError`,
 * a plain class that does NOT extend `Error` — `instanceof Error` misses it and
 * `String(err)` collapses it to "[object Object]". This pulls out the real message
 * plus any validation errors regardless of which shape we got.
 */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;

  if (err && typeof err === "object") {
    const e = err as KontentErrorLike;
    if (typeof e.message === "string" && e.message) {
      const details = (e.validationErrors ?? [])
        .map((v) => (typeof v.message === "string" ? v.message : null))
        .filter((m): m is string => Boolean(m));
      const code = typeof e.errorCode === "number" ? ` (code ${e.errorCode})` : "";
      return details.length > 0 ? `${e.message}${code}: ${details.join("; ")}` : `${e.message}${code}`;
    }
  }

  return String(err);
}
