interface KeyProps {
  keyName: string;
  label: string;
}

/** A `[Key→ Label]` hint. */
export function Key({ keyName, label }: KeyProps) {
  return (
    <span className="whitespace-nowrap">
      <span className="fg-dim">[</span>
      <span className="fg-gold">{keyName}</span>
      <span className="fg-dim">→ </span>
      <span className="fg">{label}</span>
      <span className="fg-dim">]</span>
    </span>
  );
}