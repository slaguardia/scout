// Relink modal — move a posting to a different existing company (the fix for a
// job captured under the wrong company twin). Search-as-you-type over the loaded
// companies, ranked prefix-first; the current company shows but isn't selectable.
import { useMemo, useState } from "react";
import { Modal, ModalNote } from "../../components/Modal";
import { pillClass } from "../../components/Pill";
import { useDispatch } from "../../store/ui";
import { useCompanies } from "../../api/companies";
import { usePostingActions } from "../../hooks/usePostingActions";
import type { Posting } from "../../api/types";

export function RelinkModal({ posting }: { posting: Posting }) {
  const dispatch = useDispatch();
  const { data: companies } = useCompanies();
  const { relink } = usePostingActions();
  const [q, setQ] = useState("");
  const close = () => dispatch({ type: "closeModal" });

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    let list = (companies ?? []).slice();
    if (query) {
      list = list.filter((r) => (r.name || "").toLowerCase().includes(query));
      list.sort((a, b) => {
        const ap = (a.name || "").toLowerCase().startsWith(query) ? 0 : 1;
        const bp = (b.name || "").toLowerCase().startsWith(query) ? 0 : 1;
        return ap - bp || (a.name || "").localeCompare(b.name || "");
      });
    } else {
      list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }
    return list.slice(0, 60);
  }, [companies, q]);

  const choose = async (companyId: string) => {
    const ok = await relink(posting, companyId);
    if (ok) close();
  };

  return (
    <Modal width={520} onClose={close}>
      <div className="modal-head">
        <h2>Move job to another company</h2>
        <span className="ver" id="relink-current">
          {posting.company ? `currently: ${posting.company}` : ""}
        </span>
      </div>
      <div className="modal-body">
        <input
          type="text"
          id="relink-search"
          className="key-input"
          placeholder="search companies…"
          autoComplete="off"
          spellCheck={false}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <div className="relink-results" id="relink-results">
          {rows.length === 0 ? (
            <div className="relink-empty">{(companies ?? []).length ? "no company matches" : "no companies yet — Add one first"}</div>
          ) : (
            rows.map((r) => {
              const current = r.company_id === posting.company_id;
              const sub = [r.vertical, r.location].filter(Boolean).join(" · ");
              return (
                <button key={r.company_id} type="button" className={"relink-result" + (current ? " is-current" : "")} disabled={current} onClick={() => choose(r.company_id)}>
                  <span className="rr-main">
                    <span className="rr-name">{r.name || "—"}</span>
                    {sub ? <span className="rr-sub">{sub}</span> : null}
                  </span>
                  <span className={pillClass(r.verdict) + " rr-verdict"}>{r.verdict || "—"}</span>
                  {current ? <span className="rr-current-tag">current</span> : null}
                </button>
              );
            })
          )}
        </div>
        <ModalNote>
          Moves this job to a different <strong>existing</strong> company — the fix for a posting captured under the
          wrong company twin. Its outreach drafts, application answers, and tracking travel with it; it then shows the
          new company's verdict. To add a brand-new company, use <strong>Add</strong> first.
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
