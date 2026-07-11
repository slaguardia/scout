// "archived" is a reserved application_status value ("stopped pursuing"): it hides
// the posting from the active jobs list and silences its follow-up reminders. It's
// not part of the editable application-stage vocab — it's composed into the stage
// dropdowns and driven by its own queue-nav.
export const ARCHIVED_STAGE = "archived";

export function isArchived(j: { application_status?: string | null }): boolean {
  return (j.application_status || "") === ARCHIVED_STAGE;
}
