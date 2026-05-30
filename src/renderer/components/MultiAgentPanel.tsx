import { useState, useEffect, useRef, useCallback } from "react";

/* ─── Types ─── */
interface Agent {
  id: string;
  role: string;
  name: string;
  status: string;
  task: string;
  progress: number;
  description?: string;
  messages?: AgentMsg[];
}

interface AgentMsg {
  msg_id: string;
  from: string;
  to: string;
  type: string;
  content: string;
  timestamp: number;
}

/* ─── Colors ─── */
const BASE = "#0c0c10";
const S1 = "#12121a";
const S2 = "#1a1a24";

const ACCENT = "#6366f1";
const TEXT = "#e8e8ec";
const TEXT_MUTED = "#94949c";
const TEXT_DIM = "#6b6b73";
const TEXT_FAINT = "#4a4a52";
const BORDER = "rgba(255,255,255,0.04)";
const GREEN = "#22c55e";
const RED = "#ef4444";
const AMBER = "#f59e0b";
const CYAN = "#06b6d4";
const ff = '"Geist Mono", "JetBrains Mono", monospace';

const roleColors: Record<string, string> = {
  code_engineer: ACCENT,
  test_engineer: "#a855f7",
  security_auditor: GREEN,
  ui_designer: AMBER,
  devops_engineer: "#ec4899",
  researcher: CYAN,
  project_manager: "#f97316",
  legal_reviewer: "#64748b",
  // Short aliases for display
  code: ACCENT,
  security: GREEN,
  ui: AMBER,
  research: CYAN,
  devops: "#ec4899",
  test: "#a855f7",
};

const typeColors: Record<string, string> = {
  delegation: ACCENT,
  completion: GREEN,
  broadcast: CYAN,
  request: ACCENT,
  response: GREEN,
  conflict: RED,
  REQ: ACCENT,
  RES: GREEN,
  CMP: CYAN,
  ERR: RED,
};

const API_BASE = "http://127.0.0.1:8000";

export default function MultiAgentPanel() {
  const [teamId, setTeamId] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [messages, setMessages] = useState<AgentMsg[]>([]);
  const [goal, setGoal] = useState("");
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [teamStatus, setTeamStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Start polling team status
  const startPolling = useCallback((tid: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/orchestrate/team/${tid}/status`);
        if (!res.ok) {
          setError(`Status fetch failed: ${res.status}`);
          return;
        }
        const data = await res.json();

        setAgents(data.agents || []);
        setMessages(data.messages || []);
        setTeamStatus(data.status || "");

        // Stop polling when team is done
        if (data.status === "completed" || data.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (err: any) {
        setError(`Poll error: ${err.message}`);
      }
    }, 1500);
  }, []);

  // Start a new team
  const startTeam = async () => {
    if (!goal.trim()) return;
    setIsLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/orchestrate/team`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: goal.trim(),
          roles: ["code_engineer", "test_engineer", "security_auditor"],
          project_path: "~/construct-projects/default",
          max_parallel: 3,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setError(`Failed to start team: ${errData.detail || res.status}`);
        setIsLoading(false);
        return;
      }

      const data = await res.json();
      setTeamId(data.team_id);
      setAgents(data.agents || []);
      setTeamStatus(data.status || "running");
      setIsLoading(false);
      startPolling(data.team_id);
    } catch (err: any) {
      setError(`Connection error: ${err.message}`);
      setIsLoading(false);
    }
  };

  // Send a message
  const handleSend = async () => {
    if (!input.trim() || !teamId) return;

    let toAgent: string | null = null;
    let content = input.trim();

    // Parse @mention
    const mentionMatch = content.match(/^@(\w+)\s+(.*)/);
    if (mentionMatch) {
      toAgent = mentionMatch[1];
      content = mentionMatch[2];
    }

    try {
      await fetch(`${API_BASE}/orchestrate/team/${teamId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_agent: "user",
          to_agent: toAgent,
          content,
        }),
      });
    } catch {
      // Non-critical: message will appear on next poll
    }

    setInput("");
  };

  const asciiBar = (pct: number): string => {
    if (pct <= 0) return "--";
    const filled = Math.round(pct / 10);
    const empty = 10 - filled;
    return `[${"=".repeat(filled)}${" ".repeat(empty)}] ${pct}%`;
  };

  const formatTimestamp = (ts: number): string => {
    if (!ts) return "--";
    const d = new Date(ts * 1000);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  };

  const workingCount = agents.filter((a) => a.status === "working" || a.status === "active").length;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        fontFamily: ff,
        background: BASE,
        color: TEXT,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: `1px solid ${BORDER}`,
          flexShrink: 0,
          background: S1,
        }}
      >
        <span
          style={{
            fontSize: "10px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: TEXT_MUTED,
          }}
        >
          Agent Team
        </span>
        <span style={{ fontSize: "10px", color: TEXT_DIM }}>
          {teamId ? `${workingCount}/${agents.length} active` : "no team"}
        </span>
      </div>

      {/* Goal Input (replaces hardcoded goal) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "6px 12px",
          borderBottom: `1px solid ${BORDER}`,
          flexShrink: 0,
          background: S1,
        }}
      >
        <span
          style={{
            fontSize: "10px",
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: TEXT_DIM,
            flexShrink: 0,
          }}
        >
          Goal
        </span>
        {teamId ? (
          <span style={{ fontSize: "11px", color: TEXT_MUTED, flex: 1 }}>{goal}</span>
        ) : (
          <input
            type="text"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Enter team goal (e.g., 'Build a React dashboard')"
            style={{
              flex: 1,
              padding: "4px 8px",
              fontSize: "11px",
              fontFamily: ff,
              background: S2,
              color: TEXT,
              border: `1px solid ${BORDER}`,
              borderRadius: "2px",
              outline: "none",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") startTeam();
            }}
          />
        )}
        {!teamId && (
          <button
            onClick={startTeam}
            disabled={isLoading || !goal.trim()}
            style={{
              padding: "3px 12px",
              fontSize: "10px",
              fontFamily: ff,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              background: ACCENT,
              color: "#fff",
              border: "none",
              borderRadius: "2px",
              cursor: isLoading || !goal.trim() ? "default" : "pointer",
              opacity: isLoading || !goal.trim() ? 0.5 : 1,
              fontWeight: 600,
            }}
          >
            {isLoading ? "Starting..." : "Start Team"}
          </button>
        )}
        {teamId && (
          <span
            style={{
              fontSize: "10px",
              padding: "2px 6px",
              borderRadius: "2px",
              fontWeight: 600,
              color: teamStatus === "completed" ? GREEN : teamStatus === "failed" ? RED : ACCENT,
              background: S2,
            }}
          >
            {teamStatus}
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            padding: "4px 12px",
            fontSize: "10px",
            color: RED,
            background: "rgba(239,68,68,0.1)",
            borderBottom: `1px solid ${BORDER}`,
          }}
        >
          {error}
        </div>
      )}

      {/* Agent Table */}
      <div style={{ flexShrink: 0, borderBottom: `1px solid ${BORDER}` }}>
        {/* Table Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            background: S1,
          }}
        >
          {["ROLE", "STATUS", "TASK", "PROGRESS"].map((h) => (
            <div
              key={h}
              style={{
                flex: h === "TASK" ? 2 : 1,
                padding: "6px 8px",
                fontSize: "10px",
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: TEXT_DIM,
                whiteSpace: "nowrap",
              }}
            >
              {h}
            </div>
          ))}
        </div>

        {/* Agent Rows */}
        {agents.length === 0 ? (
          <div
            style={{
              padding: "16px 12px",
              fontSize: "11px",
              color: TEXT_DIM,
              textAlign: "center",
            }}
          >
            No agents yet. Enter a goal and click "Start Team".
          </div>
        ) : (
          agents.map((agent) => (
            <div
              key={agent.id}
              style={{
                display: "flex",
                alignItems: "center",
              }}
            >
              {/* ROLE */}
              <div
                style={{
                  flex: 1,
                  padding: "5px 8px",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: roleColors[agent.role] || roleColors[agent.id] || TEXT_MUTED,
                  fontFamily: ff,
                }}
              >
                {agent.name || agent.role || agent.id}
              </div>
              {/* STATUS */}
              <div
                style={{
                  flex: 1,
                  padding: "5px 8px",
                  fontSize: "11px",
                  color:
                    agent.status === "working" || agent.status === "active"
                      ? ACCENT
                      : agent.status === "completed"
                        ? GREEN
                        : agent.status === "failed"
                          ? RED
                          : TEXT_DIM,
                  fontFamily: ff,
                }}
              >
                {agent.status}
              </div>
              {/* TASK */}
              <div
                style={{
                  flex: 2,
                  padding: "5px 8px",
                  fontSize: "11px",
                  color: agent.task ? TEXT_MUTED : TEXT_DIM,
                  fontFamily: ff,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {agent.task || "--"}
              </div>
              {/* PROGRESS */}
              <div
                style={{
                  flex: 1,
                  padding: "5px 8px",
                  fontSize: "10px",
                  color: agent.progress > 0 ? ACCENT : TEXT_DIM,
                  fontFamily: ff,
                  whiteSpace: "nowrap",
                }}
              >
                {asciiBar(agent.progress)}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Messages Section */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Messages Header */}
        <div
          style={{
            padding: "6px 12px",
            fontSize: "10px",
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: TEXT_DIM,
            borderBottom: `1px solid ${BORDER}`,
            background: S1,
            position: "sticky",
            top: 0,
            zIndex: 1,
          }}
        >
          Messages {messages.length > 0 && `(${messages.length})`}
        </div>

        {/* Message Rows */}
        <div style={{ flex: 1 }}>
          {messages.length === 0 ? (
            <div
              style={{
                padding: "16px 12px",
                fontSize: "11px",
                color: TEXT_DIM,
                textAlign: "center",
              }}
            >
              {teamId ? "Waiting for agent messages..." : "Start a team to see messages"}
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.msg_id}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "0",
                  padding: "3px 12px",
                  fontSize: "11px",
                  borderBottom: `1px solid ${BORDER}`,
                }}
              >
                {/* Timestamp */}
                <span
                  style={{
                    color: TEXT_FAINT,
                    fontFamily: ff,
                    minWidth: "56px",
                    flexShrink: 0,
                  }}
                >
                  {formatTimestamp(msg.timestamp)}
                </span>

                {/* From */}
                <span
                  style={{
                    color: roleColors[msg.from] || TEXT_MUTED,
                    fontWeight: 600,
                    minWidth: "80px",
                    flexShrink: 0,
                  }}
                >
                  {msg.from}
                </span>

                {/* Arrow */}
                <span style={{ color: TEXT_FAINT, margin: "0 4px" }}>→</span>

                {/* To */}
                <span
                  style={{
                    color: roleColors[msg.to] || TEXT_MUTED,
                    minWidth: "80px",
                    flexShrink: 0,
                  }}
                >
                  {msg.to}
                </span>

                {/* Type Badge */}
                <span
                  style={{
                    fontSize: "9px",
                    fontWeight: 600,
                    color: typeColors[msg.type] || TEXT_DIM,
                    background: S2,
                    padding: "1px 4px",
                    borderRadius: "2px",
                    marginRight: "8px",
                    minWidth: "56px",
                    textAlign: "center",
                    flexShrink: 0,
                  }}
                >
                  {msg.type}
                </span>

                {/* Content */}
                <span style={{ color: TEXT_MUTED }}>{msg.content}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Input */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "6px 12px",
          borderTop: `1px solid ${BORDER}`,
          flexShrink: 0,
          background: S1,
        }}
      >
        <span style={{ fontSize: "12px", color: ACCENT, fontWeight: 600 }}>{" > "}</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder={teamId ? "@role message (or just message to broadcast)" : "Start a team first"}
          disabled={!teamId}
          style={{
            flex: 1,
            padding: "4px 0",
            fontSize: "11px",
            fontFamily: ff,
            background: "transparent",
            color: TEXT,
            border: "none",
            outline: "none",
            opacity: teamId ? 1 : 0.4,
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || !teamId}
          style={{
            padding: "3px 10px",
            fontSize: "10px",
            fontFamily: ff,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            background: S2,
            color: input.trim() && teamId ? ACCENT : TEXT_DIM,
            border: "none",
            borderRadius: "2px",
            cursor: input.trim() && teamId ? "pointer" : "default",
          }}
        >
          SEND
        </button>
      </div>
    </div>
  );
}
