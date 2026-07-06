// Integrations group: the Anthropic API key (write-only), Gmail OAuth client
// config + connect/disconnect, and the auto-update-application-status toggle.
// Port of renderIntegrationsSettings + gmailSetupHTML + its handlers.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast, copyToClipboard } from "../../components/Toast";
import { useGmail } from "../../api/gmail";
import {
  useKeyState,
  putAnthropicKey,
  deleteAnthropicKey,
  putGmailConfig,
  putGmailAutoflip,
  gmailConnect,
  gmailDisconnect,
} from "../../api/settings";
import type { GmailState } from "../../api/types";

const DEFAULT_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
];

export function IntegrationsSettings() {
  const { data: key } = useKeyState();
  const { data: gm } = useGmail();
  const qc = useQueryClient();
  const toast = useToast();
  const [akInput, setAkInput] = useState("");

  const ak = key ?? {};
  let knote = "Not set — verdict, capture & outreach disabled.";
  if (ak.key_source === "db") knote = "Set here · active.";
  else if (ak.key_source === "env") knote = "Using the ANTHROPIC_API_KEY environment variable.";

  const gConnected = !!gm?.connected;
  const gConfigured = !!gm?.configured;
  const gdot = gConnected ? "ok" : gConfigured ? "warn" : "off";
  const gstatusTxt = gConnected ? `Connected as ${gm?.email || "your account"}` : gConfigured ? "Not connected" : "Not set up";

  const refreshKey = () => {
    void qc.invalidateQueries({ queryKey: ["anthropic-key"] });
    void qc.invalidateQueries({ queryKey: ["meta"] });
  };

  const saveKey = async () => {
    const v = akInput.trim();
    if (!v) {
      toast("paste a key first");
      return;
    }
    try {
      await putAnthropicKey(v);
      toast("Anthropic key saved");
      setAkInput("");
      refreshKey();
    } catch (e) {
      toast(`${(e as Error).message}`);
    }
  };
  const removeKey = async () => {
    try {
      await deleteAnthropicKey();
      toast("Anthropic key removed");
      refreshKey();
    } catch (e) {
      toast(`${(e as Error).message}`);
    }
  };

  return (
    <>
      <div className="set-field">
        <div className="set-field-label">Anthropic API key</div>
        <div className="set-field-desc">Powers scoring, capture &amp; outreach. {knote}</div>
        <div className="set-field-row" style={{ marginTop: 8 }}>
          <input
            className="input"
            id="set-ak-input"
            type="password"
            placeholder={ak.key_source === "db" ? "•••••• set — paste to replace" : "sk-ant-…"}
            autoComplete="off"
            spellCheck={false}
            style={{ flex: 1 }}
            value={akInput}
            onChange={(e) => setAkInput(e.target.value)}
          />
          <button className="btn btn-primary" id="set-ak-save" onClick={saveKey}>
            Save
          </button>
          {ak.key_source === "db" ? (
            <button className="btn" id="set-ak-remove" onClick={removeKey}>
              Remove
            </button>
          ) : null}
        </div>
      </div>

      <GmailField gm={gm} gdot={gdot} gstatusTxt={gstatusTxt} gConnected={gConnected} gConfigured={gConfigured} />

      <AutoflipField autoflip={!!gm?.autoflip} />
    </>
  );
}

function GmailField({
  gm,
  gdot,
  gstatusTxt,
  gConnected,
  gConfigured,
}: {
  gm: GmailState | undefined;
  gdot: string;
  gstatusTxt: string;
  gConnected: boolean;
  gConfigured: boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [clientId, setClientId] = useState(gm?.client_id || "");
  const [secret, setSecret] = useState("");
  const [redirect, setRedirect] = useState(gm?.redirect_uri || "");

  const save = async () => {
    if (!clientId.trim()) {
      toast("client ID is required");
      return;
    }
    try {
      await putGmailConfig({ client_id: clientId.trim(), client_secret: secret, redirect_uri: redirect.trim() });
      toast("Gmail OAuth client saved");
      void qc.invalidateQueries({ queryKey: ["gmail"] });
    } catch (e) {
      toast(`${(e as Error).message}`);
    }
  };
  const connect = async () => {
    try {
      const body = await gmailConnect();
      if (body.auth_url) window.location.href = body.auth_url;
      else toast("could not start the Gmail connect flow");
    } catch (e) {
      toast(`connect failed: ${(e as Error).message}`);
    }
  };
  const disconnect = async () => {
    if (!confirm("Disconnect Gmail? Sending and sync stop; already-synced data stays.")) return;
    try {
      await gmailDisconnect();
      toast("Gmail disconnected");
      void qc.invalidateQueries({ queryKey: ["gmail"] });
    } catch (e) {
      toast(`disconnect failed: ${(e as Error).message}`);
    }
  };

  return (
    <div className="set-field">
      <div className="set-field-label">
        Gmail{" "}
        <span className="set-status">
          <span className={"pf-dot " + gdot}></span>
          {gstatusTxt}
        </span>
      </div>
      <div className="set-field-desc">Send outreach from your Gmail and auto-sync replies + application status.</div>
      <GmailSetup gm={gm} />
      <div className="set-subfields">
        <label className="set-sub-label" htmlFor="set-gm-id">Client ID</label>
        <input className="input" id="set-gm-id" placeholder="…apps.googleusercontent.com" autoComplete="off" spellCheck={false} value={clientId} onChange={(e) => setClientId(e.target.value)} />
        <label className="set-sub-label" htmlFor="set-gm-secret">Client secret</label>
        <input className="input" id="set-gm-secret" type="password" placeholder="(leave blank to keep the current secret)" autoComplete="off" spellCheck={false} value={secret} onChange={(e) => setSecret(e.target.value)} />
        <label className="set-sub-label" htmlFor="set-gm-redirect">
          Redirect URI <span className="dim">(optional — derived from this host if blank)</span>
        </label>
        <input className="input" id="set-gm-redirect" placeholder="https://…/api/gmail/callback" autoComplete="off" spellCheck={false} value={redirect} onChange={(e) => setRedirect(e.target.value)} />
      </div>
      <div className="set-field-row" style={{ marginTop: 10 }}>
        <button className="btn" id="set-gm-save" onClick={save}>
          Save credentials
        </button>
        {gConfigured && !gConnected ? (
          <button className="btn btn-primary" id="set-gm-connect" onClick={connect}>
            Connect
          </button>
        ) : null}
        {gConnected ? (
          <button className="btn" id="set-gm-disconnect" onClick={disconnect}>
            Disconnect
          </button>
        ) : null}
      </div>
    </div>
  );
}

function GmailSetup({ gm }: { gm: GmailState | undefined }) {
  const toast = useToast();
  const cb = gm?.callback_uri || "(your scout URL)/api/gmail/callback";
  const scopes = gm?.scopes || DEFAULT_SCOPES;
  return (
    <details className="set-help" open={!gm?.configured}>
      <summary>Set up the Google OAuth client (one-time)</summary>
      <div className="set-help-body">
        <ol className="set-steps">
          <li>
            <strong>Enable the Gmail API.</strong> In{" "}
            <a href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noopener">
              APIs &amp; Services → Library → Gmail API
            </a>
            , click <strong>Enable</strong> — or run <code>gcloud services enable gmail.googleapis.com</code>.
          </li>
          <li>
            <strong>Configure the OAuth consent screen.</strong> Add these scopes:
            <ul className="set-help-scopes">
              {scopes.map((s) => (
                <li key={s}>
                  <code>{s}</code>
                </li>
              ))}
            </ul>
            Then authorize your mailbox — pick one:
            <div className="set-choice">
              <div className="sc-opt sc-go">
                <div className="sc-opt-head">
                  <strong>Publish app</strong>
                  <span className="sc-tag">recommended</span>
                </div>
                <div className="sc-opt-desc">Self-hosting your own mailbox needs no Google verification.</div>
              </div>
              <div className="sc-or">or</div>
              <div className="sc-opt sc-alt">
                <div className="sc-opt-head">
                  <strong>Add Test users</strong>
                </div>
                <div className="sc-opt-desc">Add your own Google account as a test user — no publishing.</div>
              </div>
            </div>
          </li>
          <li>
            <strong>Create the OAuth client.</strong> In{" "}
            <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">
              APIs &amp; Services → Credentials
            </a>
            , create an <strong>OAuth client ID → Web application</strong>, and add this exact{" "}
            <strong>Authorized redirect URI</strong>:
            <div className="set-copy-row">
              <code id="gm-cb">{cb}</code>
              <button className="btn btn-sm" id="gm-copy-cb" type="button" onClick={() => copyToClipboard(gm?.callback_uri || "", toast, "redirect URI copied")}>
                Copy
              </button>
            </div>
          </li>
          <li>
            <strong>Connect.</strong> Paste the client ID &amp; secret below, click <strong>Save</strong>, then{" "}
            <strong>Connect</strong>.
          </li>
        </ol>
      </div>
    </details>
  );
}

function AutoflipField({ autoflip }: { autoflip: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [on, setOn] = useState(autoflip);
  const toggle = async (next: boolean) => {
    setOn(next);
    try {
      await putGmailAutoflip(next);
      void qc.invalidateQueries({ queryKey: ["gmail"] });
      toast(`auto-update ${next ? "on" : "off"}`);
    } catch {
      setOn(!next);
      toast("failed to save");
    }
  };
  return (
    <div className="set-field">
      <div className="set-field-label">Auto-update application status</div>
      <div className="set-field-desc">
        On: scout sets a job's application status from incoming ATS/company mail. Off (default): it suggests it in the
        Inbox for one-click apply.
      </div>
      <div className="set-field-row" style={{ marginTop: 8 }}>
        <label className="set-toggle">
          <input type="checkbox" id="set-autoflip" checked={on} onChange={(e) => toggle(e.target.checked)} /> auto-update application status
        </label>
      </div>
    </div>
  );
}
