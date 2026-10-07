import type { ReactNode } from "react";

interface BoxProps {
  /** Rendered as |Title| sitting on the top border. */
  title?: string;
  className?: string;
  children: ReactNode;
}

/** A 1px bordered panel with an optional title drawn on its top border. */
export function Box({ title, className = "", children }: BoxProps) {
  return (
    <section className={`relative border border-fg ${className}`}>
      {title && (
        <span className="absolute top-[-0.7em] left-1/2 -translate-x-1/2 bg-page px-1 leading-none whitespace-nowrap">
          <span className="fg-dim">|</span>
          <span className="fg font-bold">{title}</span>
          <span className="fg-dim">|</span>
        </span>
      )}
      {children}
    </section>
  );
}