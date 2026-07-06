// Chat pane (#chat-pane) — one slide-in reused for all scopes. Implemented in Phase 7.
import { useUI, useDispatch } from "../store/ui";
import { IconClose } from "../components/icons";

export function ChatPane() {
  const ui = useUI();
  const dispatch = useDispatch();
  const open = ui.chat !== null;
  return (
    <>
      <div className={"scrim" + (open ? " open" : "")} onClick={() => dispatch({ type: "closeChat" })} />
      <aside className={"pane pane-chat" + (open ? " open" : "")} aria-hidden={!open}>
        <div className="pane-head">
          <h2>Chat</h2>
          <span className="chat-sub"></span>
          <button className="close-btn" aria-label="close" onClick={() => dispatch({ type: "closeChat" })}>
            <IconClose />
          </button>
        </div>
        <div className="chat-body" id="chat-messages" />
      </aside>
    </>
  );
}
