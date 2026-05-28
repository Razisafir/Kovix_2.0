import { lazy, Suspense } from "react";

// ---------------------------------------------------------------------------
// Lazy-loaded panel components — each gets its own chunk for code-splitting.
// ---------------------------------------------------------------------------
const TerminalPanel = lazy(() => import("./TerminalOutput").then(m => ({ default: m.TerminalOutput as unknown as React.ComponentType })));
const ChatPanel = lazy(() => import("./AgentPanel"));
const AgentPanel = lazy(() => import("./AgentPanel"));
const MemoryPanel = lazy(() => import("./MemoryPanel"));
const AutonomousPanel = lazy(() => import("./AutonomousPanel"));
const SkillsPanel = lazy(() => import("./SkillMarketplace"));
const MCPPanel = lazy(() => import("./MCPConnector"));
const MultiAgentPanel = lazy(() => import("./MultiAgentPanel"));
const ScreenPanel = lazy(() => import("./ScreenControl"));

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LazyPanelProps {
  /** The currently-active bottom-panel tab id. */
  activeTab: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders the active bottom-panel tab via React.lazy + Suspense.
 *
 * Panels are loaded on-demand so the initial bundle only pays for the
 * code the user actually sees.
 */
export function LazyPanel({ activeTab }: LazyPanelProps) {
  return (
    <Suspense fallback={<PanelSkeleton />}>
      {activeTab === "terminal" && <TerminalPanel />}
      {activeTab === "chat" && <ChatPanel />}
      {activeTab === "agent" && <AgentPanel />}
      {activeTab === "memory" && <MemoryPanel />}
      {activeTab === "skills" && <SkillsPanel />}
      {activeTab === "mcp" && <MCPPanel />}
      {activeTab === "agents" && <MultiAgentPanel />}
      {activeTab === "screen" && <ScreenPanel />}
      {activeTab === "autonomous" && <AutonomousPanel />}
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// Fallback skeleton
// ---------------------------------------------------------------------------

function PanelSkeleton() {
  return (
    <div style={{ width: "100%", height: "100%", padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ height: "12px", width: "33%", background: "#1a1a24" }} />
      <div style={{ height: "12px", width: "66%", background: "#1a1a24" }} />
      <div style={{ height: "12px", width: "50%", background: "#1a1a24" }} />
    </div>
  );
}
