// Company detail pane (#pane). Implemented in Phase 2.
import { SlidePane, PaneHead } from "../components/Pane";
import { useUI, useDispatch } from "../store/ui";

export function CompanyPane() {
  const ui = useUI();
  const dispatch = useDispatch();
  const open = ui.openCompanyId !== null;
  const onTop = ui.topPane === "company";
  return (
    <SlidePane
      open={open}
      onClose={() => dispatch({ type: "closeCompany" })}
      paneZ={onTop ? 55 : 53}
      scrimZ={onTop ? 54 : 52}
    >
      <PaneHead title="—" onClose={() => dispatch({ type: "closeCompany" })} />
      <div className="pane-body" />
    </SlidePane>
  );
}
