import { TabbedEditor, type EditorTab } from "./TabbedEditor";
import { useWorkbenchStore } from "../../lib/workbenchStore";

interface EditorWorkbenchProps {
  arrangement: React.ReactNode;
  patternEditor: React.ReactNode;
  pianoRoll: React.ReactNode;
  mixer: React.ReactNode;
  effects: React.ReactNode;
  prompt: React.ReactNode;
  lua: React.ReactNode;
  waveform: React.ReactNode;
}

export function EditorWorkbench({ arrangement, patternEditor, pianoRoll, mixer, effects, prompt, lua, waveform }: EditorWorkbenchProps) {
  const { center, setActiveCenterTab, closeCenterTab } = useWorkbenchStore();

  const tabContent: Record<string, React.ReactNode> = {
    arrangement,
    pattern: patternEditor,
    piano: pianoRoll,
    mixer,
    effects,
    prompt,
    lua,
    waveform,
  };

  const tabs: EditorTab[] = center.tabs
    .filter((id) => tabContent[id] !== undefined)
    .map((id) => ({
      id,
      label: LABELS[id] ?? id,
      icon: ICONS[id],
      content: tabContent[id],
      closable: id !== "arrangement",
    }));

  return (
    <TabbedEditor
      tabs={tabs}
      defaultTab={center.activeTab}
      onTabChange={setActiveCenterTab}
      onTabClose={closeCenterTab}
    />
  );
}

const LABELS: Record<string, string> = {
  arrangement: "Arrangement",
  pattern: "Pattern Editor",
  piano: "Piano Roll",
  mixer: "Mixer",
  effects: "Audio Graph",
  prompt: "Prompt",
  lua: "Lua",
  waveform: "Waveform",
};

const ICONS: Record<string, string> = {
  arrangement: "📐",
  pattern: "🎹",
  piano: "🎼",
  mixer: "🎛️",
  effects: "🔌",
  prompt: "✨",
  lua: "📜",
  waveform: "〰️",
};
