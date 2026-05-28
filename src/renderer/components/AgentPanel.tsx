import { useState, useEffect, useRef, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import {
  Play,
  Pause,
  Square,
  Loader2,
  Sparkles,
  ChevronRight,
  CheckCircle2,
  Circle,
  XCircle,
  AlertCircle,
  Clock,
  Zap,
  Bot,
  Target,
  FileCode,
  Terminal,
  CheckCheck,
} from "lucide-react";
import type {
  AgentSession,
  AgentTask,
  AgentOutputEvent,
} from "../types/agent";

// ─── Tauri Command Wrappers ─────────────────────────────────

const startAgent = async (goal: string): Promise<string> => {
  return await invoke("start_agent", { goal, projectPath: "." });
};

const pauseAgent = async (sessionId: string): Promise<void> => {
  await invoke("pause_agent", { sessionId });
};

const resumeAgent = async (sessionId: string): Promise<void> => {
  await invoke("resume_agent", { sessionId });
};

const stopAgent = async (sessionId: string): Promise<void> => {
  await invoke("stop_agent", { sessionId });
};

const getAgentStatus = async (sessionId: string): Promise<AgentSession> => {
  return await invoke("get_agent_status", { sessionId });
};

// ─── Sub-Components ─────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<
    string,
    { icon: React.ReactNode; classes: string; label: string }
  > = {
    running: {
      icon: <Loader2 size={10} className="animate-spin" />,
      classes:
        "bg-construct-accent/15 text-construct-accent border-construct-accent/25",
      label: "Running",
    },
    paused: {
      icon: <Pause size={10} />,
      classes:
        "bg-construct-warning/15 text-construct-warning border-construct-warning/25",
      label: "Paused",
    },
    completed: {
      icon: <CheckCircle2 size={10} />,
      classes:
        "bg-construct-success/15 text-construct-success border-construct-success/25",
      label: "Done",
    },
    failed: {
      icon: <XCircle size={10} />,
      classes:
        "bg-construct-error/15 text-construct-error border-construct-error/25",
      label: "Failed",
    },
    waiting: {
      icon: <AlertCircle size={10} />,
      classes:
        "bg-construct-warning/15 text-construct-warning border-construct-warning/25",
      label: "Waiting",
    },
    idle: {
      icon: <Circle size={10} />,
      classes: "bg-construct-textMuted/10 text-construct-textMuted",
      label: "Idle",
    },
  };
  const c = config[status] || config.idle;
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${c.classes}`}
    >
      {c.icon}
      {c.label}
    </span>
  );
}

function TaskItem({
  task,
  isActive,
}: {
  task: AgentTask;
  isActive: boolean;
}) {
  const icon = {
    pending: <Circle size={12} className="text-construct-textMuted" />,
    in_progress: (
      <Loader2 size={12} className="text-construct-accent animate-spin" />
    ),
    completed: <CheckCircle2 size={12} className="text-construct-success" />,
    failed: <XCircle size={12} className="text-construct-error" />,
    blocked: <AlertCircle size={12} className="text-construct-warning" />,
  }[task.status];

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1 rounded text-[11px] transition-colors ${
        isActive
          ? "bg-construct-accent/10 border border-construct-accent/20"
          : "border border-transparent"
      } ${task.status === "completed" ? "opacity-60" : ""}`}
    >
      {icon}
      <span
        className={`flex-1 truncate ${
          task.status === "completed"
            ? "line-through text-construct-textMuted"
            : "text-construct-text"
        }`}
      >
        {task.description}
      </span>
    </div>
  );
}

function EventItem({ event }: { event: AgentOutputEvent }) {
  const typeConfig: Record<
    string,
    {
      icon: React.ReactNode;
      borderColor: string;
      bgColor: string;
    }
  > = {
    thought: {
      icon: <Sparkles size={11} />,
      borderColor: "border-construct-accent/30",
      bgColor: "bg-construct-panel/30",
    },
    tool_call: {
      icon: <Terminal size={11} />,
      borderColor: "border-construct-warning/30",
      bgColor: "bg-construct-warning/5",
    },
    tool_result: {
      icon: <CheckCheck size={11} />,
      borderColor: "border-construct-success/30",
      bgColor: "bg-construct-success/5",
    },
    code: {
      icon: <FileCode size={11} />,
      borderColor: "border-purple-500/30",
      bgColor: "bg-purple-500/5",
    },
    error: {
      icon: <AlertCircle size={11} />,
      borderColor: "border-construct-error/30",
      bgColor: "bg-construct-error/5",
    },
    complete: {
      icon: <CheckCircle2 size={11} />,
      borderColor: "border-construct-success/30",
      bgColor: "bg-construct-success/10",
    },
    task_start: {
      icon: <ChevronRight size={11} />,
      borderColor: "border-construct-accent/20",
      bgColor: "bg-construct-panel/20",
    },
    task_complete: {
      icon: <CheckCircle2 size={11} />,
      borderColor: "border-construct-success/20",
      bgColor: "bg-construct-success/5",
    },
    task_failed: {
      icon: <XCircle size={11} />,
      borderColor: "border-construct-error/20",
      bgColor: "bg-construct-error/5",
    },
    waiting: {
      icon: <Clock size={11} />,
      borderColor: "border-construct-warning/20",
      bgColor: "bg-construct-warning/5",
    },
  };

  const cfg = typeConfig[event.type] || typeConfig.thought;
  const isCode = event.type === "code";

  return (
    <div
      className={`flex gap-2 px-2 py-1.5 rounded border-l-2 ${cfg.borderColor} ${cfg.bgColor}`}
    >
      <span className="text-construct-textMuted mt-0.5 shrink-0">
        {cfg.icon}
      </span>
      <div className="flex-1 min-w-0">
        {isCode ? (
          <pre className="text-[10px] font-mono text-construct-text bg-construct-bg/50 p-2 rounded overflow-x-auto">
            <code>{event.content}</code>
          </pre>
        ) : (
          <p
            className={`text-[11px] leading-relaxed ${
              event.type === "error"
                ? "text-construct-error"
                : event.type === "complete"
                ? "text-construct-success font-medium"
                : "text-construct-text"
            }`}
          >
            {event.content}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────

function AgentPanel() {
  const [goal, setGoal] = useState("");
  const [session, setSession] = useState<AgentSession | null>(null);
  const [events, setEvents] = useState<AgentOutputEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAutonomous, setIsAutonomous] = useState(true);
  const outputRef = useRef<HTMLDivElement>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [events.length]);

  // Listen for agent events
  const setupListener = useCallback(async (sessionId: string) => {
    // Unlisten previous
    if (unlistenRef.current) {
      unlistenRef.current();
    }
    const unlisten = await listen<AgentOutputEvent>(
      `agent:${sessionId}`,
      (event) => {
        setEvents((prev) => [...prev, event.payload]);
        // Update task statuses based on events
        if (
          event.payload.type === "task_start" ||
          event.payload.type === "task_complete" ||
          event.payload.type === "task_failed"
        ) {
          // Refresh session status
          getAgentStatus(sessionId)
            .then(setSession)
            .catch(() => {});
        }
      }
    );
    unlistenRef.current = unlisten;
  }, []);

  const handleStart = async () => {
    if (!goal.trim()) return;
    setIsLoading(true);
    try {
      const sessionId = await startAgent(goal.trim());
      const status = await getAgentStatus(sessionId);
      setSession(status);
      setEvents([]);
      await setupListener(sessionId);
    } catch (e) {
      console.error("Failed to start agent:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePause = async () => {
    if (!session) return;
    await pauseAgent(session.id);
    setSession((s) => (s ? { ...s, status: "paused" } : s));
  };

  const handleResume = async () => {
    if (!session) return;
    await resumeAgent(session.id);
    setSession((s) => (s ? { ...s, status: "running" } : s));
  };

  const handleStop = async () => {
    if (!session) return;
    await stopAgent(session.id);
    setSession((s) => (s ? { ...s, status: "failed" } : s));
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }
  };

  // Cleanup listener on unmount
  useEffect(() => {
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
      }
    };
  }, []);

  // ─── Goal Input (idle state) ───
  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-8">
        <div className="flex items-center gap-2 mb-6">
          <Bot size={24} className="text-construct-accent" />
          <h2 className="text-lg font-semibold text-construct-text">
            Construct Agent
          </h2>
        </div>

        <p className="text-xs text-construct-textMuted mb-6 text-center max-w-md">
          Describe what you want to build. The agent will plan, code, test, and
          commit autonomously.
        </p>

        <div className="flex items-center gap-2 w-full max-w-lg">
          <div className="flex-1 flex items-center h-9 px-3 bg-construct-bg border border-construct-border rounded focus-within:border-construct-accent transition-colors">
            <Target
              size={14}
              className="text-construct-textMuted mr-2 shrink-0"
            />
            <input
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleStart();
                }
              }}
              placeholder="e.g., Create a React counter component with TypeScript"
              className="flex-1 bg-transparent text-xs text-construct-text placeholder-construct-textMuted outline-none"
            />
          </div>
          <button
            onClick={handleStart}
            disabled={!goal.trim() || isLoading}
            className="flex items-center gap-1.5 h-9 px-4 bg-construct-accent hover:bg-construct-accentHover disabled:opacity-40 text-construct-panel rounded text-xs font-semibold transition-colors"
          >
            {isLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Zap size={14} />
            )}
            Start
          </button>
        </div>

        {/* Autonomous mode toggle */}
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => setIsAutonomous(!isAutonomous)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${
              isAutonomous
                ? "bg-construct-success/15 text-construct-success border border-construct-success/25"
                : "bg-construct-textMuted/10 text-construct-textMuted border border-construct-textMuted/20"
            }`}
          >
            <Sparkles size={10} />
            {isAutonomous ? "Autonomous Mode" : "Manual Approval"}
          </button>
        </div>
      </div>
    );
  }

  // ─── Active Session View ───
  return (
    <div className="flex flex-col h-full">
      {/* Goal Card */}
      <div className="flex items-start gap-3 p-3 bg-construct-panel border-b border-construct-border">
        <Target
          size={16}
          className="text-construct-accent mt-0.5 shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-construct-text font-medium truncate">
            {session.goal}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={session.status} />
            <span className="text-[10px] text-construct-textMuted">
              {events.length} events
            </span>
          </div>
        </div>
        {/* Controls */}
        <div className="flex items-center gap-1">
          {session.status === "running" && (
            <button
              onClick={handlePause}
              className="flex items-center justify-center w-7 h-7 rounded hover:bg-construct-hover text-construct-textMuted hover:text-construct-warning transition-colors"
              title="Pause"
            >
              <Pause size={14} />
            </button>
          )}
          {session.status === "paused" && (
            <button
              onClick={handleResume}
              className="flex items-center justify-center w-7 h-7 rounded hover:bg-construct-hover text-construct-textMuted hover:text-construct-success transition-colors"
              title="Resume"
            >
              <Play size={14} />
            </button>
          )}
          <button
            onClick={handleStop}
            className="flex items-center justify-center w-7 h-7 rounded hover:bg-construct-hover text-construct-textMuted hover:text-construct-error transition-colors"
            title="Stop"
          >
            <Square size={14} />
          </button>
        </div>
      </div>

      {/* Task List */}
      <div className="px-3 py-2 border-b border-construct-border">
        <h3 className="text-[10px] font-semibold text-construct-textMuted uppercase tracking-wider mb-1.5">
          Tasks
        </h3>
        <div className="space-y-1">
          {session.tasks.length === 0 ? (
            <div className="text-[10px] text-construct-textMuted italic">
              Planning tasks...
            </div>
          ) : (
            session.tasks.map((task, i) => (
              <TaskItem
                key={task.id}
                task={task}
                isActive={i === session.current_task_index}
              />
            ))
          )}
        </div>
      </div>

      {/* Streaming Output */}
      <div
        ref={outputRef}
        className="flex-1 overflow-y-auto p-3 space-y-2"
      >
        {events.map((event, i) => (
          <EventItem key={i} event={event} />
        ))}
        {session.status === "running" && events.length > 0 && (
          <div className="flex items-center gap-1.5 text-construct-textMuted">
            <Loader2 size={10} className="animate-spin" />
            <span className="text-[10px]">Working...</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default AgentPanel;
