// Modal host — renders whichever modal the store has open. Each concrete modal
// is added in its phase (add/run: Phase 6; editor/key/etc: Phase 5; relink/delete
// confirms: Phases 2/4). Unhandled kinds render nothing until then.
import { useUI } from "../store/ui";

export function Modals() {
  const { modal } = useUI();
  if (!modal) return null;
  // Concrete modals are wired in per phase.
  return null;
}
