// Jobs view — the application tracker table. Implemented in Phase 3.
export function JobsView({ active }: { active: boolean }) {
  return (
    <div className="table-wrap" id="jobs-view" style={{ display: active ? "" : "none" }}>
      <div className="empty">
        <div className="t">Jobs view — coming in Phase 3.</div>
      </div>
    </div>
  );
}
