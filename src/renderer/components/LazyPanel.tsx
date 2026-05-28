import { lazy, Suspense } from "react";

// ---------------------------------------------------------------------------
// Lazy-loaded panel components — each gets its own chunk for code-splitting.
// ---------------------------------------------------------------------------
const TerminalPanel = lazy(() => import("./TerminalPanel"));
const ProblemsPanel = lazy(() => import("./ProblemsPanel"));
const ChatPanel = lazy(() => import("./ChatPanel"));
const AgentPanel = lazy(() => import("./AgentPanel"));
const MemoryPanel = lazy(() => import("./MemoryPanel"));
const AutonomousPanel = lazy(() => import("./AutonomousPanel"));

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
      {activeTab === "problems" && <ProblemsPanel />}
      {activeTab === "chat" && <ChatPanel />}
      {activeTab === "agent" && <AgentPanel />}
      {activeTab === "memory" && <MemoryPanel />}
      {activeTab === "autonomous" && <AutonomousPanel />}
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// Fallback skeleton
// ---------------------------------------------------------------------------

function PanelSkeleton() {
  return (
    <div className="w-full h-full p-4 space-y-2">
      <div className="h-3 w-1/3 skeleton" />
      <div className="h-3 w-2/3 skeleton" />
      <div className="h-3 w-1/2 skeleton" />
    </div>
  );
}
