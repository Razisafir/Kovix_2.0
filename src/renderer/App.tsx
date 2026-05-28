import { lazy, Suspense } from "react";
import Sidebar from "./components/Sidebar";
import StatusBar from "./components/StatusBar";
import useAppStore from "./stores/useAppStore";

const Editor = lazy(() => import("./components/Editor"));
const Panel = lazy(() => import("./components/Panel"));

const COLORS = {
  base: "#0c0c10",
  surface1: "#12121a",
  border: "rgba(255,255,255,0.04)",
  textSecondary: "#94949c",
  accent: "#6366f1",
};

function App() {
  const sidebarVisible = useAppStore((s) => s.sidebarVisible);
  const panelVisible = useAppStore((s) => s.panelVisible);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100vw",
        height: "100vh",
        backgroundColor: COLORS.base,
        fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
        overflow: "hidden",
      }}
    >
      {/* Title Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 28,
          padding: "0 12px",
          backgroundColor: COLORS.surface1,
          borderBottom: `1px solid ${COLORS.border}`,
          flexShrink: 0,
          userSelect: "none",
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: COLORS.textSecondary,
            textTransform: "uppercase" as const,
          }}
        >
          Construct
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: "#6b6b73" }}>v0.1.0-alpha</span>
      </div>

      {/* Main Layout */}
      <div
        style={{
          display: "flex",
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {/* Sidebar */}
        {sidebarVisible && (
          <aside
            style={{
              width: 280,
              flexShrink: 0,
              display: "flex",
              borderRight: `1px solid ${COLORS.border}`,
              overflow: "hidden",
            }}
          >
            <Sidebar />
          </aside>
        )}

        {/* Center - Editor + Panel */}
        <main
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minWidth: 0,
          }}
        >
          <div style={{ flex: 1, minHeight: 0 }}>
            <Suspense
              fallback={
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    padding: 16,
                    fontSize: 11,
                    color: "#6b6b73",
                  }}
                >
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
                borderTop: `1px solid ${COLORS.border}`,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Suspense
                fallback={
                  <div
                    style={{
                      padding: 8,
                      fontSize: 10,
                      color: "#6b6b73",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    loading panel...
                  </div>
                }
              >
                <Panel />
              </Suspense>
            </div>
          )}
        </main>
      </div>

      <StatusBar />
    </div>
  );
}

export default App;
