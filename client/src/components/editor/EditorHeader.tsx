import { APP_VERSION, DOCUMENT_PATH, TABS } from "@/lib/config";
import type { Tab } from "@/types/tandem";
import { Box } from "@/components/ui";

export type SaveLabelTone = "dim" | "warn" | "ok" | "err";

export interface SaveLabel {
  text: string;
  tone: SaveLabelTone;
}

interface EditorHeaderProps {
  activeTab: Tab;
  onSelectTab: (tab: Tab) => void;
  /** The name of the file currently open */
  fileName?: string | null;
  /** Save status badge description */
  saveLabel?: SaveLabel | null;
}

export function EditorHeader({
  activeTab,
  onSelectTab,
  fileName,
  saveLabel,
}: EditorHeaderProps) {
  const toneClass = (tone: SaveLabelTone) => {
    switch (tone) {
      case "warn":
        return "text-amber-400";
      case "ok":
        return "text-teal-400";
      case "err":
        return "text-red-400";
      default:
        return "fg-dim";
    }
  };

  const displayPath = fileName ? `/workspace/tandem/${fileName}` : DOCUMENT_PATH;

  return (
    <Box title={APP_VERSION} className="flex items-center justify-between gap-4 px-3 py-2">
      <nav role="tablist" className="flex items-center">
        {TABS.map((tab, i) => (
          <span key={tab.id} className="flex items-center">
            {i > 0 && <span className="fg-dim mx-3">|</span>}
            <button
              role="tab"
              className="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => onSelectTab(tab.id)}
            >
              {tab.label}
            </button>
          </span>
        ))}
      </nav>

      <div className="hidden sm:flex items-center gap-4 text-sm font-mono">
        {saveLabel && (
          <span className={`italic ${toneClass(saveLabel.tone)}`}>
            {saveLabel.text}
          </span>
        )}
        <span className="fg italic">{displayPath}</span>
      </div>
    </Box>
  );
}