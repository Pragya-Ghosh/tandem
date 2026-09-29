import { APP_VERSION, DOCUMENT_PATH, TABS } from "@/lib/config";
import type { Tab } from "@/types/tandem";
import { Box } from "@/components/ui";

interface EditorHeaderProps {
  activeTab: Tab;
  onSelectTab: (tab: Tab) => void;
}

export function EditorHeader({ activeTab, onSelectTab }: EditorHeaderProps) {
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
      <span className="fg hidden italic sm:block">{DOCUMENT_PATH}</span>
    </Box>
  );
}