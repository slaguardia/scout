// Outreach-knowledge sources — a read-only peek at the brain pages scout resolved
// per need (experience required, voice/logistics optional). Port of
// openSourcesModal + renderSourcesList.
import { Modal, ModalNote } from "../../components/Modal";
import { LoadingRow } from "../../components/Pill";
import { useDispatch } from "../../store/ui";
import { useSources } from "../../api/settings";

const DEFAULT_NEEDS = [
  { key: "experience", hard: true },
  { key: "voice", hard: false },
  { key: "logistics", hard: false },
];

export function SourcesModal() {
  const dispatch = useDispatch();
  const { data, isLoading } = useSources();
  const close = () => dispatch({ type: "closeModal" });

  const needs =
    data?.needs && data.needs.length
      ? data.needs.map((n) => ({ key: (n.Key || n.key) as string, hard: (n.Hard ?? n.hard) as boolean }))
      : DEFAULT_NEEDS;
  const byNeed: Record<string, { title?: string; page_id?: string }[]> = {};
  (data?.sources || []).forEach((s) => {
    (byNeed[s.need] = byNeed[s.need] || []).push(s);
  });

  return (
    <Modal onClose={close}>
      <div className="modal-head">
        <h2>outreach knowledge</h2>
      </div>
      <div className="modal-body">
        <div id="sources-list">
          {isLoading ? (
            <LoadingRow />
          ) : (
            needs.map((n) => {
              const rows = byNeed[n.key] || [];
              return (
                <div className="src-need" key={n.key}>
                  <div className="src-need-h">
                    {n.key} <span className="dim">{n.hard ? "required" : "optional"}</span>
                  </div>
                  <ul className="src-items">
                    {rows.length ? (
                      rows.map((s, i) => (
                        <li key={i}>
                          <span className="src-title">{s.title || s.page_id}</span>
                        </li>
                      ))
                    ) : (
                      <li className="dim small">{n.hard ? "none yet — add an experience page to your brain" : "none (optional)"}</li>
                    )}
                  </ul>
                </div>
              );
            })
          )}
        </div>
        <ModalNote>
          Synced automatically from your brain — an LLM over the document map picks the pages for each need:{" "}
          <strong>experience</strong> (required — the honesty checker's ground truth), <strong>voice</strong> (optional),
          and <strong>logistics</strong> (optional). Scout re-syncs whenever your brain changes; this is a read-only view
          of what it resolved. To change it, edit the pages in your brain.
        </ModalNote>
      </div>
      <div className="modal-foot">
        <button className="btn" onClick={close}>
          Close
        </button>
      </div>
    </Modal>
  );
}
