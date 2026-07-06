// Job-hunting group: the active "what the user wants" source — the company-fit
// brief (brain-backed, read-only + Refresh to re-distill) or taste.md (the
// editable offline fallback) — plus the playbook and the pre-filter form.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "../../components/Toast";
import { useProfile, useStats, refreshProfileRequest } from "../../api/settings";
import { SettingsTextField } from "./SettingsTextField";
import { PrefilterForm } from "./PrefilterForm";

export function JobHuntingSettings() {
  const { data: profile } = useProfile();
  const { data: stats } = useStats();
  const qc = useQueryClient();
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);

  const active = profile?.active_source || stats?.taste_source || "";
  const usingBrain = active.startsWith("brain:");
  const hasBody = typeof profile?.body === "string";

  const refresh = async () => {
    setRefreshing(true);
    try {
      await refreshProfileRequest();
      void qc.invalidateQueries({ queryKey: ["profile"] });
      void qc.invalidateQueries({ queryKey: ["stats"] });
      toast("company-fit brief refreshed");
    } catch (e) {
      toast(`refresh failed: ${(e as Error).message}`);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      {usingBrain ? (
        <div className="set-field">
          <div className="set-field-label">
            Company-fit brief{" "}
            <button className="btn btn-sm" id="brief-refresh" disabled={refreshing} title="re-distill from the brain" onClick={refresh}>
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          <div className="set-field-desc">The criteria scout feeds the verdict stage — distilled from the brain (read-only here).</div>
          <pre className="set-readonly">{hasBody ? profile!.body : "(no brief yet — Refresh to distill from the brain)"}</pre>
        </div>
      ) : (
        <SettingsTextField kind="taste" label="Taste (local fallback)" desc="Local fallback criteria used when the brain is unreachable." rows={12} />
      )}
      <SettingsTextField kind="playbook" label="Playbook" desc="How scout judges — the reasoning rules behind every verdict." rows={12} />
      <PrefilterForm />
    </>
  );
}
