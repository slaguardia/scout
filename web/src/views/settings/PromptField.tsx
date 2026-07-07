// One outreach-pipeline stage prompt: load GET /api/outreach-prompts/<key>,
// save on blur (content + enabled), an enable toggle (every stage but the
// Writer/fill), and Reset-to-default. Port of renderPipelineSettings +
// loadPromptField/savePromptField.
import { useRef, useState } from "react";
import { useToast } from "../../components/Toast";
import { usePrompt, putPrompt, resetPrompt } from "../../api/settings";

export function PromptField({ prompt, title, desc }: { prompt: string; title: string; desc: string }) {
  const { data, isSuccess } = usePrompt(prompt);
  return (
    <div className="set-field" data-prompt={prompt}>
      <div className="set-field-label">{title}</div>
      <div className="set-field-desc">{desc}</div>
      {isSuccess && data ? (
        <LoadedPrompt prompt={prompt} initial={data.content || ""} initialEnabled={data.enabled !== false} />
      ) : (
        <textarea className="set-textarea" rows={12} spellCheck={false} defaultValue="loading…" disabled />
      )}
    </div>
  );
}

function LoadedPrompt({ prompt, initial, initialEnabled }: { prompt: string; initial: string; initialEnabled: boolean }) {
  const toast = useToast();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const orig = useRef(initial);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saved, setSaved] = useState(false);
  const flash = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showToggle = prompt !== "fill";

  const flashSaved = () => {
    setSaved(true);
    clearTimeout(flash.current);
    flash.current = setTimeout(() => setSaved(false), 1500);
  };

  const save = async (nextEnabled: boolean) => {
    const content = taRef.current?.value ?? "";
    try {
      await putPrompt(prompt, { content, enabled: showToggle ? nextEnabled : undefined });
      orig.current = content;
      flashSaved();
    } catch (e) {
      toast(`save failed: ${(e as Error).message}`);
    }
  };

  const onBlur = () => {
    if ((taRef.current?.value ?? "") !== orig.current) void save(enabled);
  };

  const reset = async () => {
    try {
      const d = await resetPrompt(prompt);
      if (taRef.current) taRef.current.value = d.content || "";
      orig.current = d.content || "";
      setEnabled(d.enabled !== false);
      flashSaved();
      toast("reset to default");
    } catch (e) {
      toast(`reset failed: ${(e as Error).message}`);
    }
  };

  return (
    <>
      <textarea ref={taRef} className="set-textarea" rows={12} spellCheck={false} defaultValue={initial} onBlur={onBlur} />
      <div className="set-field-foot">
        <span className={"set-saved" + (saved ? " show" : "")}>saved ✓</span>
        {showToggle ? (
          <label className="set-toggle">
            <input
              type="checkbox"
              className="pl-enabled"
              checked={enabled}
              onChange={(e) => {
                setEnabled(e.target.checked);
                void save(e.target.checked);
              }}
            />{" "}
            run this stage
          </label>
        ) : null}
        <button className="btn pl-reset" onClick={reset}>
          Reset to default
        </button>
      </div>
    </>
  );
}
