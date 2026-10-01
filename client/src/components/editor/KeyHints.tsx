import type { Tab } from "@/types/tandem";
import { ConnectionStatus } from "./ConnectionStatus";
import { Key } from "@/components/ui";

interface KeyHintsProps {
  tab: Tab;
  connected: boolean;
}

/** Keybinding hints drawn on the bottom border of the parent Box. */
export function KeyHints({ tab, connected }: KeyHintsProps) {
  return (
    <div className="absolute right-4 -bottom-[0.7em] left-4 flex leading-none">
      <span className="bg-page flex flex-wrap gap-x-3 px-1">
        {/* Changed Enter -> F4, and Tab -> F2 */}
        {tab === "general" && <Key keyName="F4" label="Open editor" />}
        <Key keyName="F2" label="Next" />
        {tab === "editor" && <Key keyName="Esc" label="Leave line" />}
        <span className="whitespace-nowrap">
          <span className="fg-dim">[</span>
          <ConnectionStatus connected={connected} labels={{ on: "Connected", off: "Offline" }} />
          <span className="fg-dim">]</span>
        </span>
      </span>
    </div>
  );
}