import { useEffect, useRef, useState } from "react";
import type { Line } from "@/types/tandem";

export interface ActivityLog {
  id: string;
  index: number;
  version: number;
  timeString: string;
  timestamp: number;
}

const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const toLog = (line: Line, timestamp: number, timeString = formatTime(timestamp)): ActivityLog => ({
  id: line.id,
  index: line.index,
  version: line.version,
  timestamp,
  timeString,
});

function syncWithLines(items: ActivityLog[], live: Map<string, Line>): ActivityLog[] {
  let changed = false;
  const synced: ActivityLog[] = [];

  for (const item of items) {
    const line = live.get(item.id);
    if (!line) {
      changed = true; 
      continue;
    }
    if (line.index !== item.index || line.version !== item.version) {
      changed = true;
      synced.push({ ...item, index: line.index, version: line.version });
    } else {
      synced.push(item);
    }
  }

  return changed ? synced : items;
}

export function useRecentActivity(lines: Line[] | undefined, limit = 5): ActivityLog[] {
  const [activities, setActivities] = useState<ActivityLog[]>([]);

  const prevLinesRef = useRef<Map<string, Line>>(new Map());
  const hasBaselineRef = useRef(false);
  const clockRef = useRef(0);

  useEffect(() => {
    const safeLines = lines ?? [];
    const live = new Map<string, Line>(safeLines.map((l): [string, Line] => [l.id, l]));

    if (safeLines.length === 0) {
      if (hasBaselineRef.current) return;

      prevLinesRef.current = live;
      hasBaselineRef.current = false;
      setActivities((prev) => (prev.length > 0 ? [] : prev));
      return;
    }

    // 1. Baseline: the document as first delivered.
    if (!hasBaselineRef.current) {
      hasBaselineRef.current = true;
      prevLinesRef.current = live;
      
      const now = Date.now();
      clockRef.current = now;

      // Stagger baseline items backwards slightly in time so they sort correctly
      const sortedBaseline = safeLines
        .filter((l) => l.version > 1)
        .sort((a, b) => b.version - a.version)
        .slice(0, limit);

      setActivities(
        sortedBaseline.map((l, idx) => {
          const ts = now - (sortedBaseline.length - idx) * 1000;
          return toLog(l, ts, formatTime(ts));
        })
      );
      return;
    }

    // 2. Find lines whose text changed, and lines that are new.
    const prevMap = prevLinesRef.current;
    const edited: Line[] = [];
    for (const line of safeLines) {
      const before = prevMap.get(line.id);
      if (!before || before.content !== line.content) edited.push(line);
    }
    prevLinesRef.current = live;

    // 3. Nothing was edited: keep existing entries accurate.
    if (edited.length === 0) {
      setActivities((prev) => {
        const synced = syncWithLines(prev, live);
        const trimmed = synced.length > limit ? synced.slice(0, limit) : synced;
        return trimmed === prev ? prev : trimmed;
      });
      return;
    }

    // 4. Log each edited line with its own unique, increasing timestamp.
    const newLogs = edited.map((line) => {
      clockRef.current = Math.max(clockRef.current + 1, Date.now());
      return toLog(line, clockRef.current);
    });

    // 5. Merge, sort by strict timestamp, and slice to limit.
    setActivities((prev) => {
      const editedIds = new Set(newLogs.map((l) => l.id));
      const remaining = syncWithLines(
        prev.filter((item) => !editedIds.has(item.id)),
        live
      );
      
      return [...newLogs, ...remaining].sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
    });
  }, [lines, limit]);

  return activities;
}