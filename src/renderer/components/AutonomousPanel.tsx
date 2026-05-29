import { useState, useCallback, useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
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
  const [state, setState] = useState<AutonomousState>({
    goal: "",
    progress: 0,
    tasksCompleted: 0,
    totalTasks: 0,
    eta: "--:--:--",
    autoMode: false,
    tasks: [],
    resources: { cpu: 0, memUsed: 0, memTotal: 0, diskSpeed: "0MB/s" },
    logs: [],
  });
  const [showLog, setShowLog] = useState(false);

  /* ── sync with Rust backend ── */
  useEffect(() => {
    let cancelled = false;
    const unlisteners: UnlistenFn[] = [];

    const fetchStatus = async () => {
      try {
        const status = await invoke<{
          current_goal?: string;
          progress_percent: number;
          tasks_completed: number;
          queue_size: number;
          enabled: boolean;
          resource_cpu: number;
          resource_memory: number;
        }>("get_autonomous_status");

        if (cancelled) return;

        setState((prev) => ({
          ...prev,
          goal: status.current_goal ?? "",
          progress: Math.round(status.progress_percent),
          tasksCompleted: status.tasks_completed,
          totalTasks: status.queue_size,
          autoMode: status.enabled,
          resources: {
            cpu: Math.round(status.resource_cpu),
            memUsed: Math.round(status.resource_memory),
            memTotal: 2048,
            diskSpeed: "0MB/s",
          },
        }));
      } catch {
        // Backend may not have autonomous manager initialized yet
      }
    };

    const fetchLogs = async () => {
      try {
        const logs = await invoke<
          { timestamp: number; level: string; message: string; source: string }[]
        >("get_agent_log", { lines: 100 });

        if (cancelled) return;

        const mapped: LogEntry[] = logs.map((l) => ({
          timestamp: new Date(l.timestamp * 1000).toTimeString().slice(0, 8),
          level: l.level === "error" ? "ERR" : l.level === "warn" ? "WRK" : l.level === "ok" ? "OK" : "INF",
          message: l.message,
          source: l.source,
        }));

        setState((prev) => ({ ...prev, logs: mapped }));
      } catch {
        // Backend may not have logs yet
      }
    };

    const setupListeners = async () => {
      const events = [
        "autonomous:started",
        "autonomous:paused",
        "autonomous:resumed",
        "autonomous:checkpoint",
        "autonomous:completed",
        "autonomous:error",
      ];

      for (const eventName of events) {
        const unlisten = await listen(eventName, () => {
          if (cancelled) return;
          void fetchStatus();
          void fetchLogs();
        });
        unlisteners.push(unlisten);
      }

      // Initial fetch
      await fetchStatus();
      await fetchLogs();
    };

    void setupListeners();

    return () => {
      cancelled = true;
      unlisteners.forEach((u) => u());
    };
  }, []);

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
