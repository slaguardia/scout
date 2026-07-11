// Inbox view — Gmail replies, application-status updates, and follow-ups due.
// Clicking an unread item marks it read; an app-status update offers a one-click
// Apply; an unlinked item offers a link-to-role select; a follow-up offers Open.
// Port of renderNotifications/notifItemHTML/followupItemHTML + wireNotifications +
// the mark-seen/apply/link/sync handlers.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "../components/Toast";
import { useDispatch } from "../store/ui";
import {
  useNotifications,
  markNotifSeen,
  markAllNotifsSeen,
  deleteNotif,
  applyNotif,
  syncGmailNow,
  type NotificationItem,
  type FollowupItem,
} from "../api/notifications";

export function InboxView() {
  const { data } = useNotifications();
  const notifs = data?.notifications ?? [];
  const fus = data?.followups ?? [];
  const unread = data?.unread ?? 0;
  const toast = useToast();
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  const sync = async () => {
    setSyncing(true);
    try {
      await syncGmailNow();
      toast("synced");
    } catch (e) {
      toast(`sync failed: ${(e as Error).message}`);
    } finally {
      setSyncing(false);
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      void qc.invalidateQueries({ queryKey: ["jobs"] });
    }
  };

  const markAllRead = async () => {
    try {
      await markAllNotifsSeen();
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    } catch (e) {
      toast(`failed: ${(e as Error).message}`);
    }
  };

  return (
    <div className="main-view" id="inbox-view">
      <div className="settings-page">
        <div className="settings-page-head settings-page-head--row">
          <div>
            <h2>Inbox</h2>
            <div className="settings-page-sub">Replies, application updates, and follow-ups due — synced from Gmail.</div>
          </div>
          <div className="notif-head-acts">
            {unread > 0 ? (
              <button className="btn" id="notifications-mark-all" onClick={markAllRead}>
                Mark all read
              </button>
            ) : null}
            <button className="btn" id="notifications-sync" title="check Gmail now for new mail" disabled={syncing} onClick={sync}>
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          </div>
        </div>
        <div id="notifications-body">
          {notifs.length === 0 && fus.length === 0 ? (
            <div className="cc-empty dim">Nothing here yet. Replies, application updates, and follow-ups show up as Gmail syncs.</div>
          ) : (
            <>
              {notifs.length ? (
                <>
                  <div className="settings-group-h">Updates</div>
                  {notifs.map((n) => (
                    <NotifItem key={n.id} n={n} />
                  ))}
                </>
              ) : null}
              {fus.length ? (
                <>
                  <div className="settings-group-h">Follow-ups due</div>
                  {fus.map((f, i) => (
                    <FollowupItemRow key={i} f={f} />
                  ))}
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function NotifItem({ n }: { n: NotificationItem }) {
  const qc = useQueryClient();
  const toast = useToast();
  const dispatch = useDispatch();

  const seen = async () => {
    if (n.seen) return;
    try {
      await markNotifSeen(n.id);
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    } catch {
      /* ignore */
    }
  };
  const apply = async () => {
    try {
      const r = await applyNotif(n.id);
      toast(`status set to ${r.applied || "updated"}`);
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      void qc.invalidateQueries({ queryKey: ["jobs"] });
    } catch (e) {
      toast(`apply failed: ${(e as Error).message}`);
    }
  };
  const remove = async () => {
    try {
      await deleteNotif(n.id);
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    } catch (e) {
      toast(`remove failed: ${(e as Error).message}`);
    }
  };

  const ctx = n.company || n.role ? [n.company, n.role].filter(Boolean).join(" · ") : null;
  const showApply = n.kind === "app_status" && n.suggested_status && !n.actioned && n.posting_id;

  return (
    <div className={"notif-item" + (n.seen ? "" : " is-unread")} data-id={n.id}>
      <div className="notif-main" onClick={seen}>
        <div className="notif-title">
          {n.seen ? null : <span className="notif-dot" aria-label="unread"></span>}
          {n.title}
        </div>
        {ctx ? <div className="notif-ctx">{ctx}</div> : <div className="notif-ctx dim">not linked to a role</div>}
        {n.detail ? <div className="notif-detail">{n.detail}</div> : null}
      </div>
      <div className="notif-side">
        {n.created_at ? <span className="notif-when">{(n.created_at || "").replace("T", " ").slice(0, 16)}</span> : null}
        <div className="notif-acts">
          {showApply ? (
            <button className="btn btn-primary notif-apply" onClick={(e) => { e.stopPropagation(); apply(); }}>
              Apply: {n.suggested_status}
            </button>
          ) : null}
          {!n.posting_id ? (
            <button
              className="btn btn-sm notif-link"
              title="link this to a role"
              onClick={(e) => {
                e.stopPropagation();
                dispatch({ type: "openModal", modal: { kind: "linkRole", notifId: n.id, company: n.company, role: n.role } });
              }}
            >
              Link to a role
            </button>
          ) : null}
          <div className="notif-dismiss">
            {!n.seen ? (
              <button className="btn btn-sm" title="mark this notification read" onClick={(e) => { e.stopPropagation(); seen(); }}>
                Mark read
              </button>
            ) : null}
            <button className="btn btn-sm" title="remove this notification" onClick={(e) => { e.stopPropagation(); remove(); }}>
              Remove
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FollowupItemRow({ f }: { f: FollowupItem }) {
  const dispatch = useDispatch();
  return (
    <div className="notif-item notif-followup">
      <div className="notif-main">
        <div className="notif-title">Follow up: {f.contact_name || "contact"}</div>
        <div className="notif-ctx">{[f.company, f.role].filter(Boolean).join(" · ")}</div>
        <div className="notif-detail dim">due {f.due_at || ""}</div>
      </div>
      <div className="notif-side">
        <button
          className="btn notif-open"
          onClick={() => {
            dispatch({ type: "setView", view: "jobs" });
            dispatch({ type: "openPursuit", id: f.posting_id });
          }}
        >
          Open
        </button>
      </div>
    </div>
  );
}
