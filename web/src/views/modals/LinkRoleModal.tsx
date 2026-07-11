// Link-role modal — attach an unlinked inbox notification to an existing role.
// Search-as-you-type over the loaded postings, ranked prefix-first; mirrors the
// RelinkModal pattern (a filtered result list beats a dropdown of every role).
// Shows a preview of the notification up top (you forget which one by the time
// the modal opens) and seeds the search with its company hint.
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Modal, ModalNote } from "../../components/Modal";
import { pillClass } from "../../components/Pill";
import { useToast } from "../../components/Toast";
import { useDispatch } from "../../store/ui";
import { useJobs } from "../../api/jobs";
import { linkNotif, type NotificationItem } from "../../api/notifications";

export function LinkRoleModal({ notif }: { notif: NotificationItem }) {
  const dispatch = useDispatch();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: jobs } = useJobs();
  const [q, setQ] = useState(notif.company ?? "");
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
      await linkNotif(notif.id, postingId);
      toast("linked to role");
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      close();
    } catch (e) {
      toast(`link failed: ${(e as Error).message}`);
    }
  };

  const ctx = [notif.company, notif.role].filter(Boolean).join(" · ");
  const when = (notif.created_at || "").replace("T", " ").slice(0, 16);

  return (
    <Modal width={520} onClose={close}>
      <div className="modal-head">
        <h2>Link to a role</h2>
      </div>
      <div className="modal-body">
        <div className="link-role-preview">
          <div className="lrp-title">{notif.title}</div>
          {ctx ? <div className="lrp-ctx">{ctx}</div> : null}
          {notif.detail ? <div className="lrp-detail">{notif.detail}</div> : null}
          {when ? <div className="lrp-when">{when}</div> : null}
        </div>
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
