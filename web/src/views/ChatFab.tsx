// Floating chat CTA — shown only when chat is enabled (API key present).
import { useMeta } from "../api/queries";
import { useDispatch } from "../store/ui";
import { IconChat } from "../components/icons";

export function ChatFab() {
  const meta = useMeta().data;
  const dispatch = useDispatch();
  if (!meta?.chat) return null;
  return (
    <button
      className="chat-fab"
      title="Chat: track applications and ask about your companies/jobs"
      aria-label="chat"
      onClick={() => dispatch({ type: "openChat", scope: "global", scopeId: "", title: "" })}
    >
      <IconChat />
    </button>
  );
}
