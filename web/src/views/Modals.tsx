// Modal host — renders whichever modal the store has open. Concrete modals are
// added in their phase (add/run: Phase 6; editor/key/etc: Phase 5; relink/delete
// confirms: Phases 2/4). Unhandled kinds render nothing until then.
import { useUI } from "../store/ui";
import { DeleteCompanyModal } from "./modals/DeleteCompanyModal";

export function Modals() {
  const { modal } = useUI();
  if (!modal) return null;
  switch (modal.kind) {
    case "delCompany":
      return <DeleteCompanyModal company={modal.company} />;
    default:
      return null;
  }
}
