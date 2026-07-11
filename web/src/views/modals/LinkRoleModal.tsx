// Link-role modal — attach an unlinked inbox notification to an existing role.
// Search-as-you-type over the loaded postings, ranked prefix-first; mirrors the
// RelinkModal pattern (a filtered result list beats a dropdown of every role).
// Seeded with the notification's company hint so it lands on that company's roles.
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Modal, ModalNote } from "../../components/Modal";
import { pillClass } from "../../components/Pill";
import { useToast } from "../../components/Toast";
import { useDispatch } from "../../store/ui";
import { useJobs } from "../../api/jobs";
import { linkNotif } from "../../api/notifications";

export function LinkRoleModal({ notifId, company, role }: { notifId: string; company?: string | null; role?: string | null }) {
  const dispatch = useDispatch();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: jobs } = useJobs();
  const [q, setQ] = useState(company ?? "");
  const close = () => dispatch({ type: "closeModal" });

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    const label = (r: { company?: string | null; title?: string | null }) =>
      ((r.company || "") + " " + (r.title || "")).toLowerCase();
    let list = (jobs ?? []).slice();
    if (query) {
      list = list.filter((r) => label(r).includes(query));
      list.sort((a, b) => {
        const ap = (a.company || "").toLowerCase().startsWith(query) ? 0 : 1;
        const bp = (b.company || "").toLowerCase().startsWith(query) ? 0 : 1;
        return ap - bp || label(a).localeCompare(label(b));
      });
    } else {
      list.sort((a, b) => label(a).localeCompare(label(b)));
    }
    return list.slice(0, 60);
  }, [jobs, q]);

  const choose = async (postingId: string) => {
    try {
      await linkNotif(notifId, postingId);
      toast("linked to role");
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      close();
    } catch (e) {
      toast(`link failed: ${(e as Error).message}`);
    }
  };

  const hint = [company, role].filter(Boolean).join(" · ");

  return (
    <Modal width={520} onClose={close}>
      <div className="modal-head">
        <h2>Link to a role</h2>
        <span className="ver">{hint ? `from: ${hint}` : ""}</span>
      </div>
      <div className="modal-body">
        <input
          type="text"
          className="key-input link-role-search"
          placeholder="search roles…"
          autoComplete="off"
          spellCheck={false}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <div className="relink-results">
          {rows.length === 0 ? (
            <div className="relink-empty">{(jobs ?? []).length ? "no role matches" : "no roles yet — Add one first"}</div>
          ) : (
            rows.map((r) => {
              const sub = [r.location, r.application_status].filter(Boolean).join(" · ");
              return (
                <button key={r.posting_id} type="button" className="relink-result" onClick={() => choose(r.posting_id)}>
                  <span className="rr-main">
                    <span className="rr-name">{(r.company || "") + " — " + (r.title || "(untitled)")}</span>
                    {sub ? <span className="rr-sub">{sub}</span> : null}
                  </span>
                  <span className={pillClass(r.verdict) + " rr-verdict"}>{r.verdict || "—"}</span>
                </button>
              );
            })
          )}
        </div>
        <ModalNote>
          Attaches this update to an <strong>existing</strong> role so it shows up on that job's timeline. To add a
          brand-new role, use <strong>Add</strong> first.
        </ModalNote>
      </div>
      <div className="modal-foot">
        <button className="btn" onClick={close}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
