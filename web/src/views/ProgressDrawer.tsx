// Progress drawer (bottom-right) — renders the RunController's streamed lines.
// Verdict lines render as a pill + name + reason row; a finished scoring run gets
// a yes/maybe/no tally footer. Hovering pauses the auto-close countdown.
import { useEffect, useRef } from "react";
import { useRun, useRunState } from "../store/run";

export function ProgressDrawer() {
  const state = useRunState();
  const { cancel, closeDrawer, pauseTTL, armTTL } = useRun();
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.lines]);

  return (
    <div
      className={"drawer" + (state.open ? " open" : "")}
      id="drawer"
      onMouseEnter={pauseTTL}
      onMouseLeave={() => {
        if (!state.running) armTTL();
      }}
    >
      <div className="drawer-head">
        <span className="spinner" style={{ display: state.running ? "" : "none" }}></span>
        <span className="dtitle">{state.title}</span>
        <button style={{ display: state.running ? "" : "none" }} onClick={cancel}>
          cancel
        </button>
        <button style={{ display: state.running ? "none" : "" }} onClick={closeDrawer}>
          close
        </button>
      </div>
      <div className="drawer-log" ref={logRef}>
        {state.lines.map((ln, i) =>
          ln.verdict ? (
            <div key={i} className={ln.cls}>
              <span className={"pill pill-" + ln.verdict}>{ln.verdict}</span>
              <span className="lv-text">
                <span className="lv-name">{ln.name}</span>
                {ln.reason ? (
                  <>
                    {" "}
                    <span className="lv-reason">{ln.reason}</span>
                  </>
                ) : null}
              </span>
            </div>
          ) : (
            <div key={i} className={ln.cls}>
              {ln.text}
            </div>
          ),
        )}
      </div>
      <div className="drawer-summary" hidden={state.summary.length === 0}>
        {state.summary.map((c) => (
          <span key={c.verdict} className={"pill pill-" + c.verdict}>
            {c.n} {c.verdict}
          </span>
        ))}
      </div>
    </div>
  );
}
