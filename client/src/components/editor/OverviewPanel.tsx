import { DOCUMENT_NAME, WS_URL } from "@/lib/config";
import type { Line } from "@/types/tandem";
import { ConnectionStatus } from "./ConnectionStatus";
import { Box, Field } from "@/components/ui";
import { useRecentActivity, type ActivityLog } from "@/hooks/useRecentActivity";

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

const MASCOT_ART = `⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡟⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠁⣸⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⢥⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠛⠄⢠⣶⣒⠋⠉⠉⠉⠉⠉⠉⠑⠒⠒⠒⠢⠤⠤⢄⣀⣀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣰⣾
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠳⡀⢸⢠⣀⡀⠀⠀⠀⠀⠀⠑⠒⠲⠶⠤⣤⣀⣀⠀⠀⠐⠄⣀⡈⡉⠭⠵⣖⣲⣤⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣀⣀⣀⡀⡠⣿⣷⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⣞⡃⢸⠀⢹⣿⣿⣷⣶⣦⣤⣤⣀⣀⠀⠀⠀⠈⠉⠹⣷⠒⠉⣨⡤⠄⠀⠀⠀⠈⠁⣇⠀⠀⠀⠀⣀⣤⣤⣤⠞⠁⠀⠀⠈⠉⠉⠉⠛⠛⠛⠻⠿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣧⣧⣸⠀⢸⣿⣿⣿⣿⣿⣿⣿⣿⣿⡟⢿⣿⣿⣶⠆⣿⠀⠀⡇⠀⠀⠁⠀⠀⠀⢠⣿⣷⣤⠴⠞⣉⣤⡶⢶⢾⣿⣿⣟⣖⢲⡶⡄⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡄⢸⣿⣿⣿⣿⣿⣿⠿⣿⣯⣶⣿⣟⣯⣿⠀⣿⠀⠀⡇⠀⠀⠀⠀⠀⠀⢸⣿⣿⣿⣶⣾⣿⣿⣭⣛⣒⡚⠛⢋⣴⣫⣾⠁⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡉⠁⢀⡇⢸⣿⣿⣿⣿⣿⣿⣝⣻⠿⣿⣿⣿⣿⡇⠀⡏⠀⠀⡁⠀⠀⠀⠀⠀⣠⣾⠿⠛⠿⠿⢿⣿⣿⣿⣿⣿⣿⣿⢑⣿⠟⠁⠂⠀⡀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠟⢻⣿⡇⢸⣷⣿⣿⣿⣿⣿⣯⣿⣧⣿⣿⠟⣽⡇⠀⡇⠀⢸⠀⢀⣴⢆⣠⣾⣿⢓⣦⣤⣀⣀⠀⠀⠉⠉⠛⠛⠻⠿⠟⠑⠁⠀⢀⠞⠁⠀⠀⢠
⣿⣿⣿⣻⣿⣿⣿⣿⣿⠿⠛⠙⣿⣿⢿⡇⢸⣿⣿⣽⣋⢹⣿⣽⣿⣝⣻⣿⣿⣾⡇⠀⡇⢀⣼⠶⣹⣿⣿⣿⣿⣿⢸⣿⣿⣿⠛⠿⢿⣿⣷⣶⣶⣤⣤⢤⣀⡀⠰⠀⠀⠀⠀⠀⢸
⣿⡛⠛⠛⠻⣾⣿⣿⠀⠀⠀⠀⣿⣿⣿⣇⠻⣿⣭⣿⣿⣯⣿⣿⢿⣿⣿⣿⣿⣿⡇⢀⡗⠉⣼⣽⣿⠿⠛⠉⠀⢈⣿⠿⢿⣿⣿⣷⠶⠦⠤⣍⣉⣙⠛⣿⡟⡇⠀⠀⠀⠀⠀⠀⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣤⠀⠀⠀⢹⣛⡿⣿⠙⢦⣬⠈⠙⠛⠿⢾⣬⣟⣿⡏⣟⣿⡧⢺⡇⢀⣿⣿⡟⢦⣤⣤⣤⣾⢸⠀⠀⠀⠀⠉⠉⠓⠒⠦⠾⣧⣿⣹⣇⠃⠀⠀⠀⠀⠀⢰⣿
⢸⣿⣛⣛⢛⣿⣿⠟⣁⣤⣦⡀⠚⠿⠧⡽⠿⢛⣺⣟⣳⢦⣄⣀⠀⠉⠙⠛⠿⢿⣧⢸⠆⣴⣿⣿⡇⠀⢹⣿⣟⡿⢸⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣹⢹⠀⠀⠀⠀⠀⠀⣸⣿
⠀⠀⠀⠀⣠⣽⣶⣿⣿⣟⢿⣿⣶⢄⠀⢈⠙⠻⢿⣿⣿⣿⣿⣿⣥⣐⡒⠰⠤⠄⣀⡸⣿⣿⣿⣿⡇⢸⣿⣿⣿⡇⢸⣶⣤⣤⣀⣀⠀⠀⢠⢶⣤⣄⣀⡿⣸⠀⠀⠀⠀⠀⢀⣿⣿
⠀⠀⣦⣿⣿⡿⣝⣿⣿⣿⣻⡿⠟⠋⣷⣶⣦⣄⡀⠉⠛⠿⢿⣿⣿⣿⣿⣷⣶⣶⣄⣠⣸⣿⣿⣿⣇⣿⣿⣿⣿⡇⢻⠾⣿⣿⣷⣿⣿⣷⣾⢀⣶⣾⡍⢉⡇⠀⠀⠀⠀⠀⢸⣿⣿
⠀⠀⠈⠿⣎⠻⣮⣻⡿⠏⠀⣠⡾⣿⣿⢿⣯⣟⢟⡿⣷⣶⣦⠈⣛⠻⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡇⠊⡄⢠⣧⣽⡟⠛⣿⣿⡈⠛⠛⠋⢸⠇⠀⠀⠀⠀⢀⣾⣿⣿
⠀⠀⠀⠀⠉⢳⣌⠋⢀⣄⣐⠿⣿⣷⣯⣿⣾⣿⠽⢛⡿⢋⣥⣾⣿⣷⣦⡉⠂⠿⣻⠿⠿⣿⣿⣿⣿⣿⣽⢂⣿⡇⠃⠀⠈⠙⠛⠐⠿⠧⣶⠀⠀⠠⡴⢸⠀⠀⠀⠀⢀⡞⠉⠙⠛
⣦⣄⡀⠀⠀⠀⠈⠛⢶⣤⣉⠛⠳⢶⣿⣻⡶⢭⡿⠋⠀⠻⢿⣿⡿⣿⣿⣷⣿⣗⣤⣀⢐⣄⠀⠀⠀⠀⠉⠉⠉⡧⠀⠄⠀⠀⠀⠀⠀⠀⠀⠀⠑⠒⠆⡟⠀⠀⠀⢀⠎⠀⠀⠀⠀
⣿⣿⣿⣶⣤⣀⠀⠀⠀⠉⠛⠻⢦⣄⣀⠉⠛⠿⣶⣶⣿⡗⢀⣭⣿⣿⣽⣿⣿⣿⢟⣵⣿⠋⠀⠀⠀⠀⠀⠀⠀⢡⠀⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⠀⠀⢀⠞⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣶⣤⡀⠀⠀⠀⠈⠛⠿⣶⣤⣀⠉⠛⢿⣍⣻⢿⡽⢿⡵⢋⣴⣿⣏⣤⡿⠂⠀⠀⠀⠀⠀⢀⡸⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⠁⠀⢀⠎⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⣦⣄⠀⠀⠀⠀⠉⠻⣷⣦⣄⡉⠻⢯⡿⣋⣴⣿⣿⠽⠋⠁⠀⠀⣀⠀⢀⣀⣴⡿⠧⣌⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡸⠀⢠⠋⠀⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⣦⣀⠀⠀⠀⠈⠙⠻⢷⣦⣾⣿⠟⠋⠀⠀⠀⣠⡴⠊⠁⠘⠻⢏⢈⡅⠀⠀⠉⠛⠶⢤⣤⡀⠀⠀⠀⠀⠀⡇⢠⠋⠀⠀⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣦⣄⡀⠀⠀⠀⠈⠉⠀⠀⠀⠀⠀⠜⢹⠁⣦⡀⠀⠀⣠⣿⡿⠀⠀⠀⠀⠀⠀⠈⠉⠛⠲⠤⣤⣠⡿⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⣦⣀⠀⠀⠀⠀⠀⠀⠀⠀⠸⣦⣤⣤⡴⡿⣿⠏⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣶⣄⡀⠀⠀⠀⠀⠀⠈⠛⠛⠛⠋⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⣦⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣶⣤⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣦⣄⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀`;

// ----------------------------------------------------------------------------
// Sub-components
// ----------------------------------------------------------------------------

function DocumentStats({ lines, totalEdits, connected }: { lines: Line[]; totalEdits: number; connected: boolean }) {
  return (
    <Box title="Document" className="h-full">
      <div style={{ padding: "0.75rem 1.25rem" }} className="flex items-center justify-between gap-6">
        <div className="flex-1 min-w-0">
          <Field name="File">{DOCUMENT_NAME}</Field>
          <Field name="Lines">{lines.length}</Field>
          <Field name="Total edits">{totalEdits}</Field>
          <Field name="Server">{WS_URL}</Field>
          <Field name="Status">
            <ConnectionStatus connected={connected} />
          </Field>
        </div>
        <pre className="font-mono text-[9px] leading-[9px] fg-teal select-none shrink-0 hidden sm:block">
          {MASCOT_ART}
        </pre>
      </div>
    </Box>
  );
}

function RecentActivityList({ activities }: { activities: ActivityLog[] }) {
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

function LineVersionsList({ lines }: { lines: Line[] }) {
  return (
    <Box title="Line versions" className="w-full">
      <div style={{ padding: "0.75rem 1.25rem" }}>
        {lines.length === 0 ? (
          <p className="fg-dim">Waiting for the server…</p>
        ) : (
          <div className="max-h-[min(20rem,40vh)] overflow-y-auto overscroll-contain pr-2">
            <div className="bg-page sticky top-0 mb-1 flex w-full justify-between border-b border-zinc-700/50 pb-1 font-bold">
              <span>Line</span>
              <span>Version</span>
            </div>
            <div className="flex w-full flex-col gap-1.5">
              {lines.map((line, i) => (
                <div key={line.id} className="flex w-full justify-between">
                  <span className={i === 0 ? "fg-ok" : ""}>{line.index}</span>
                  <span className={i === 0 ? "fg-ok" : ""}>v{line.version}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Box>
  );
}

// ----------------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------------

interface OverviewPanelProps {
  lines: Line[];
  connected: boolean;
}

export function OverviewPanel({ lines, connected }: OverviewPanelProps) {
  const totalEdits = lines.reduce((sum, l) => sum + l.version, 0);
  const recentActivities = useRecentActivity(lines, 7);

  return (
    <div className="flex w-full flex-col items-center gap-2.5 pt-0 pb-2 text-center">
      {/* Header section */}
      <h1 className="pixel text-5xl sm:text-7xl leading-none">tandem.</h1>

      <div className="flex flex-col items-center w-fit mx-auto">
        <p className="mt-1 text-base sm:text-lg whitespace-nowrap">
          Made for developers who <span className="fg-gold italic">code in tandem.</span>
        </p>
      </div>

      
      <p className="fg-dim mb-10">
        [with <span className="fg-teal">♥</span> by{" "}
        <a href="https://github.com/Pragya-Ghosh/tandem" style={{ color: "inherit" }}>
          <span className="fg-teal">@Pragya-Ghosh</span>
        </a>
        ]
      </p>

      {/* Panels section */}
      <div className="flex w-8xl flex-col gap-10 text-left">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full items-stretch">
          <DocumentStats lines={lines} totalEdits={totalEdits} connected={connected} />
          <RecentActivityList activities={recentActivities} />
        </div>
        
        <LineVersionsList lines={lines} />
      </div>
    </div>
  );
}