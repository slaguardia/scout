// Contacts manager (4b) — per-contact outreach tracking + follow-ups. A Gmail
// tracking bar, contact cards (each with edit/archive, a follow-up control row
// or a "log outreach" form, and the send history), and an add-contact form.
// Faithful port of contactsManagerHTML/contactCardHTML/followupGroupHTML +
// wireContacts, with query invalidation for refreshAfterContactChange.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast, copyEmailBody } from "../../components/Toast";
import { LoadingRow } from "../../components/Pill";
import { useDispatch } from "../../store/ui";
import { useVocab } from "../../api/queries";
import { useGmail, syncGmail, fmtSyncTime } from "../../api/gmail";
import {
  useContacts,
  useOutreachLog,
  addContact,
  updateContact,
  deleteContact,
  logOutreach,
  putOutreachEntry,
  markFollowedUp,
  deleteOutreachEntry,
} from "../../api/contacts";
import { putNextUp, putPostingTracking } from "../../api/postings";
import { renderFollowupTemplate, isoToday } from "../../lib/followup";
import type { Contact, OutreachLogEntry, Posting } from "../../api/types";

function useContactRefresh() {
  const qc = useQueryClient();
  return (postingId: string, companyId: string) => {
    void qc.invalidateQueries({ queryKey: ["jobs"] });
    void qc.invalidateQueries({ queryKey: ["contacts", companyId] });
    void qc.invalidateQueries({ queryKey: ["outreach-log", postingId] });
  };
}

export function ContactsManager({ posting: j }: { posting: Posting }) {
  const gmail = useGmail().data;
  const { data: contacts, isLoading: cLoading } = useContacts(j.company_id);
  const { data: log, isLoading: lLoading } = useOutreachLog(j.posting_id);
  const loaded = !cLoading && !lLoading;

  return (
    <div className="contacts-mgr">
      <GmailBar />
      {j.last_outreach_at ? (
        <div className="outreach-meta">
          <span>last outreach {j.last_outreach_at}</span>
        </div>
      ) : null}
      {!loaded ? (
        <LoadingRow msg="loading contacts…" />
      ) : (
        <>
          <div className="cc-cards">
            {(contacts ?? []).map((c) => (
              <ContactCard key={c.id} posting={j} contact={c} log={log ?? []} gmailConnected={!!gmail?.connected} />
            ))}
            {(contacts ?? []).length === 0 ? (
              <div className="cc-empty dim">No contacts yet — add the people you're reaching out to at {j.company}.</div>
            ) : null}
          </div>
          <AddContactForm posting={j} />
        </>
      )}
    </div>
  );
}

function GmailBar() {
  const gmail = useGmail().data;
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (!gmail?.connected) {
    return (
      <div className="cc-gmailbar cc-gmailbar-off dim">
        Gmail not connected — sends are logged by hand and replies don't auto-sync. Connect it in Settings → Gmail.
      </div>
    );
  }
  const last = gmail.last_sync_at ? `synced ${fmtSyncTime(gmail.last_sync_at, Date.now())}` : "not synced yet";
  const sync = async () => {
    setBusy(true);
    try {
      await syncGmail(true);
      void qc.invalidateQueries({ queryKey: ["gmail"] });
      void qc.invalidateQueries({ queryKey: ["contacts"] });
      void qc.invalidateQueries({ queryKey: ["outreach-log"] });
      toast("synced with Gmail");
    } catch (e) {
      toast(`sync failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cc-gmailbar">
      <span className="cc-gmail-on" title={gmail.email || ""}>
        Gmail tracking on{gmail.email ? ` · ${gmail.email}` : ""}
      </span>
      <span className="cc-gmail-sync dim">{last}</span>
      <button className="btn btn-sm cc-sync-now" type="button" disabled={busy} onClick={sync}>
        {busy ? (
          <>
            <span className="spinner spinner-xs"></span> Syncing…
          </>
        ) : (
          "Sync now"
        )}
      </button>
    </div>
  );
}

function AddContactForm({ posting: j }: { posting: Posting }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const toast = useToast();
  const refresh = useContactRefresh();

  const save = async () => {
    try {
      await addContact(j.company_id, { name, role, email });
      refresh(j.posting_id, j.company_id);
      toast("contact added");
      setName("");
      setRole("");
      setEmail("");
      setOpen(false);
    } catch (e) {
      toast(`save failed: ${(e as Error).message}`);
    }
  };

  return (
    <div className="cc-addwrap">
      {!open ? (
        <button className="btn cc-addbtn" type="button" onClick={() => setOpen(true)}>
          + add contact
        </button>
      ) : (
        <div className="cc-addform">
          <input className="input cc-f-name" placeholder="name" spellCheck={false} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <input className="input cc-f-role" placeholder="role (e.g. recruiter)" spellCheck={false} value={role} onChange={(e) => setRole(e.target.value)} />
          <input className="input cc-f-email" type="email" placeholder="email" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="cc-form-actions">
            <button className="btn btn-primary cc-f-save" type="button" onClick={save}>
              Add
            </button>
            <button className="btn cc-f-cancel" type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ContactCard({
  posting: j,
  contact: c,
  log,
  gmailConnected,
}: {
  posting: Posting;
  contact: Contact;
  log: OutreachLogEntry[];
  gmailConnected: boolean;
}) {
  const dispatch = useDispatch();
  const toast = useToast();
  const refresh = useContactRefresh();
  const vocab = useVocab().data;
  const [editOpen, setEditOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [eName, setEName] = useState(c.name || "");
  const [eRole, setERole] = useState(c.role || "");
  const [eEmail, setEEmail] = useState(c.email || "");
  const [logDate, setLogDate] = useState(isoToday());
  const [logBody, setLogBody] = useState("");

  const entries = log.filter((e) => e.contact_id === c.id); // newest first (API order)
  const latest = entries[0] || null;
  const canSend = gmailConnected && entries.some((e) => e.gmail_thread_id);

  const doRefresh = () => refresh(j.posting_id, j.company_id);

  const saveEdit = async () => {
    try {
      await updateContact(c.id, { name: eName, role: eRole, email: eEmail });
      doRefresh();
      toast("contact saved");
      setEditOpen(false);
    } catch (e) {
      toast(`save failed: ${(e as Error).message}`);
    }
  };

  const archive = async () => {
    if (entries.length > 0) {
      dispatch({ type: "openModal", modal: { kind: "delContact", contactId: c.id, name: c.name || "this contact", count: entries.length } });
      return;
    }
    try {
      await deleteContact(c.id);
      doRefresh();
      toast("contact removed");
    } catch (e) {
      toast(`save failed: ${(e as Error).message}`);
    }
  };

  const saveLog = async () => {
    try {
      await logOutreach(j.posting_id, { contact_id: c.id, sent_at: logDate || isoToday(), body: logBody });
      doRefresh();
      toast("outreach logged");
      setLogOpen(false);
      setLogBody("");
    } catch (e) {
      toast(`save failed: ${(e as Error).message}`);
    }
  };

  const copyFollowup = () => {
    void copyEmailBody(renderFollowupTemplate(vocab?.followupTemplate || "", j, c, latest), toast, "follow-up copied — paste into your email");
  };

  return (
    <div className="contact-card" data-cid={c.id}>
      <div className="cc-head">
        <span className="cc-name">{c.name || c.email || "contact"}</span>
        {c.role ? <span className="cc-role">{c.role}</span> : null}
        {c.email ? (
          <a className="cc-mail" href={`mailto:${c.email}`} title={c.email}>
            {c.email}
          </a>
        ) : null}
        <span className="cc-acts">
          <button className="cc-edit" type="button" title="edit contact" aria-label="edit" onClick={() => setEditOpen((o) => !o)}>
            ✎
          </button>
          <button className="cc-arch" type="button" title="remove contact" aria-label="remove" onClick={archive}>
            ×
          </button>
        </span>
      </div>
      {editOpen ? (
        <div className="cc-editform">
          <input className="input cc-e-name" value={eName} placeholder="name" spellCheck={false} onChange={(e) => setEName(e.target.value)} autoFocus />
          <input className="input cc-e-role" value={eRole} placeholder="role" spellCheck={false} onChange={(e) => setERole(e.target.value)} />
          <input className="input cc-e-email" type="email" value={eEmail} placeholder="email" spellCheck={false} onChange={(e) => setEEmail(e.target.value)} />
          <div className="cc-form-actions">
            <button className="btn btn-primary cc-e-save" type="button" onClick={saveEdit}>
              Save
            </button>
            <button className="btn cc-e-cancel" type="button" onClick={() => setEditOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {latest ? (
        <div className="cc-fu-group">
          <FollowupGroup posting={j} contact={c} latest={latest} canSend={canSend} onCopy={copyFollowup} onRefresh={doRefresh} />
        </div>
      ) : (
        <>
          <div className="cc-status">
            <span className="dim">no outreach logged yet</span>
          </div>
          <div className="cc-rowacts">
            <button className="btn cc-log" type="button" onClick={() => setLogOpen((o) => !o)}>
              + log outreach
            </button>
          </div>
          {logOpen ? (
            <div className="cc-logform">
              <input className="input cc-l-date" type="date" value={logDate} title="date sent" onChange={(e) => setLogDate(e.target.value)} />
              <textarea className="input cc-l-body" rows={5} placeholder="email body — what you sent (optional)" spellCheck={false} value={logBody} onChange={(e) => setLogBody(e.target.value)} />
              <div className="cc-form-actions">
                <button className="btn btn-primary cc-l-save" type="button" onClick={saveLog}>
                  Log
                </button>
                <button className="btn cc-l-cancel" type="button" onClick={() => setLogOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
      {entries.length ? (
        <details className="cc-history">
          <summary>
            {entries.length} email{entries.length === 1 ? "" : "s"} sent
          </summary>
          <div className="cc-entries">
            {entries.map((e) => (
              <OutreachEntry key={e.id} e={e} onRefresh={doRefresh} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

/** The label to set on "got a reply". Prefer a "replied"-flavored status; else
 * any non-first label silences the nag (the badge gate only fires on blank / the
 * first configured label). */
function repliedLabel(statuses: string[], current: string): string {
  const repl = statuses.find((s) => /repl/i.test(s));
  if (repl) return repl;
  return statuses.length > 1 ? statuses[1] : current || statuses[0] || "replied";
}

function FollowupGroup({
  posting: j,
  contact: c,
  latest,
  canSend,
  onCopy,
  onRefresh,
}: {
  posting: Posting;
  contact: Contact;
  latest: OutreachLogEntry;
  canSend: boolean;
  onCopy: () => void;
  onRefresh: () => void;
}) {
  const toast = useToast();
  const dispatch = useDispatch();
  const vocab = useVocab().data;
  const due = latest.followup_due_at || "";
  const isDue = !!due && due <= isoToday();

  // Carried unchanged when a helper just clears this send's reminder.
  const carry = { sent_at: latest.sent_at || "", body: latest.body || "", note: latest.note || "" };

  const markedFollowedUp = async () => {
    try {
      await markFollowedUp(latest.id);
      onRefresh();
      toast("followed up — next reminder set");
    } catch (e) {
      toast(`save failed: ${(e as Error).message}`);
    }
  };

  const gotReply = async () => {
    const label = repliedLabel(vocab?.outreachStatuses ?? [], j.outreach_status || "");
    try {
      // Silence at the posting level (the reply-status gate) and quiet this
      // contact's reminder so the card matches.
      await putPostingTracking(j, { outreach_status: label });
      await putOutreachEntry(latest.id, { ...carry, followup_due_at: "", done: false });
      onRefresh();
      toast("marked replied — reminders off");
    } catch (e) {
      toast(`save failed: ${(e as Error).message}`);
    }
  };

  const trySomeoneNew = async () => {
    try {
      // Queue this job to find a fresh contact, and quiet the cold one.
      await putNextUp(j.posting_id, true);
      await putOutreachEntry(latest.id, { ...carry, followup_due_at: "", done: false });
      onRefresh();
      toast(`queued next up — find another contact at ${j.company}`);
    } catch (e) {
      toast(`save failed: ${(e as Error).message}`);
    }
  };

  let statusLine: React.ReactNode;
  if (isDue) statusLine = <span className="cc-fu-status is-overdue">follow up — due {due}</span>;
  else if (due) statusLine = <span className="cc-fu-status">follow up on {due}</span>;
  else statusLine = <span className="cc-fu-status is-quiet">no reminder set</span>;

  return (
    <>
      {statusLine}
      <span className="cc-fu-actions">
        <button className="btn btn-sm cc-followup" type="button" title="copy a follow-up email from your template" onClick={onCopy}>
          Copy follow-up ⧉
        </button>
        {canSend ? (
          <button className="btn btn-sm btn-primary cc-fu-send" type="button" title="send this follow-up as a reply on the Gmail thread — logs it and re-arms the reminder" onClick={() => dispatch({ type: "openModal", modal: { kind: "sendFollowup", postingId: j.posting_id, contact: c, latest } })}>
            Send follow-up →
          </button>
        ) : null}
        <button className="cc-fu-link cc-fu-done" type="button" title="you followed up by hand — log it and set the next reminder" onClick={markedFollowedUp}>
          mark followed up
        </button>
        <button className="cc-fu-link cc-fu-reply" type="button" title="they replied — stop the reminders for this job" onClick={gotReply}>
          got a reply
        </button>
        <button className="cc-fu-link cc-fu-trynew" type="button" title="this contact's gone cold — queue this job to find a fresh contact" onClick={trySomeoneNew}>
          try someone new
        </button>
      </span>
    </>
  );
}

function OutreachEntry({ e, onRefresh }: { e: OutreachLogEntry; onRefresh: () => void }) {
  const toast = useToast();
  const prov = e.gmail_message_id ? (
    <span className="cc-e-prov prov-gmail" title="sent via Gmail — replies auto-sync">via Gmail ✓</span>
  ) : (
    <span className="cc-e-prov prov-manual" title="logged by hand — not tracked in Gmail">logged manually</span>
  );
  const fu = e.followup_due_at ? (
    <span className="fu-mini">→ follow up {e.followup_due_at}</span>
  ) : e.followup_done_at ? (
    <span className="fu-done">followed up</span>
  ) : null;

  const del = async (ev: React.MouseEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (!confirm("Delete this logged send? Its follow-up is removed too. This can't be undone.")) return;
    try {
      await deleteOutreachEntry(e.id);
      onRefresh();
      toast("send deleted");
    } catch (err) {
      toast(`save failed: ${(err as Error).message}`);
    }
  };

  const meta = (
    <>
      <span className="cc-e-date">{e.sent_at}</span>
      {prov}
      {e.note ? <span className="cc-e-note">{e.note}</span> : null}
      {fu}
    </>
  );
  const actions =
    e.body || !e.gmail_message_id ? (
      <span className="cc-e-actions">
        {e.body ? <span className="cc-e-view"></span> : null}
        {!e.gmail_message_id ? (
          <button className="cc-e-del" type="button" title="delete this logged send (and its follow-up)" aria-label="delete this send" onClick={del}>
            ×
          </button>
        ) : null}
      </span>
    ) : null;

  return e.body ? (
    <details className="cc-entry-d">
      <summary className="cc-entry">
        {meta}
        {actions}
      </summary>
      <pre className="cc-e-body">{e.body}</pre>
    </details>
  ) : (
    <div className="cc-entry">
      {meta}
      {actions}
    </div>
  );
}
