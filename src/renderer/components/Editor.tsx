import { Editor as MonacoEditor, loader } from "@monaco-editor/react";
import { useState, useCallback } from "react";
import { X, FileCode } from "lucide-react";

loader.config({
  paths: {
    vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min/vs",
  },
});

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
};

interface Tab {
  id: string;
  name: string;
  path: string;
  language: string;
  active: boolean;
  modified: boolean;
}

const defaultCode = `import { useState } from "react";

interface Props {
  title: string;
  count?: number;
}

// agent: reviewing component structure for memoization opportunities
export default function Example({ title, count = 0 }: Props) {
  const [value, setValue] = useState(count);

  // mem: previous implementation used useCallback here - unnecessary for this case
  const handleIncrement = () => setValue((v) => v + 1);

  // agent-suggest: consider extracting this to a separate component
  return (
    <div className="p-4">
      <h1>{title}</h1>
      <p>Count: {value}</p>
      <button onClick={handleIncrement}>
        Increment
      </button>
    </div>
  );
}
`;

const initialTabs: Tab[] = [
  {
    id: "1",
    name: "App.tsx",
    path: "src/App.tsx",
    language: "typescript",
    active: true,
    modified: true,
  },
  {
    id: "2",
    name: "Sidebar.tsx",
    path: "src/components/Sidebar.tsx",
    language: "typescript",
    active: false,
    modified: true,
  },
  {
    id: "3",
    name: "main.tsx",
    path: "src/main.tsx",
    language: "typescript",
    active: false,
    modified: false,
  },
];

function Editor() {
  const [tabs, setTabs] = useState<Tab[]>(initialTabs);
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState(defaultCode);

  const activeTab = tabs.find((t) => t.active) ?? tabs[0];

  const activateTab = useCallback((id: string) => {
    setTabs((prev) =>
      prev.map((t) => ({ ...t, active: t.id === id }))
    );
  }, []);

  const closeTab = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setTabs((prev) => {
        if (prev.length <= 1) return prev;
        const idx = prev.findIndex((t) => t.id === id);
        const next = prev.filter((t) => t.id !== id);
        if (prev[idx]?.active && next.length > 0) {
          const newIdx = Math.min(idx, next.length - 1);
          next[newIdx] = { ...next[newIdx], active: true };
        }
        return next;
      });
    },
    []
  );

  const handleEditorChange = useCallback((value: string | undefined) => {
    setEditorContent(value ?? "");
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: COLORS.base,
      }}
    >
      {/* Tab Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 28,
          backgroundColor: COLORS.surface1,
          borderBottom: `1px solid ${COLORS.border}`,
          overflowX: "auto",
          flexShrink: 0,
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.active;
          const showClose = hoveredTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => activateTab(tab.id)}
              onMouseEnter={() => setHoveredTab(tab.id)}
              onMouseLeave={() => setHoveredTab(null)}
              style={{
                display: "flex",
                alignItems: "center",
                height: "100%",
                padding: "0 10px",
                gap: 6,
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
                fontSize: 11,
                transition: "background-color 50ms",
                position: "relative",
              }}
            >
              <FileCode size={12} style={{ flexShrink: 0 }} />
              <span>{tab.name}</span>
              {tab.modified && (
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    backgroundColor: COLORS.accent,
                    flexShrink: 0,
                  }}
                />
              )}
              <span
                onClick={(e) => closeTab(tab.id, e)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 14,
                  height: 14,
                  marginLeft: 2,
                  opacity: showClose ? 1 : 0,
                  transition: "opacity 50ms",
                  flexShrink: 0,
                }}
              >
                <X size={12} />
              </span>
            </button>
          );
        })}
      </div>

      {/* Breadcrumb Path */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 22,
          padding: "0 12px",
          backgroundColor: COLORS.base,
          borderBottom: `1px solid ${COLORS.border}`,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
            color: COLORS.dim,
            letterSpacing: "0.02em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {activeTab?.path || "src/App.tsx"}
        </span>
      </div>

      {/* Monaco Editor */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <MonacoEditor
          height="100%"
          language="typescript"
          theme="vs-dark"
          value={editorContent}
          onChange={handleEditorChange}
          options={{
            fontSize: 12,
            fontFamily: "'Geist Mono', 'JetBrains Mono', monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            lineNumbers: "on",
            renderLineHighlight: "line",
            tabSize: 2,
            insertSpaces: true,
            wordWrap: "on",
            folding: true,
            bracketPairColorization: { enabled: true },
            guides: {
              bracketPairs: true,
              indentation: true,
            },
            scrollbar: {
              useShadows: false,
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
            padding: { top: 8 },
            cursorStyle: "line",
            cursorBlinking: "blink",
            smoothScrolling: false,
            lineNumbersMinChars: 3,
            lineDecorationsWidth: 0,
          }}
          loading={
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                height: "100%",
                fontSize: 11,
                color: COLORS.dim,
                fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
              }}
            >
              loading editor...
            </div>
          }
        />
      </div>
    </div>
  );
}

export default Editor;
