import type { ReactNode } from "react";

interface FieldProps {
  name: string;
  children: ReactNode;
}

/** A `Name: value` row with a teal label. */
export function Field({ name, children }: FieldProps) {
  return (
    <div>
      <span className="fg-teal">{name}:</span> <span className="fg">{children}</span>
    </div>
  );
}