import { useEffect, useRef } from "react";

type Bindings = Partial<Record<string, () => void>>;

/**
 * Global key bindings for the terminal UI.
 * - Ignored while typing in an <input>, except Escape which blurs it.
 * - Bound keys have their default behaviour prevented (e.g. Tab).
 */
export function useHotkeys(bindings: Bindings): void {
  const ref = useRef(bindings);
  ref.current = bindings;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;

      if (target?.tagName === "INPUT") {
        if (e.key === "Escape") target.blur();
        return;
      }

      const handler = ref.current[e.key];
      if (handler) {
        e.preventDefault();
        handler();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}