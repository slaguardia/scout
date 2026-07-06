// Pill — the verdict / status chip. `pillClass(v)` mirrors the vanilla helper.
import type { ReactNode } from "react";

export const pillClass = (v?: string | null): string => "pill pill-" + (v || "none");

export function Pill({ verdict, children }: { verdict?: string | null; children?: ReactNode }) {
  return <span className={pillClass(verdict)}>{children ?? verdict ?? "—"}</span>;
}

/** A spinner + message row, matching the vanilla `.loading-row`. */
export function LoadingRow({ msg = "loading…" }: { msg?: string }) {
  return (
    <div className="loading-row">
      <span className="spinner"></span>
      <span>{msg}</span>
    </div>
  );
}
