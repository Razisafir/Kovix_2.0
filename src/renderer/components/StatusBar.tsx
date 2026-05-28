import {
  PanelBottom,
  PanelLeft,
  GitBranch,
} from "lucide-react";
import useAppStore from "@/stores/useAppStore";

const COLORS = {
  surface1: "#12121a",
  surface2: "#1a1a24",
  accent: "#6366f1",
  textPrimary: "#e8e8ec",
  textSecondary: "#94949c",
  muted: "#6b6b73",
  dim: "#4a4a52",
  border: "rgba(255,255,255,0.04)",
  idle: "#4a4a52",
  working: "#6366f1",
  error: "#ef4444",
  success: "#22c55e",
};

function StatusBar() {
  const sidebarVisible = useAppStore((s) => s.sidebarVisible);
  const panelVisible = useAppStore((s) => s.panelVisible);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const togglePanel = useAppStore((s) => s.togglePanel);
  const cursorPosition = useAppStore((s) => s.cursorPosition);

  // Status: idle | working | error - color coded
  const agentStatus = "idle"; // idle | working | error
  const statusColor =
    agentStatus === "idle"
      ? COLORS.idle
      : agentStatus === "working"
      ? COLORS.working
      : COLORS.error;

  const memUsage = "34%";
  const ctxUsage = "12k/200k";
  const branch = "main";

  return (
    <footer
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 22,
        padding: "0 8px",
        backgroundColor: COLORS.surface1,
        borderTop: `1px solid ${COLORS.border}`,
        flexShrink: 0,
        userSelect: "none",
        fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
        fontSize: 10,
      }}
    >
      {/* Left */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button
          onClick={toggleSidebar}
          title="Toggle Sidebar"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 18,
            height: 18,
            borderRadius: 2,
            border: "none",
            cursor: "pointer",
            backgroundColor: sidebarVisible ? COLORS.surface2 : "transparent",
            color: sidebarVisible ? COLORS.textSecondary : COLORS.dim,
          }}
        >
          <PanelLeft size={11} />
        </button>
        <button
          onClick={togglePanel}
          title="Toggle Panel"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 18,
            height: 18,
            borderRadius: 2,
            border: "none",
            cursor: "pointer",
            backgroundColor: panelVisible ? COLORS.surface2 : "transparent",
            color: panelVisible ? COLORS.textSecondary : COLORS.dim,
          }}
        >
          <PanelBottom size={11} />
        </button>
        <span style={{ color: COLORS.dim, margin: "0 4px" }}>|</span>
        <span style={{ color: COLORS.muted, letterSpacing: "0.02em" }}>
          construct v0.1.0-alpha
        </span>
        <span style={{ color: COLORS.dim, margin: "0 4px" }}>|</span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            color: COLORS.muted,
          }}
        >
          <GitBranch size={10} style={{ flexShrink: 0 }} />
          <span>{branch}</span>
        </div>
      </div>

      {/* Center */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
        }}
      >
        <span style={{ color: statusColor, letterSpacing: "0.02em" }}>
          agent:{agentStatus}
        </span>
        <span style={{ color: COLORS.muted, letterSpacing: "0.02em" }}>
          mem:{memUsage}
        </span>
        <span style={{ color: COLORS.muted, letterSpacing: "0.02em" }}>
          ctx:{ctxUsage}
        </span>
      </div>

      {/* Right */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span style={{ color: COLORS.muted, letterSpacing: "0.02em" }}>
          ln {cursorPosition?.line ?? 1}, col {cursorPosition?.column ?? 1}
        </span>
        <span style={{ color: COLORS.dim }}>utf-8</span>
        <span style={{ color: COLORS.dim }}>typescript</span>
      </div>
    </footer>
  );
}

export default StatusBar;
