// The mechanical pre-filter, edited as a structured form (chips + stage toggles +
// headcount + a master on/off), not raw TOML. Rendered inline on the Job-hunting
// settings page. Port of prefilterFormHTML + the pf* helpers + savePrefilter.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "../../components/Toast";
import { getTasteFilter, putTasteFilter, useFilterOptions } from "../../api/settings";

interface Rules {
  location: { allowed: string[]; remote_ok: boolean };
  headcount: { min: number; max: number };
  verticals: { allowed: string[]; excluded: string[] };
  funding_stage: { allowed: string[] };
}

function blank(): Rules {
  return {
    location: { allowed: [], remote_ok: true },
    headcount: { min: 0, max: 0 },
    verticals: { allowed: [], excluded: [] },
    funding_stage: { allowed: [] },
  };
}

function normalize(raw: Record<string, unknown> | undefined): Rules {
  const r = { ...blank(), ...(raw as Partial<Rules>) };
  return {
    location: { allowed: [], remote_ok: true, ...(r.location as object) } as Rules["location"],
    headcount: { min: 0, max: 0, ...(r.headcount as object) } as Rules["headcount"],
    verticals: { allowed: [], excluded: [], ...(r.verticals as object) } as Rules["verticals"],
    funding_stage: { allowed: [], ...(r.funding_stage as object) } as Rules["funding_stage"],
  };
}

const has = (list: string[], v: string) => list.some((x) => String(x).toLowerCase() === v.toLowerCase());

export function PrefilterForm() {
  const toast = useToast();
  const { data: opts } = useFilterOptions();
  const [rules, setRules] = useState<Rules | null>(null);
  const [enabled, setEnabled] = useState(true);
  const draft = useRef<Record<string, string>>({});

  const load = async (useDefault: boolean) => {
    try {
      const d = await getTasteFilter(useDefault);
      setRules(normalize(d.rules));
      if (!useDefault) setEnabled(d.enabled !== false);
    } catch (e) {
      toast(`failed to load pre-filter: ${(e as Error).message}`);
    }
  };
  useEffect(() => {
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vertOptions = opts?.verticals ?? [];
  const stageOptions = opts?.stages ?? [];

  const chipList = (field: "location.allowed" | "verticals.excluded" | "verticals.allowed"): string[] => {
    if (!rules) return [];
    const [a, b] = field.split(".") as [keyof Rules, string];
    return ((rules[a] as Record<string, unknown>)[b] as string[]) || [];
  };
  const setChipList = (field: string, vals: string[]) => {
    setRules((r) => {
      if (!r) return r;
      const [a, b] = field.split(".");
      const next = { ...r } as unknown as Record<string, Record<string, unknown>>;
      next[a] = { ...next[a], [b]: vals };
      return next as unknown as Rules;
    });
  };
  const addChip = (field: string, raw: string) => {
    const v = raw.trim();
    if (!v) return;
    const list = chipList(field as never);
    if (!has(list, v)) setChipList(field, [...list, v]);
    draft.current[field] = "";
  };
  const removeChip = (field: string, i: number) => {
    const vals = chipList(field as never).slice();
    vals.splice(i, 1);
    setChipList(field, vals);
  };
  const toggleStage = (value: string) => {
    if (!rules) return;
    const list = rules.funding_stage.allowed;
    setRules({
      ...rules,
      funding_stage: {
        allowed: has(list, value) ? list.filter((x) => String(x).toLowerCase() !== value.toLowerCase()) : [...list, value],
      },
    });
  };

  const save = async () => {
    if (!rules) return;
    // fold any typed-but-not-entered chip drafts
    const folded = { ...rules };
    for (const [field, raw] of Object.entries(draft.current)) {
      const v = (raw || "").trim();
      if (!v) continue;
      const [a, b] = field.split(".") as [keyof Rules, string];
      const list = ((folded[a] as Record<string, unknown>)[b] as string[]) || [];
      if (!has(list, v)) (folded[a] as Record<string, unknown>)[b] = [...list, v];
    }
    try {
      await putTasteFilter(folded as unknown as Record<string, unknown>, enabled);
      toast("pre-filter saved");
    } catch (e) {
      toast(`save failed: ${(e as Error).message}`);
    }
  };

  const dl = useMemo(
    () => (
      <datalist id="pf-vertical-tags">
        {vertOptions.map((o) => (
          <option key={o.value} value={o.value} label={String(o.count)} />
        ))}
      </datalist>
    ),
    [vertOptions],
  );

  if (!rules) return <div className="set-field pf-inline">loading pre-filter…</div>;

  const chipSection = (field: "location.allowed" | "verticals.excluded" | "verticals.allowed", datalist: boolean) => (
    <div className="pf-chips" data-field={field}>
      {chipList(field).map((v, i) => (
        <span key={i} className="pf-chip">
          {v}
          <button className="pf-chip-x" title="remove" aria-label={`remove ${v}`} onClick={() => removeChip(field, i)}>
            ×
          </button>
        </span>
      ))}
      <input
        className="pf-chip-input"
        data-field={field}
        list={datalist ? "pf-vertical-tags" : undefined}
        type="text"
        placeholder={datalist ? "type to search…" : "type & Enter…"}
        spellCheck={false}
        autoComplete="off"
        defaultValue=""
        onChange={(e) => (draft.current[field] = e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addChip(field, (e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).value = "";
          }
        }}
      />
    </div>
  );

  return (
    <div className="set-field pf-inline">
      <div className="set-field-label">Pre-filter</div>
      <div className="set-field-desc">
        A cheap, no-LLM gate that runs <strong>before</strong> a bulk verdict run, so the paid model only scores
        companies worth a closer look. It only narrows <strong>bulk</strong> runs — re-scoring one company by hand
        always runs the LLM — and never deletes, hides, or stops fetching anything.
      </div>
      <label className="pf-master">
        <input type="checkbox" id="pf-enabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span className="pf-master-text">
          <strong>Run the pre-filter on bulk runs</strong>
          <span className="pf-master-sub">Off → a bulk run scores every company (the rules below are kept either way).</span>
        </span>
      </label>
      <section className="pf-sec">
        <h3 className="pf-h">Location</h3>
        <p className="pf-help">A company passes if its location contains any of these. Add cities, regions, or "remote".</p>
        {chipSection("location.allowed", false)}
        <label className="pf-check">
          <input type="checkbox" id="pf-remote-ok" checked={rules.location.remote_ok} onChange={(e) => setRules({ ...rules, location: { ...rules.location, remote_ok: e.target.checked } })} />
          <span>Also pass companies with no location listed, or marked remote.</span>
        </label>
      </section>
      <section className="pf-sec">
        <h3 className="pf-h">Headcount</h3>
        <p className="pf-help">
          Pass only companies within this size range. Set a bound to <strong>0</strong> for no limit; companies with no
          headcount data always pass.
        </p>
        <div className="pf-range">
          <label>
            min <input type="number" id="pf-hc-min" className="input" min={0} step={1} value={rules.headcount.min} onChange={(e) => setRules({ ...rules, headcount: { ...rules.headcount, min: Math.max(0, parseInt(e.target.value, 10) || 0) } })} />
          </label>
          <span className="pf-range-dash">–</span>
          <label>
            max <input type="number" id="pf-hc-max" className="input" min={0} step={1} value={rules.headcount.max} onChange={(e) => setRules({ ...rules, headcount: { ...rules.headcount, max: Math.max(0, parseInt(e.target.value, 10) || 0) } })} />
          </label>
        </div>
      </section>
      <section className="pf-sec">
        <h3 className="pf-h">Industry / vertical</h3>
        <p className="pf-help">Matches whole category tags from your data. Start typing to pick a tag.</p>
        <div className="pf-sublabel">Exclude these tags</div>
        {chipSection("verticals.excluded", true)}
        <div className="pf-sublabel">
          Allow only these <span className="pf-sublabel-note">(leave empty to allow all)</span>
        </div>
        {chipSection("verticals.allowed", true)}
        {dl}
      </section>
      <section className="pf-sec">
        <h3 className="pf-h">Funding stage</h3>
        <p className="pf-help">If you pick any, only companies at those stages pass. Leave all unselected to allow every stage.</p>
        <div className="pf-stages" id="pf-stages">
          {stageOptions.map((o) => (
            <button key={o.value} className={"pf-stage" + (has(rules.funding_stage.allowed, o.value) ? " is-on" : "")} onClick={() => toggleStage(o.value)}>
              {o.value}
              {o.count ? <span className="pf-stage-n"> {o.count}</span> : null}
            </button>
          ))}
        </div>
      </section>
      <div className="set-field-foot">
        <button className="btn btn-primary" id="pf-save" onClick={save}>
          Save pre-filter
        </button>
        <button className="btn" id="pf-reset" title="discard your edits and restore the built-in default rules" onClick={() => load(true)}>
          Reset to default
        </button>
      </div>
    </div>
  );
}
