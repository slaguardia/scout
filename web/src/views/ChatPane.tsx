// Chat pane (#chat-pane) — one slide-in shared by the global tracking chat and
// the per-entity (company/role) research chat. Opens on a thread, streams a turn
// via SSE (text deltas into a live bubble + a transient activity line), then
// reloads the canonical thread (tool chips) and refreshes the views the tools may
// have changed. Port of openChat/sendChat/renderChatMessages + the SSE handling.
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUI, useDispatch } from "../store/ui";
import { IconClose } from "../components/icons";
import { renderMarkdown } from "../lib/markdown";
import { getThread, postChatMessage, blockText, blockTools, type ChatMessage } from "../api/chat";

export function ChatPane() {
  const ui = useUI();
  const dispatch = useDispatch();
  const open = ui.chat !== null;
  return (
    <>
      <div className={"scrim" + (open ? " open" : "")} id="chat-scrim" onClick={() => dispatch({ type: "closeChat" })} />
      <aside className={"pane pane-chat" + (open ? " open" : "")} id="chat-pane" aria-hidden={!open}>
        {ui.chat ? <ChatBody key={ui.chat.scope + ":" + ui.chat.scopeId} scope={ui.chat.scope} scopeId={ui.chat.scopeId} title={ui.chat.title} /> : <ChatHead title="Chat" sub="" />}
      </aside>
    </>
  );
}

function ChatHead({ title, sub }: { title: string; sub: string }) {
  const dispatch = useDispatch();
  return (
    <div className="pane-head">
      <h2 id="chat-title">{title}</h2>
      <span id="chat-sub" className="chat-sub">
        {sub}
      </span>
      <button className="close-btn" aria-label="close" onClick={() => dispatch({ type: "closeChat" })}>
        <IconClose />
      </button>
    </div>
  );
}

interface Pending {
  userText: string;
  live: string;
  activity: string;
  streaming: boolean;
  error?: string;
}

function ChatBody({ scope, scopeId, title }: { scope: string; scopeId: string; title: string }) {
  const qc = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [input, setInput] = useState("");
  const threadId = useRef<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const headTitle = scope === "global" ? "Chat" : scope === "company" ? "Chat · company" : "Chat · role";
  const sub = scope === "global" ? "" : title || "";

  // Load the thread on open.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const data = await getThread(scope, scopeId);
        if (!live) return;
        threadId.current = data.thread.id;
        setMessages(data.messages || []);
        inputRef.current?.focus();
      } catch (e) {
        if (live) setLoadError((e as Error).message);
      }
    })();
    return () => {
      live = false;
      esRef.current?.close();
      esRef.current = null;
    };
  }, [scope, scopeId]);

  // Autoscroll on any content change.
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  const streaming = pending?.streaming ?? false;

  const send = async () => {
    const text = input.trim();
    if (!text || streaming || !threadId.current) return;
    setInput("");
    setPending({ userText: text, live: "", activity: "", streaming: true });
    const tid = threadId.current;

    const fail = (msg: string) => setPending((p) => (p ? { ...p, streaming: false, error: msg } : p));

    let resp: Response;
    try {
      resp = await postChatMessage(tid, text);
    } catch (e) {
      fail((e as Error).message);
      return;
    }
    if (!resp.ok) {
      fail((await resp.text().catch(() => "")).trim() || "HTTP " + resp.status);
      return;
    }

    const es = new EventSource(`/api/chat/${tid}/stream`);
    esRef.current = es;
    es.addEventListener("delta", (e: MessageEvent) => {
      setPending((p) => (p ? { ...p, live: p.live + e.data } : p));
    });
    es.addEventListener("activity", (e: MessageEvent) => {
      setPending((p) => (p ? { ...p, activity: e.data } : p));
    });
    es.addEventListener("end", async () => {
      es.close();
      if (esRef.current === es) esRef.current = null;
      if (threadId.current === tid) {
        try {
          const data = await getThread(scope, scopeId);
          setMessages(data.messages || []);
        } catch {
          /* keep what we have */
        }
      }
      setPending(null);
      // A turn may have captured/tracked entities — refresh the views.
      void qc.invalidateQueries({ queryKey: ["companies"] });
      void qc.invalidateQueries({ queryKey: ["jobs"] });
      void qc.invalidateQueries({ queryKey: ["stats"] });
      void qc.invalidateQueries({ queryKey: ["company"] });
    });
    es.onerror = () => {
      es.close();
      if (esRef.current === es) esRef.current = null;
      setPending((p) => (p ? { ...p, streaming: false } : p));
    };
  };

  const emptyHint =
    scope === "global"
      ? "Tell me about a job you applied to (paste the link), or ask what's already tracked."
      : "Ask about this " + (scope === "company" ? "company" : "role") + " — I can research it on the web and update scout.";

  const rendered = (messages || []).flatMap((m, i) => {
    const text = blockText(m.content);
    if (m.role === "user") return text ? [<UserBubble key={i} text={text} />] : [];
    if (m.role === "assistant") {
      const tools = blockTools(m.content);
      if (!text && !tools.length) return [];
      return [<AssistantBubble key={i} html={renderMarkdown(text)} tools={tools} />];
    }
    return [];
  });

  const showEmpty = !loadError && messages !== null && rendered.length === 0 && !pending;

  return (
    <>
      <ChatHead title={headTitle} sub={sub} />
      <div className="chat-body" id="chat-messages" ref={bodyRef}>
        {loadError ? (
          <div className="chat-empty">Failed to open chat: {loadError}</div>
        ) : messages === null ? (
          <div className="chat-empty">loading…</div>
        ) : (
          <>
            {rendered}
            {pending ? (
              <>
                <UserBubble text={pending.userText} />
                {pending.error ? (
                  <div className="chat-msg chat-assistant">⚠ {pending.error}</div>
                ) : (
                  <div className={"chat-msg chat-assistant" + (pending.streaming ? " chat-streaming" : "")}>{pending.live}</div>
                )}
                {pending.streaming && pending.activity ? <div className="chat-activity">· {pending.activity}…</div> : null}
              </>
            ) : null}
            {showEmpty ? <div className="chat-empty">{emptyHint}</div> : null}
          </>
        )}
      </div>
      <form
        className="chat-compose"
        id="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          id="chat-input"
          ref={inputRef}
          rows={1}
          placeholder="Message scout… (Enter to send, Shift+Enter for a newline)"
          disabled={streaming}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            const t = e.target;
            t.style.height = "auto";
            t.style.height = Math.min(t.scrollHeight, 160) + "px";
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button type="submit" className="chat-send" id="chat-send" aria-label="send" disabled={streaming}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 8l12-5-5 12-2.5-4.5L2 8z" />
          </svg>
        </button>
      </form>
    </>
  );
}

function UserBubble({ text }: { text: string }) {
  return <div className="chat-msg chat-user">{text}</div>;
}

function AssistantBubble({ html, tools }: { html: string; tools: string[] }) {
  return (
    <div className="chat-msg chat-assistant">
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {tools.length ? <div className="chat-tools">· used {tools.join(", ")}</div> : null}
    </div>
  );
}
