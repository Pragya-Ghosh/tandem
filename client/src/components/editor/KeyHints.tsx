import type { Tab } from "@/types/tandem";
import { ConnectionStatus } from "./ConnectionStatus";
import { Key } from "@/components/ui";

interface KeyHintsProps {
  tab: Tab;
  connected: boolean;
}

/* Keybinding hints drawn on the bottom border of the parent Box. */
export function KeyHints({ tab, connected }: KeyHintsProps) {
  return (
    <div className="absolute right-4 -bottom-[0.7em] left-4 flex leading-none">
      <span className="bg-page flex flex-wrap items-center gap-x-6 px-2 font-mono text-xs tracking-tight">
        {tab === "general" && <Key keyName="F4" label="Open editor" />}
        <Key keyName="F2" label="Next" />
        {tab === "editor" && (
          <>
            <Key keyName="Esc" label="Leave line(s)" />
            <Key keyName="Ctrl+A" label="Select all" />
            <Key keyName="Shift+Click" label="Select lines" />
            <Key keyName="Alt" label="View line versions" />
          </>
        )}
        <span className="whitespace-nowrap ml-2">
          <span className="fg-dim">[</span>
          <ConnectionStatus connected={connected} labels={{ on: "Connected", off: "Offline" }} />
          <span className="fg-dim">]</span>
        </span>
      </span>
    </div>
  );
}