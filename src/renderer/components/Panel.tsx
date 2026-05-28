import { useState } from "react";
import {
  Terminal,
  MessageSquare,
  Bot,
  Brain,
  Wrench,
  Plug,
  Monitor,
  Users,
  Zap,
  X,
  ChevronUp,
} from "lucide-react";

const COLORS = {
  base: "#0c0c10",
  surface1: "#12121a",
  surface2: "#1a1a24",
  surface3: "#22222e",
  accent: "#6366f1",
  textPrimary: "#e8e8ec",
  textSecondary: "#94949c",
  muted: "#6b6b73",
  dim: "#4a4a52",
  border: "rgba(255,255,255,0.04)",
  success: "#22c55e",
  error: "#ef4444",
};

interface Tab {
  id: string;
  icon: React.ReactNode;
  label: string;
}

const tabs: Tab[] = [
  { id: "terminal", icon: <Terminal size={13} />, label: "Terminal" },
  { id: "chat", icon: <MessageSquare size={13} />, label: "Chat" },
  { id: "agent", icon: <Bot size={13} />, label: "Agent" },
  { id: "memory", icon: <Brain size={13} />, label: "Memory" },
  { id: "skills", icon: <Wrench size={13} />, label: "Skills" },
  { id: "mcp", icon: <Plug size={13} />, label: "MCP" },
  { id: "screen", icon: <Monitor size={13} />, label: "Screen" },
  { id: "agents", icon: <Users size={13} />, label: "Agents" },
  { id: "auto", icon: <Zap size={13} />, label: "Auto" },
];

function Panel() {
  const [activeTab, setActiveTab] = useState("terminal");

  const renderTerminal = () => (
    <div
      style={{
        fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
        fontSize: 11,
        lineHeight: "18px",
        padding: 8,
      }}
    >
      <div style={{ color: COLORS.muted }}>$ construct --version</div>
      <div style={{ color: COLORS.textPrimary }}>0.1.0-alpha</div>
      <div style={{ color: COLORS.muted, marginTop: 4 }}>$ npm run dev</div>
      <div style={{ color: COLORS.success }}>vite v6.0 ready in 342ms</div>
      <div style={{ color: COLORS.accent }}>
        local: http://localhost:5173/
      </div>
      <div style={{ color: COLORS.muted, marginTop: 4 }}>
        $ cargo tauri dev
      </div>
      <div style={{ color: COLORS.textPrimary }}>Running ConstructApp...</div>
      <div style={{ color: COLORS.accent, marginTop: 4 }}>_</div>
    </div>
  );

  const renderChat = () => (
    <div style={{ padding: 8 }}>
      <div
        style={{
          fontSize: 11,
          color: COLORS.muted,
          marginBottom: 8,
        }}
      >
        AI assistant panel. Type to send messages.
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <input
          type="text"
          placeholder="Ask anything..."
          style={{
            flex: 1,
            height: 26,
            padding: "0 8px",
            backgroundColor: COLORS.base,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 2,
            fontSize: 11,
            fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
            color: COLORS.textPrimary,
            outline: "none",
          }}
        />
        <button
          style={{
            height: 26,
            padding: "0 12px",
            backgroundColor: COLORS.accent,
            border: "none",
            borderRadius: 2,
            fontSize: 10,
            fontWeight: 600,
            fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
            color: "#fff",
            cursor: "pointer",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Send
        </button>
      </div>
    </div>
  );

  const renderAgent = () => (
    <div style={{ padding: 8 }}>
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: COLORS.muted,
          marginBottom: 8,
          fontWeight: 600,
        }}
      >
        Agent Status
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 10, color: COLORS.dim, width: 60 }}>State</span>
        <span style={{ fontSize: 11, color: COLORS.textSecondary }}>
          idle
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, color: COLORS.dim, width: 60 }}>Model</span>
        <span style={{ fontSize: 11, color: COLORS.textSecondary }}>
          claude-sonnet-4-20250514
        </span>
      </div>
    </div>
  );

  const renderMemory = () => (
    <div style={{ padding: 8 }}>
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: COLORS.muted,
          marginBottom: 8,
          fontWeight: 600,
        }}
      >
        Memory Usage
      </div>
      <div
        style={{
          fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
          fontSize: 11,
          color: COLORS.textSecondary,
          lineHeight: "18px",
        }}
      >
        <div>Contexts: 1,247</div>
        <div>Vectors: 8,932</div>
        <div>Tokens: 12,456 / 200,000</div>
        <div>Usage: 6.2%</div>
      </div>
    </div>
  );

  const renderPlaceholder = (label: string) => (
    <div style={{ padding: 8 }}>
      <div
        style={{
          fontSize: 11,
          color: COLORS.muted,
          fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
        }}
      >
        {label} panel content.
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case "terminal":
        return renderTerminal();
      case "chat":
        return renderChat();
      case "agent":
        return renderAgent();
      case "memory":
        return renderMemory();
      case "skills":
        return renderPlaceholder("Skills");
      case "mcp":
        return renderPlaceholder("MCP");
      case "screen":
        return renderPlaceholder("Screen");
      case "agents":
        return renderPlaceholder("Multi-agent");
      case "auto":
        return renderPlaceholder("Autonomous");
      default:
        return renderTerminal();
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: COLORS.surface1,
      }}
    >
      {/* Tab Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 28,
          backgroundColor: COLORS.base,
          borderBottom: `1px solid ${COLORS.border}`,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", overflow: "hidden", flex: 1 }}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: "100%",
                  padding: "0 10px",
                  gap: 5,
                  border: "none",
                  borderRight: `1px solid ${COLORS.border}`,
                  borderBottom: isActive
                    ? `2px solid ${COLORS.accent}`
                    : `2px solid transparent`,
                  backgroundColor: isActive ? COLORS.surface2 : "transparent",
                  color: isActive ? COLORS.textPrimary : COLORS.muted,
                  cursor: "pointer",
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                  fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontWeight: 600,
                  transition: "background-color 50ms",
                }}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", paddingRight: 4, flexShrink: 0 }}>
          <button
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 22,
              height: 22,
              borderRadius: 2,
              border: "none",
              cursor: "pointer",
              backgroundColor: "transparent",
              color: COLORS.muted,
            }}
          >
            <ChevronUp size={12} />
          </button>
          <button
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 22,
              height: 22,
              borderRadius: 2,
              border: "none",
              cursor: "pointer",
              backgroundColor: "transparent",
              color: COLORS.muted,
            }}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          backgroundColor: COLORS.surface1,
        }}
      >
        {renderContent()}
      </div>
    </div>
  );
}

export default Panel;
