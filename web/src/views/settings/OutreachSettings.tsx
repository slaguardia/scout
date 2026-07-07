// Outreach group: the email subject/body + follow-up body templates, and the
// follow-up reminder interval.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "../../components/Toast";
import { useVocab } from "../../api/queries";
import { putFollowupInterval } from "../../api/settings";
import { SettingsTextField } from "./SettingsTextField";

export function OutreachSettings() {
  const vocab = useVocab().data;
  const qc = useQueryClient();
  const toast = useToast();
  const [interval, setIntervalVal] = useState(vocab?.followupInterval ?? 5);

  const saveInterval = async (raw: string) => {
    const days = Math.max(0, Math.min(90, parseInt(raw, 10) || 0));
    setIntervalVal(days);
    try {
      await putFollowupInterval(days);
      void qc.invalidateQueries({ queryKey: ["vocab"] });
      toast("follow-up interval saved");
    } catch (e) {
      toast(`save failed: ${(e as Error).message}`);
    }
  };

  return (
    <>
      <SettingsTextField kind="outreach-subject" label="Email subject" desc="The send subject — {{role}} / {{company}} substitution, no LLM." rows={2} />
      <SettingsTextField kind="outreach-template" label="Email body" desc="Verbatim prose with the writer's fill-in holes. Put your sign-off at the bottom — markdown links render as real links on send." rows={18} />
      <SettingsTextField kind="followup-template" label="Follow-up body" desc="The full follow-up, sign-off included — {{contact_name}}, {{role}}, {{company}}, {{last_sent}}, {{last_message}}." rows={9} />
      <div className="set-field">
        <div className="set-field-label">Follow-up reminder</div>
        <div className="set-field-desc">Business days after a send before a follow-up comes due (0 = off).</div>
        <input
          className="input set-fu-interval"
          type="number"
          min={0}
          max={90}
          defaultValue={interval}
          style={{ marginTop: 8, width: 90 }}
          onBlur={(e) => void saveInterval(e.target.value)}
        />
      </div>
    </>
  );
}
