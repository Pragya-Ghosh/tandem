interface ConnectionStatusProps {
  connected: boolean;
  labels?: { on: string; off: string };
}

export function ConnectionStatus({
  connected,
  labels = { on: "connected", off: "disconnected" },
}: ConnectionStatusProps) {
  return (
    <span className={connected ? "fg-ok" : "fg-err"}>
      {connected ? labels.on : labels.off}
    </span>
  );
}