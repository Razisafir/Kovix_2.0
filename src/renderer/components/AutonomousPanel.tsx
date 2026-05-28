import { useState, useCallback } from "react";
import { TerminalOutput } from "./TerminalOutput";
import type { LogEntry } from "./TerminalOutput";

/* ─────────────────────── types ─────────────────────── */

type TaskStatus = "OK" | "WRK" | "ERR" | "PND";

interface Task {
  id: string;
  number: number;
  status: TaskStatus;
  description: string;
  time: string;
  agent: string;
}

interface ResourceMetrics {
  cpu: number;
  memUsed: number;
  memTotal: number;
  diskSpeed: string;
}

interface AutonomousState {
  goal: string;
  progress: number;
  tasksCompleted: number;
  totalTasks: number;
  eta: string;
  autoMode: boolean;
  tasks: Task[];
  resources: ResourceMetrics;
  logs: LogEntry[];
}

/* ─────────────────────── colors ─────────────────────── */

const C = {
  base: "#0c0c10",
  s1: "#12121a",
  s2: "#1a1a24",
  s3: "#22222e",
  accent: "#6366f1",
  t1: "#e8e8ec",
  t2: "#94949c",
  t3: "#6b6b73",
  t4: "#4a4a52",
  ok: "#22c55e",
  wrn: "#f59e0b",
  err: "#ef4444",
  block: "#6366f1",
  track: "#1a1a24",
};

const statusColor: Record<TaskStatus, string> = {
  OK: C.ok,
  WRK: C.wrn,
  ERR: C.err,
  PND: C.t4,
};

/* ─────────────────────── demo data ─────────────────────── */

const DEMO_STATE: AutonomousState = {
  goal: "build saas dashboard with auth, billing, analytics",
  progress: 34,
  tasksCompleted: 4,
  totalTasks: 12,
  eta: "04:00:00",
  autoMode: true,
  tasks: [
    { id: "1", number: 1, status: "OK", description: "set up project structure", time: "00:15", agent: "code" },
    { id: "2", number: 2, status: "OK", description: "initialize database schema", time: "00:22", agent: "code" },
    { id: "3", number: 3, status: "WRK", description: "build dashboard layout component", time: "00:32", agent: "ui" },
    { id: "4", number: 4, status: "PND", description: "add analytics charts", time: "--", agent: "--" },
    { id: "5", number: 5, status: "PND", description: "implement billing page", time: "--", agent: "--" },
    { id: "6", number: 6, status: "PND", description: "set up stripe integration", time: "--", agent: "--" },
    { id: "7", number: 7, status: "PND", description: "add subscription management", time: "--", agent: "--" },
    { id: "8", number: 8, status: "PND", description: "implement auth guards", time: "--", agent: "--" },
    { id: "9", number: 9, status: "PND", description: "add audit logging", time: "--", agent: "--" },
    { id: "10", number: 10, status: "PND", description: "write integration tests", time: "--", agent: "--" },
    { id: "11", number: 11, status: "PND", description: "deploy to staging", time: "--", agent: "--" },
    { id: "12", number: 12, status: "PND", description: "run e2e verification", time: "--", agent: "--" },
  ],
  resources: {
    cpu: 23,
    memUsed: 456,
    memTotal: 2048,
    diskSpeed: "12MB/s",
  },
  logs: [
    { timestamp: "12:00:05", level: "INF", message: "autonomous mode initialized", source: "orchestrator" },
    { timestamp: "12:00:08", level: "INF", message: "goal: build saas dashboard with auth, billing, analytics", source: "planner" },
    { timestamp: "12:00:12", level: "INF", message: "task plan: 12 tasks, ETA 04:00:00", source: "planner" },
    { timestamp: "12:00:15", level: "OK", message: "task 1/12: set up project structure -- completed (00:15)", source: "code" },
    { timestamp: "12:00:32", level: "OK", message: "task 2/12: initialize database schema -- completed (00:22)", source: "code" },
    { timestamp: "12:01:05", level: "WRK", message: "task 3/12: build dashboard layout component", source: "ui" },
    { timestamp: "12:01:12", level: "INF", message: "checkpoint saved (auto)", source: "checkpoint" },
  ],
};

/* ─────────────────────── sub-components ─────────────────────── */

function ControlButton({
  label,
  onClick,
}: {
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: "10px",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        backgroundColor: C.s2,
        color: C.t2,
        border: "1px solid rgba(255,255,255,0.04)",
        borderRadius: "2px",
        padding: "3px 8px",
        cursor: "pointer",
        fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
        transition: "background-color 0.1s",
      }}
      onMouseEnter={(e) => {
        (e.target as HTMLElement).style.backgroundColor = C.s3;
      }}
      onMouseLeave={(e) => {
        (e.target as HTMLElement).style.backgroundColor = C.s2;
      }}
    >
      {label}
    </button>
  );
}

function AutoToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      style={{
        fontSize: "10px",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        backgroundColor: enabled ? C.s2 : C.base,
        color: enabled ? C.ok : C.t4,
        border: `1px solid ${enabled ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.04)"}`,
        borderRadius: "2px",
        padding: "3px 8px",
        cursor: "pointer",
        fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
        marginLeft: "auto",
      }}
    >
      AUTO:{enabled ? "ON" : "OFF"}
    </button>
  );
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const label = `[${status}]`;
  return (
    <span
      style={{
        fontSize: "9px",
        fontWeight: 700,
        letterSpacing: "0.04em",
        color: statusColor[status],
        fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
        minWidth: "28px",
        display: "inline-block",
      }}
    >
      {label}
    </span>
  );
}

function ASCIIProgressBar({ percent }: { percent: number }) {
  const total = 20;
  const filled = Math.round((percent / 100) * total);
  const empty = total - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);

  return (
    <span
      style={{
        fontSize: "10px",
        fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
        color: C.t2,
        whiteSpace: "nowrap",
      }}
    >
      {bar}  {percent}%
    </span>
  );
}

/* ─────────────────────── main component ─────────────────────── */

function AutonomousPanel() {
  const [state, setState] = useState<AutonomousState>(DEMO_STATE);
  const [showLog, setShowLog] = useState(false);

  const toggleAuto = useCallback(() => {
    setState((prev) => ({ ...prev, autoMode: !prev.autoMode }));
  }, []);

  const handleCommand = useCallback((cmd: string) => {
    setState((prev) => ({
      ...prev,
      logs: [
        ...prev.logs,
        {
          timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }),
          level: "INF",
          message: `> ${cmd}`,
          source: "user",
        },
      ],
    }));
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: C.base,
        border: "1px solid rgba(255,255,255,0.04)",
        fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
        overflow: "hidden",
      }}
    >
      {/* ── HEADER ── */}
      <div
        style={{
          padding: "8px 12px",
          fontSize: "10px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: C.t3,
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        AUTONOMOUS MODE
      </div>

      {/* ── GOAL ── */}
      <div
        style={{
          padding: "6px 12px",
          fontSize: "12px",
          fontWeight: 600,
          color: C.t1,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}
        title={state.goal}
      >
        GOAL: {state.goal}
      </div>

      {/* ── PROGRESS BAR + STATS ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "24px",
          padding: "6px 12px",
          fontSize: "10px",
          color: C.t3,
          fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          flexWrap: "wrap",
        }}
      >
        <span>
          PROGRESS:{" "}
          <ASCIIProgressBar percent={state.progress} />
        </span>
        <span>
          TASKS:{" "}
          <span style={{ color: C.t2 }}>
            {state.tasksCompleted}/{state.totalTasks}
          </span>
        </span>
        <span>
          ETA:{" "}
          <span style={{ color: C.t2 }}>{state.eta}</span>
        </span>
      </div>

      {/* ── TASK TABLE HEADER ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "24px 36px 1fr 48px 60px",
          gap: "8px",
          padding: "4px 12px",
          fontSize: "10px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: C.t4,
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <span>#</span>
        <span>STATUS</span>
        <span>TASK</span>
        <span>TIME</span>
        <span>AGENT</span>
      </div>

      {/* ── TASK TABLE BODY ── */}
      <div
        style={{
          maxHeight: "160px",
          overflow: "auto",
          scrollbarWidth: "thin",
          scrollbarColor: `${C.s3} transparent`,
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        {state.tasks.map((task) => (
          <div
            key={task.id}
            style={{
              display: "grid",
              gridTemplateColumns: "24px 36px 1fr 48px 60px",
              gap: "8px",
              padding: "3px 12px",
              fontSize: "11px",
              fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
              color: C.t2,
              borderBottom: "1px solid rgba(255,255,255,0.02)",
              alignItems: "center",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = C.s1;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
            }}
          >
            <span style={{ color: C.t3, fontSize: "10px" }}>{task.number}</span>
            <StatusBadge status={task.status} />
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {task.description}
            </span>
            <span style={{ color: C.t3, fontSize: "10px" }}>{task.time}</span>
            <span style={{ color: task.agent === "--" ? C.t4 : C.t2, fontSize: "10px" }}>
              {task.agent}
            </span>
          </div>
        ))}
      </div>

      {/* ── CONTROLS ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "6px 12px",
          borderBottom: showLog ? "1px solid rgba(255,255,255,0.04)" : "none",
        }}
      >
        <ControlButton label="PAUSE" />
        <ControlButton label="STOP" />
        <ControlButton label="FORCE-CHECKPOINT" />
        <ControlButton label="VIEW-LOG" onClick={() => setShowLog(!showLog)} />
        <AutoToggle enabled={state.autoMode} onToggle={toggleAuto} />
      </div>

      {/* ── TERMINAL OUTPUT (collapsible) ── */}
      {showLog && (
        <div style={{ height: "140px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <TerminalOutput
            logs={state.logs}
            onCommand={handleCommand}
            showInput
          />
        </div>
      )}

      {/* ── RESOURCES ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "20px",
          padding: "6px 12px",
          fontSize: "10px",
          color: C.t3,
          fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
          marginTop: "auto",
        }}
      >
        <span>RESOURCE:</span>
        <span>
          CPU:{" "}
          <span style={{ color: C.t2 }}>{state.resources.cpu}%</span>
        </span>
        <span>
          MEM:{" "}
          <span style={{ color: C.t2 }}>
            {state.resources.memUsed}MB/{state.resources.memTotal}GB
          </span>
        </span>
        <span>
          DISK:{" "}
          <span style={{ color: C.t2 }}>{state.resources.diskSpeed}</span>
        </span>
      </div>

      {/* scrollbar styles */}
      <style>{`
        div::-webkit-scrollbar { width: 4px; height: 4px; }
        div::-webkit-scrollbar-track { background: transparent; }
        div::-webkit-scrollbar-thumb { background: ${C.s3}; border-radius: 2px; }
        div::-webkit-scrollbar-thumb:hover { background: #3a3a4f; }
      `}</style>
    </div>
  );
}

export default AutonomousPanel;
