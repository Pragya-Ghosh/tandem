import { useMemo } from "react";
import type { Line } from "@/types/tandem";

export interface ActivityLog {
  id: string;
  index: number;
  version: number;
  timeString: string;
  timestamp: number;
}

const formatTime = (ts?: number) => {
  // Catch undefined, null, 0, or NaN
  if (!ts || isNaN(ts) || ts <= 0) return "earlier";
  
  const date = new Date(ts);
  
  // Catch any unparsable dates
  if (isNaN(date.getTime())) return "earlier";
  
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

export function useRecentActivity(lines: Line[] | undefined, limit = 5): ActivityLog[] {
  return useMemo(() => {
    if (!lines || lines.length === 0) return [];

    const sortedLines = [...lines].sort((a, b) => {
      // Force strict Number casting in case JSON.parse handed us strings
      const timeA = Number(a.timestamp) || 0;
      const timeB = Number(b.timestamp) || 0;
      
      if (timeB === timeA) return (b.version || 0) - (a.version || 0);
      return timeB - timeA;
    });

    return sortedLines.slice(0, limit).map(line => {
      const rawTs = Number(line.timestamp);
      const safeTs = isNaN(rawTs) ? 0 : rawTs;
      
      return {
        id: line.id,
        index: line.index,
        version: line.version,
        timestamp: safeTs,
        timeString: formatTime(safeTs),
      };
    });
  }, [lines, limit]);
}