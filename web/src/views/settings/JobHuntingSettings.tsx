// Job-hunting group: how scout judges — the playbook and the mechanical
// pre-filter. What you want (the criteria) lives under Knowledge.
import { SettingsTextField } from "./SettingsTextField";
import { PrefilterForm } from "./PrefilterForm";

export function JobHuntingSettings() {
  return (
    <>
      <SettingsTextField kind="playbook" label="Playbook" desc="How scout judges — the reasoning rules behind every verdict." rows={12} />
      <PrefilterForm />
    </>
  );
}
