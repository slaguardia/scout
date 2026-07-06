// Companies view — the main triage table. Implemented in Phase 2.
export function CompaniesView({ active }: { active: boolean }) {
  return (
    <div className="table-wrap" id="companies-view" style={{ display: active ? "" : "none" }}>
      <div className="empty">
        <div className="t">Companies view — coming in Phase 2.</div>
      </div>
    </div>
  );
}
