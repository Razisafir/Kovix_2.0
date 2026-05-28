import { useState, useCallback } from "react";
import { TerminalOutput } from "./TerminalOutput";
import type { LogEntry } from "./TerminalOutput";

/* ─────────────────────── types ─────────────────────── */

interface AttachedFile {
  path: string;
  id: string;
}

interface AgentState {
  goal: string;
  status: "idle" | "working" | "paused" | "stopped" | "error";
  progress: number;
  tasksCompleted: number;
  totalTasks: number;
  elapsedTime: string;
  autoMode: boolean;
  thinking: string[];
  attachedFiles: AttachedFile[];
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
  inf: "#6366f1",
};

/* ─────────────────────── demo data ─────────────────────── */

const DEMO_STATE: AgentState = {
  goal: "build saas dashboard with auth, billing, analytics",
  status: "working",
  progress: 34,
  tasksCompleted: 4,
  totalTasks: 12,
  elapsedTime: "02:14:00",
  autoMode: true,
  thinking: [
    "analyzing authentication requirements",
    "considering JWT vs session-based approach",
    "selected: JWT with 15min expiry (matches memory pattern)",
  ],
  attachedFiles: [
    { path: "src/components/LoginForm.tsx", id: "1" },
    { path: "src/types/auth.ts", id: "2" },
  ],
  logs: [
    { timestamp: "14:32:05", level: "INF", message: "task plan generated: 12 tasks", source: "planner" },
    { timestamp: "14:32:08", level: "OK", message: "initialized project structure", source: "init" },
    { timestamp: "14:32:12", level: "WRK", message: "building LoginForm component", source: "ui-agent" },
    { timestamp: "14:33:01", level: "OK", message: "LoginForm.tsx written to disk", source: "fs" },
    { timestamp: "14:33:15", level: "WRN", message: "no validation schema found, inferring from types", source: "codegen" },
    { timestamp: "14:34:22", level: "OK", message: "auth types defined", source: "types" },
    { timestamp: "14:35:00", level: "WRK", message: "implementing JWT middleware", source: "code-agent" },
    { timestamp: "14:36:10", level: "INF", message: "checkpoint saved (auto)", source: "checkpoint" },
  ],
};

/* ─────────────────────── sub-components ─────────────────────── */

function StatusBar({ state }: { state: AgentState }) {
  const statusColor =
    state.status === "working" ? C.wrn : state.status === "error" ? C.err : C.ok;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "24px",
        padding: "6px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
        fontSize: "10px",
        color: C.t3,
      }}
    >
      <span>
        STATUS:{" "}
        <span style={{ color: statusColor, textTransform: "uppercase" }}>
          {state.status}
        </span>
      </span>
      <span>
        PROGRESS:{" "}
        <span style={{ color: C.t2 }}>{state.progress}%</span>
      </span>
      <span>
        TASKS:{" "}
        <span style={{ color: C.t2 }}>
          {state.tasksCompleted}/{state.totalTasks}
        </span>
      </span>
      <span>
        TIME:{" "}
        <span style={{ color: C.t2 }}>{state.elapsedTime}</span>
      </span>
    </div>
  );
}

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

function FileChip({
  file,
  onRemove,
}: {
  file: AttachedFile;
  onRemove: (id: string) => void;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "10px",
        fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
        color: C.t3,
        backgroundColor: C.s2,
        border: "1px solid rgba(255,255,255,0.04)",
        borderRadius: "2px",
        padding: "2px 6px",
      }}
    >
      {file.path}
      <span
        onClick={() => onRemove(file.id)}
        style={{
          cursor: "pointer",
          color: C.t4,
          fontSize: "10px",
          lineHeight: 1,
        }}
        onMouseEnter={(e) => {
          (e.target as HTMLElement).style.color = C.err;
        }}
        onMouseLeave={(e) => {
          (e.target as HTMLElement).style.color = C.t4;
        }}
      >
        [×]
      </span>
    </span>
  );
}

/* ─────────────────────── main component ─────────────────────── */

function AgentPanel() {
  const [state, setState] = useState<AgentState>(DEMO_STATE);
  const [thinkingOpen, setThinkingOpen] = useState(true);
  const [fileInput, setFileInput] = useState("");

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

  const handleRemoveFile = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      attachedFiles: prev.attachedFiles.filter((f) => f.id !== id),
    }));
  }, []);

  const handleFileInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && fileInput.trim()) {
        const path = fileInput.trim().replace(/^@/, "");
        setState((prev) => ({
          ...prev,
          attachedFiles: [
            ...prev.attachedFiles,
            { path, id: Math.random().toString(36).slice(2, 8) },
          ],
        }));
        setFileInput("");
      }
    },
    [fileInput]
  );

  const toggleAuto = useCallback(() => {
    setState((prev) => ({ ...prev, autoMode: !prev.autoMode }));
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
      {/* ── GOAL ── */}
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          fontSize: "12px",
          fontWeight: 600,
          color: C.t1,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        title={state.goal}
      >
        GOAL: {state.goal}
      </div>

      {/* ── STATUS BAR ── */}
      <StatusBar state={state} />

      {/* ── CONTROLS ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "6px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <ControlButton label="PAUSE" />
        <ControlButton label="STOP" />
        <ControlButton label="CHECKPOINT" />
        <ControlButton label="LOG" />
        <AutoToggle enabled={state.autoMode} onToggle={toggleAuto} />
      </div>

      {/* ── TERMINAL OUTPUT ── */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <TerminalOutput
          logs={state.logs}
          onCommand={handleCommand}
          showInput
        />
      </div>

      {/* ── THINKING ── */}
      <div
        style={{
          borderTop: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        {/* thinking header */}
        <button
          onClick={() => setThinkingOpen(!thinkingOpen)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            width: "100%",
            padding: "4px 12px",
            backgroundColor: C.s1,
            border: "none",
            borderBottom: thinkingOpen ? "1px solid rgba(255,255,255,0.04)" : "none",
            cursor: "pointer",
            fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
            fontSize: "10px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: C.t3,
            textAlign: "left",
          }}
        >
          <span style={{ color: C.t4 }}>{thinkingOpen ? "▼" : "▶"}</span>
          THINKING
        </button>

        {thinkingOpen && (
          <div
            style={{
              backgroundColor: C.s2,
              padding: "6px 12px",
              maxHeight: "100px",
              overflow: "auto",
              scrollbarWidth: "thin",
              scrollbarColor: `${C.s3} transparent`,
            }}
          >
            {state.thinking.map((line, i) => (
              <div
                key={i}
                style={{
                  fontSize: "10px",
                  color: C.t3,
                  fontFamily: 'inherit',
                  lineHeight: "16px",
                }}
              >
                <span style={{ color: C.accent, marginRight: "6px" }}>&gt;</span>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── ATTACHED FILES ── */}
      <div
        style={{
          borderTop: "1px solid rgba(255,255,255,0.04)",
          padding: "6px 12px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: "10px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: C.t3,
            fontFamily: 'inherit',
          }}
        >
          ATTACHED:
        </span>
        {state.attachedFiles.map((file) => (
          <FileChip key={file.id} file={file} onRemove={handleRemoveFile} />
        ))}
        <input
          type="text"
          value={fileInput}
          onChange={(e) => setFileInput(e.target.value)}
          onKeyDown={handleFileInputKeyDown}
          placeholder="@filename"
          style={{
            background: "transparent",
            border: "none",
            borderBottom: `1px solid ${C.t4}`,
            outline: "none",
            fontSize: "12px",
            color: C.t1,
            fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
            width: "140px",
            padding: "2px 0",
            caretColor: C.accent,
          }}
          spellCheck={false}
          autoComplete="off"
        />
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

export default AgentPanel;
