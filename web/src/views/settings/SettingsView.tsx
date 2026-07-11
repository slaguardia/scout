// Settings — a left nav of groups + the active group's editable fields inline
// (each saves to its own API on blur; no modals). Port of renderCriteria + the
// per-group renderers.
import { useUI, useDispatch } from "../../store/ui";
import { SettingsTextField } from "./SettingsTextField";
import { PromptField } from "./PromptField";
import { PrefilterForm } from "./PrefilterForm";
import { IntegrationsSettings } from "./IntegrationsSettings";
import { JobHuntingSettings } from "./JobHuntingSettings";
import { OutreachSettings } from "./OutreachSettings";

const GROUPS: [string, string][] = [
  ["outreach", "Outreach"],
  ["pipeline", "Outreach pipeline"],
  ["tracking", "Tracking"],
  ["job-hunting", "Job hunting"],
  ["integrations", "Integrations"],
];

const PIPELINE_STAGES: [string, string, string][] = [
  ["researcher", "1 · Researcher", "Searches the web for true company facts and the best hooks to open with."],
  ["fill", "2 · Writer", "Writes the email's blanks from the research, your experience, and your voice."],
  ["humanizer", "3 · Humanizer", "Strips AI tells and matches your voice — never changes a fact."],
  ["honesty", "4 · Honesty check", "Vetoes any claim about you beyond your documented experience."],
];

export function SettingsView() {
  const grp = useUI().settingsGroup || "outreach";
  const dispatch = useDispatch();
  return (
    <div className="main-view" id="settings-view">
      <div id="criteria-stats">
        <div className="settings-shell">
          <nav className="settings-nav">
            {GROUPS.map(([id, label]) => (
              <a key={id} data-grp={id} className={id === grp ? "active" : ""} onClick={() => dispatch({ type: "setSettingsGroup", group: id })}>
                {label}
              </a>
            ))}
          </nav>
          <div className="settings-content" id="settings-content">
            {grp === "pipeline" ? (
              <>
                {PIPELINE_STAGES.map(([key, title, desc]) => (
                  <PromptField key={key} prompt={key} title={title} desc={desc} />
                ))}
              </>
            ) : grp === "tracking" ? (
              <>
                <SettingsTextField kind="application-stages" label="Application stages" desc="The application pipeline labels. One per line. “applied” and “rejected” are always kept; add your own stages between them. (“archived” is a separate built-in status.)" rows={6} list />
                <SettingsTextField kind="outreach-statuses" label="Outreach statuses" desc="The outreach reply labels (initial contact, no response, replied…). One per line." rows={6} list />
              </>
            ) : grp === "job-hunting" ? (
              <JobHuntingSettings />
            ) : grp === "integrations" ? (
              <IntegrationsSettings />
            ) : (
              <OutreachSettings />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
