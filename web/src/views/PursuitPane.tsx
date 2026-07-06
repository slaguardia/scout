// Pursuit pane (#pursuit-pane) — the jobs-view role panel. Implemented in Phase 4.
import { SlidePane, PaneHead } from "../components/Pane";
import { useUI, useDispatch } from "../store/ui";

export function PursuitPane() {
  const ui = useUI();
  const dispatch = useDispatch();
  const open = ui.openPursuitId !== null;
  const onTop = ui.topPane === "pursuit";
  return (
    <SlidePane
      open={open}
      onClose={() => dispatch({ type: "closePursuit" })}
      variant="pane-pursuit"
      paneZ={onTop ? 55 : 53}
      scrimZ={onTop ? 54 : 52}
    >
      <PaneHead title="—" onClose={() => dispatch({ type: "closePursuit" })} />
      <div className="pane-body" />
    </SlidePane>
  );
}
