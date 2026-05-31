import { lazy, Suspense, useState, useCallback, useEffect } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import OnboardingModal from "./components/OnboardingModal";
import Sidebar from "./components/Sidebar";
import StatusBar from "./components/StatusBar";
import CommandPalette from "./components/CommandPalette";
import type { PaletteCommand } from "./components/CommandPalette";
import {
  useKeyboardShortcuts,
  createConstructShortcuts,
} from "./hooks/useKeyboardShortcuts";
import { useCommandPalette } from "./hooks/useCommandPalette";
import { registerDefaultCommands } from "./commands/defaultCommands";
import useAppStore from "./stores/useAppStore";

const Editor = lazy(() => import("./components/Editor"));
const Panel = lazy(() => import("./components/Panel"));
const SettingsPanel = lazy(() => import("./components/SettingsPanel"));
const AgentPanel = lazy(() => import("./components/AgentPanel"));

/* ─── Splash Screen Component ─── */
function SplashScreen({ onReady }: { onReady: () => void }) {
  const [status, setStatus] = useState<string>("initializing...");
  const [dots, setDots] = useState("");

  // Animate loading dots
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "" : d + "."));
    }, 400);
    return () => clearInterval(interval);
  }, []);

  // Backend health check
  useEffect(() => {
    let cancelled = false;
    const checkBackend = async () => {
      setStatus("checking backend");
      try {
        const ports = [8000, 25147, 8080];

        if (typeof window !== "undefined" && (window as any).__TAURI__) {
          try {
            const { invoke } = (window as any).__TAURI__.core || (window as any).__TAURI__;
            if (invoke) {
              const { listen } = (window as any).__TAURI__.event || (window as any).__TAURI__;
              if (listen) {
                const unlisten = await listen("backend:ready", (event: any) => {
                  const port = event.payload;
                  if (typeof port === "number") {
                    ports.unshift(port);
                  }
                });
                setTimeout(() => unlisten(), 5000);
              }
            }
          } catch {
            // Tauri API not available
          }
        }

        for (let i = 0; i < 8; i++) {
          if (cancelled) return;
          for (const port of ports) {
            try {
              const res = await fetch(`http://127.0.0.1:${port}/health`, {
                method: "GET",
                signal: AbortSignal.timeout(1500),
              });
              if (res.ok) {
                setStatus("ready");
                setTimeout(() => {
                  if (!cancelled) onReady();
                }, 400);
                return;
              }
            } catch {
              // Backend not ready on this port
            }
          }
          await new Promise((r) => setTimeout(r, 500));
        }
        if (!cancelled) {
          setStatus("proceeding offline");
          setTimeout(() => onReady(), 600);
        }
      } catch {
        if (!cancelled) {
          setStatus("proceeding offline");
          setTimeout(() => onReady(), 600);
        }
      }
    };
    const timer = setTimeout(checkBackend, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [onReady]);

  return (
    <div className="flex flex-col items-center justify-center w-screen h-screen bg-bg-onyx font-mono gap-6">
      {/* Logo Mark */}
      <div className="w-12 h-12 bg-panel-bg border border-border-subtle rounded-lg flex items-center justify-center">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect
            x="2"
            y="2"
            width="20"
            height="20"
            stroke="#00f5ff"
            strokeWidth="1.5"
            fill="none"
          />
          <line x1="2" y1="8" x2="22" y2="8" stroke="#00f5ff" strokeWidth="1" />
          <line x1="8" y1="8" x2="8" y2="22" stroke="#00f5ff" strokeWidth="1" />
        </svg>
      </div>

      {/* Title */}
      <div className="text-center">
        <div className="text-lg font-bold tracking-tight text-text-primary font-sans">
          CONSTRUCT
        </div>
        <div className="text-xs text-text-secondary mt-1 tracking-wider font-mono">
          memory-first AI agent
        </div>
      </div>

      {/* Status */}
      <div className="text-xs text-text-secondary tracking-widest uppercase min-h-4 font-mono">
        {status}
        {dots}
      </div>

      {/* Progress Bar */}
      <div className="w-[120px] h-[2px] bg-border-subtle overflow-hidden rounded-sm">
        <div
          className="h-full bg-accent-cyan opacity-60 transition-[width] duration-300 ease-out"
          style={{ width: status === "ready" ? "100%" : "40%" }}
        />
      </div>
    </div>
  );
}

/* ─── Settings hook ─── */
function useSettingsShortcut(onOpen: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && e.key === ",") {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpen]);
}

/* ─── App Root ─── */
function AppRoot() {
  const sidebarVisible = useAppStore((s) => s.sidebarVisible);
  const panelVisible = useAppStore((s) => s.panelVisible);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const togglePanel = useAppStore((s) => s.togglePanel);
  const onboardingComplete = useAppStore((s) => s.onboardingComplete);
  const setOnboardingComplete = useAppStore((s) => s.setOnboardingComplete);

  const [showSplash, setShowSplash] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [agentPanelVisible] = useState(true);

  const { isOpen: showCommandPalette, open: openCommandPalette, close: closeCommandPalette } = useCommandPalette();

  useEffect(() => {
    registerDefaultCommands();
  }, []);

  useEffect(() => {
    const handler = () => setShowSettings(true);
    window.addEventListener("construct:open-settings", handler);
    return () => window.removeEventListener("construct:open-settings", handler);
  }, []);

  const openSettings = useCallback(() => setShowSettings(true), []);
  useSettingsShortcut(openSettings);

  const handleSplashReady = useCallback(() => {
    setShowSplash(false);
    const completed =
      onboardingComplete ||
      localStorage.getItem("construct_onboarding_complete") === "true";
    if (!completed) {
      setShowOnboarding(true);
    }
  }, [onboardingComplete]);

  const handleOnboardingComplete = useCallback(() => {
    setOnboardingComplete(true);
    setShowOnboarding(false);
  }, [setOnboardingComplete]);

  const shortcuts = createConstructShortcuts({
    newFile: () => { console.log("[shortcut] new file"); },
    openFile: () => { console.log("[shortcut] open file"); },
    save: () => { console.log("[shortcut] save"); },
    saveAll: () => { console.log("[shortcut] save all"); },
    closeTab: () => { console.log("[shortcut] close tab"); },
    undo: () => { console.log("[shortcut] undo"); },
    redo: () => { console.log("[shortcut] redo"); },
    find: () => { console.log("[shortcut] find"); },
    replace: () => { console.log("[shortcut] replace"); },
    goToLine: () => { console.log("[shortcut] go to line"); },
    toggleSidebar: () => { toggleSidebar(); },
    toggleAgentPanel: () => {
      const store = useAppStore.getState();
      if (!store.panelVisible) store.togglePanel();
      store.setPanelTab("agent");
    },
    toggleMemoryPanel: () => {
      const store = useAppStore.getState();
      if (!store.panelVisible) store.togglePanel();
      store.setPanelTab("memory");
    },
    toggleTerminal: () => { togglePanel(); },
    fullscreen: () => {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen();
      }
    },
    commandPalette: () => { openCommandPalette(); },
    runCurrentFile: () => { console.log("[shortcut] run current file"); },
  });

  useKeyboardShortcuts(shortcuts, true);

  const handleCommandSelect = useCallback(
    (cmd: PaletteCommand) => {
      console.log(`[command palette] selected: ${cmd.id} — ${cmd.label}`);
    },
    []
  );

  if (showSplash) {
    return <SplashScreen onReady={handleSplashReady} />;
  }

  if (showOnboarding) {
    return <OnboardingModal onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="font-sans h-screen w-screen overflow-hidden flex flex-col antialiased selection:bg-accent-cyan-dim bg-bg-onyx text-text-primary">
      {/* ── Top Title Bar (h-10) ── */}
      <header className="h-10 flex-shrink-0 bg-panel-bg flex items-center justify-between border-b border-border-subtle relative z-50">
        {/* Mac dots */}
        <div className="mac-dots w-48">
          <span className="mac-dot close" />
          <span className="mac-dot minimize" />
          <span className="mac-dot maximize" />
        </div>

        {/* Centered title */}
        <div className="flex-1 flex justify-center items-center text-sm font-medium text-text-secondary">
          Construct — memory-first AI agent
        </div>

        {/* Right: LLM status badge */}
        <div className="w-48 flex justify-end pr-4">
          <div className="text-xs font-mono text-accent-cyan bg-accent-cyan-dim px-2 py-1 rounded-md border border-accent-cyan/30">
            Kimi K2.5 · local
          </div>
        </div>
      </header>

      {/* ── Main Content Area ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Far Left Icon Rail (w-12) */}
        <nav className="w-12 flex-shrink-0 bg-panel-bg border-r border-border-subtle flex flex-col items-center py-4 gap-6 z-40">
          <button
            className="w-8 h-8 flex items-center justify-center rounded-md bg-accent-cyan-dim text-accent-cyan border border-accent-cyan/30"
            title="Explorer"
          >
            <span className="material-symbols-outlined text-[20px]">folder</span>
          </button>
          <button
            className="w-8 h-8 flex items-center justify-center rounded-md text-text-secondary hover:text-text-primary transition-colors"
            title="Search"
            onClick={openCommandPalette}
          >
            <span className="material-symbols-outlined text-[20px]">search</span>
          </button>
          <button
            className="w-8 h-8 flex items-center justify-center rounded-md text-text-secondary hover:text-text-primary transition-colors"
            title="Git"
          >
            <span className="material-symbols-outlined text-[20px]">account_tree</span>
          </button>
          <button
            className="w-8 h-8 flex items-center justify-center rounded-md text-text-secondary hover:text-text-primary transition-colors"
            title="Extensions"
          >
            <span className="material-symbols-outlined text-[20px]">extension</span>
          </button>
          <div className="mt-auto flex flex-col gap-4">
            <button
              className="w-8 h-8 flex items-center justify-center rounded-md text-text-secondary hover:text-text-primary transition-colors"
              title="Account"
            >
              <span className="material-symbols-outlined text-[20px]">account_circle</span>
            </button>
            <button
              className="w-8 h-8 flex items-center justify-center rounded-md text-text-secondary hover:text-text-primary transition-colors"
              onClick={openSettings}
              title="Settings"
            >
              <span className="material-symbols-outlined text-[20px]">settings</span>
            </button>
          </div>
        </nav>

        {/* Left Sidebar: Explorer & Memory (w-64) */}
        {sidebarVisible && (
          <aside className="w-64 flex-shrink-0 bg-bg-onyx border-r border-border-subtle flex flex-col z-30">
            <Sidebar />
          </aside>
        )}

        {/* Center - Editor + Bottom Panel */}
        <main className="flex-1 flex flex-col min-w-0 bg-bg-onyx border-r border-border-subtle z-20">
          <div style={{ flex: 1, minHeight: 0 }}>
            <Suspense
              fallback={
                <div className="w-full h-full p-4 text-xs text-text-secondary">
                  loading...
                </div>
              }
            >
              <Editor />
            </Suspense>
          </div>

          {/* Bottom Panel */}
          {panelVisible && (
            <div
              style={{
                height: 240,
                flexShrink: 0,
                borderTop: "1px solid #282a2d",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Suspense
                fallback={
                  <div className="p-2 text-xs text-text-secondary uppercase tracking-widest">
                    loading panel...
                  </div>
                }
              >
                <Panel />
              </Suspense>
            </div>
          )}
        </main>

        {/* Right Sidebar: Agent Timeline Panel (w-[400px]) */}
        {agentPanelVisible && (
          <aside className="w-[400px] flex-shrink-0 bg-panel-bg flex flex-col z-10 relative">
            <Suspense fallback={null}>
              <AgentPanel />
            </Suspense>
          </aside>
        )}
      </div>

      <StatusBar />

      {/* ── Command Palette ── */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={closeCommandPalette}
        onCommandSelect={handleCommandSelect}
      />

      {/* ── Settings Panel ── */}
      {showSettings && (
        <Suspense fallback={null}>
          <SettingsPanel />
        </Suspense>
      )}
    </div>
  );
}

/* ─── Exported App with Error Boundary ─── */
export default function App() {
  return (
    <ErrorBoundary>
      <AppRoot />
    </ErrorBoundary>
  );
}
