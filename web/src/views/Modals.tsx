// Modal host — renders whichever modal the store has open. Concrete modals are
// added in their phase (add/run: Phase 6; editor/key/etc: Phase 5). Unhandled
// kinds render nothing until then.
import { useUI } from "../store/ui";
import { DeleteCompanyModal } from "./modals/DeleteCompanyModal";
import { RelinkModal } from "./modals/RelinkModal";
import { LinkRoleModal } from "./modals/LinkRoleModal";
import { DeleteJobModal } from "./modals/DeleteJobModal";
import { DeleteContactModal } from "./modals/DeleteContactModal";
import { SendFollowupModal } from "./modals/SendFollowupModal";
import { EditorModal } from "./modals/EditorModal";
import { SourcesModal } from "./modals/SourcesModal";
import { AddDialog } from "./modals/AddDialog";
import { RunConfirmModal } from "./modals/RunConfirmModal";

export function Modals() {
  const { modal } = useUI();
  if (!modal) return null;
  switch (modal.kind) {
    case "add":
      return <AddDialog />;
    case "run":
      return <RunConfirmModal stage={modal.stage} />;
    case "delCompany":
      return <DeleteCompanyModal company={modal.company} />;
    case "relink":
      return <RelinkModal posting={modal.posting} />;
    case "linkRole":
      return <LinkRoleModal notifId={modal.notifId} company={modal.company} role={modal.role} />;
    case "delJob":
      return <DeleteJobModal posting={modal.posting} />;
    case "delContact":
      return <DeleteContactModal contactId={modal.contactId} name={modal.name} count={modal.count} />;
    case "sendFollowup":
      return <SendFollowupModal postingId={modal.postingId} contact={modal.contact} latest={modal.latest} />;
    case "editor":
      return <EditorModal editorKind={modal.editorKind} />;
    case "sources":
      return <SourcesModal />;
    default:
      return null;
  }
}
