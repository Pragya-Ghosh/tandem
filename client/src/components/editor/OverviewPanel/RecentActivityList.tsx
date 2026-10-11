import { Box } from "@/components/ui";
import type { ActivityLog } from "@/hooks/useRecentActivity";

export function RecentActivityList({ activities }: { activities: ActivityLog[] }) {
  return (
    <Box title="Recent Activity" className="h-full">
      <div style={{ padding: "0.75rem 1.25rem" }}>
        {activities.length === 0 ? (
          <p className="fg-dim">No recent activity…</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            <div className="flex w-full justify-between border-b border-zinc-700/50 pb-1 font-bold text-xs fg-dim mb-2">
              <span>Target Line</span>
              <span>Version & Timestamp</span>
            </div>
            {activities.map((activity) => (
              <div key={activity.id} className="flex w-full justify-between items-center text-sm">
                <span className="font-mono">Line {activity.index}</span>
                <span className="font-mono fg-ok">
                  v{activity.version} ({activity.timeString})
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Box>
  );
}