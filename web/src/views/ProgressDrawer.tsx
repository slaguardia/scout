// Progress drawer (bottom-right SSE run log). Implemented in Phase 6.
export function ProgressDrawer() {
  return (
    <div className="drawer" id="drawer">
      <div className="drawer-head">
        <span className="spinner" id="drawer-spinner"></span>
        <span className="dtitle" id="drawer-title">run</span>
      </div>
      <div className="drawer-log" id="drawer-log"></div>
    </div>
  );
}
