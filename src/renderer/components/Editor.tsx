import { Editor as MonacoEditor, loader } from "@monaco-editor/react";
import { useState, useCallback, useMemo, useRef } from "react";
import TabBar, { type EditorTab } from "./TabBar";

loader.config({
  paths: {
    vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min/vs",
  },
});

/* ─────────────────────── custom monaco theme ─────────────────────── */

const CONSTRUCT_THEME_ID = "construct-dark";

const CONSTRUCT_THEME = {
  base: "vs-dark" as const,
  inherit: true,
  rules: [
    { token: "comment", foreground: "849495", fontStyle: "italic" },
    { token: "keyword", foreground: "c678dd" },
    { token: "keyword.control", foreground: "c678dd" },
    { token: "string", foreground: "98c379" },
    { token: "string.escape", foreground: "e5c07b" },
    { token: "number", foreground: "d19a66" },
    { token: "type", foreground: "e5c07b" },
    { token: "type.identifier", foreground: "e5c07b" },
    { token: "function", foreground: "61afef" },
    { token: "variable", foreground: "e2e2e6" },
    { token: "variable.predefined", foreground: "e5c07b" },
    { token: "operator", foreground: "c678dd" },
    { token: "delimiter", foreground: "849495" },
    { token: "tag", foreground: "e06c75" },
    { token: "attribute.name", foreground: "d19a66" },
    { token: "attribute.value", foreground: "98c379" },
    { token: "meta.decorator", foreground: "61afef" },
    { token: "regexp", foreground: "98c379" },
  ],
  colors: {
    "editor.background": "#0c0e11",
    "editor.foreground": "#e2e2e6",
    "editor.lineHighlightBackground": "#1e2023",
    "editor.selectionBackground": "rgba(0, 245, 255, 0.15)",
    "editor.inactiveSelectionBackground": "rgba(0, 245, 255, 0.08)",
    "editorLineNumber.foreground": "#84949580",
    "editorLineNumber.activeForeground": "#849495",
    "editorLineNumber.background": "#0c0e11",
    "editorCursor.foreground": "#00f5ff",
    "editor.findMatchBackground": "rgba(0, 245, 255, 0.2)",
    "editor.findMatchHighlightBackground": "rgba(0, 245, 255, 0.08)",
    "editorIndentGuide.background": "#282a2d",
    "editorIndentGuide.activeBackground": "#3a494a",
    "editorBracketMatch.background": "rgba(0, 245, 255, 0.1)",
    "editorBracketMatch.border": "rgba(0, 245, 255, 0.3)",
    "editorOverviewRuler.border": "#0c0e11",
    "editorGutter.background": "#0c0e11",
    "editorGutter.border": "#282a2d",
    "scrollbarSlider.background": "#282a2d80",
    "scrollbarSlider.hoverBackground": "#3a494a",
    "scrollbarSlider.activeBackground": "#3a494a",
    "editorWidget.background": "#141619",
    "editorWidget.border": "#282a2d",
    "editorSuggestWidget.background": "#141619",
    "editorSuggestWidget.border": "#282a2d",
    "editorSuggestWidget.selectedBackground": "#1e2023",
    "editorSuggestWidget.highlightForeground": "#00f5ff",
    "peekViewEditor.background": "#0c0e11",
    "peekViewResult.background": "#141619",
    "minimap.background": "#0c0e11",
  },
};

/* ─────────────────────── default code ─────────────────────── */

const defaultCode = `import { useState } from "react";

interface Props {
  title: string;
  count?: number;
}

# Construct — autonomous API agent
# memory: SQLite + ChromaDB

from fastapi import FastAPI, Request
from contextlib import asynccontextmanager
from .memory import MemoryStore
from .agent import Agent

memory = MemoryStore(db_path="memories.db")

@asynccontextmanager
async def lifespan(app: FastAPI):
    await memory.init()
    yield

    # agent writes proposed diffs here
    app.state.pending_diff = []

app = FastAPI(lifespan=lifespan)

@app.websocket("/ws/agent")
async def agent_stream(ws):
    await ws.accept()
    ctx = await memory.get_context()
`;

/* ─────────────────────── tab helpers ─────────────────────── */

let tabIdCounter = 0;

function createTab(
  fileName: string,
  filePath: string,
  language: string,
  content: string,
  isModified: boolean = false
): EditorTab {
  return {
    id: `tab-${++tabIdCounter}-${Date.now().toString(36)}`,
    fileName,
    filePath,
    language,
    content,
    isModified,
    isActive: false,
  };
}

/* ─────────────────────── main component ─────────────────────── */

function Editor() {
  const [tabs, setTabs] = useState<EditorTab[]>(() => [
    createTab("main.py", "src/main.py", "python", defaultCode, true),
    createTab("agent.py", "src/agent.py", "python", "# Agent component code\n", true),
    createTab("main.tsx", "src/main.tsx", "typescript", "// main entry point\n", false),
  ]);

  const themeDefined = useRef(false);

  useState(() => {
    setTabs((prev) =>
      prev.map((t, i) => ({ ...t, isActive: i === 0 }))
    );
  });

  const activeTab = useMemo(
    () => tabs.find((t) => t.isActive) ?? tabs[0] ?? null,
    [tabs]
  );

  const activeTabId = activeTab?.id ?? null;

  const activateTab = useCallback((id: string) => {
    setTabs((prev) =>
      prev.map((t) => ({ ...t, isActive: t.id === id }))
    );
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      if (prev.length <= 1) {
        const onlyTab = prev[0];
        if (onlyTab) {
          return [{ ...onlyTab, isModified: false, isActive: true }];
        }
        return prev;
      }
      const idx = prev.findIndex((t) => t.id === id);
      const wasActive = prev[idx]?.isActive ?? false;
      const remaining = prev.filter((t) => t.id !== id);
      if (wasActive && remaining.length > 0) {
        const newIdx = Math.min(idx, remaining.length - 1);
        remaining[newIdx] = { ...remaining[newIdx], isActive: true };
      }
      return remaining;
    });
  }, []);

  const openTab = useCallback(
    (file: {
      fileName: string;
      filePath: string;
      language?: string;
      content?: string;
    }) => {
      setTabs((prev) => {
        const existing = prev.find((t) => t.filePath === file.filePath);
        if (existing) {
          return prev.map((t) => ({
            ...t,
            isActive: t.id === existing.id,
          }));
        }
        const newTab = createTab(
          file.fileName,
          file.filePath,
          file.language ?? "typescript",
          file.content ?? "",
          false
        );
        return [...prev.map((t) => ({ ...t, isActive: false })), { ...newTab, isActive: true }];
      });
    },
    []
  );

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (!activeTab) return;
      const newContent = value ?? "";
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTab.id
            ? { ...t, content: newContent, isModified: true }
            : t
        )
      );
    },
    [activeTab]
  );

  const handleBeforeMount = useCallback((monaco: Parameters<NonNullable<import("@monaco-editor/react").EditorProps["beforeMount"]>>[0]) => {
    if (!themeDefined.current) {
      monaco.editor.defineTheme(CONSTRUCT_THEME_ID, CONSTRUCT_THEME);
      themeDefined.current = true;
    }
  }, []);

  const handleOnMount = useCallback((_editor: import("monaco-editor").editor.IStandaloneCodeEditor, monaco: typeof import("monaco-editor")) => {
    if (!themeDefined.current) {
      monaco.editor.defineTheme(CONSTRUCT_THEME_ID, CONSTRUCT_THEME);
      themeDefined.current = true;
    }
    monaco.editor.setTheme(CONSTRUCT_THEME_ID);
  }, []);

  const monacoOptions = useMemo(
    () => ({
      fontSize: 13,
      fontFamily: "'JetBrains Mono', monospace",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      lineNumbers: "on" as const,
      renderLineHighlight: "line" as const,
      tabSize: 2,
      insertSpaces: true,
      wordWrap: "on" as const,
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
      cursorStyle: "line" as const,
      cursorBlinking: "blink" as const,
      smoothScrolling: false,
      lineNumbersMinChars: 3,
      lineDecorationsWidth: 0,
    }),
    []
  );

  return (
    <div className="flex flex-col w-full h-full bg-bg-onyx font-mono">
      {/* ── Tab Bar ── */}
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onActivate={activateTab}
        onClose={closeTab}
        onOpen={openTab}
      />

      {/* ── Breadcrumb Path ── */}
      <div className="flex items-center h-6 px-3 shrink-0 bg-bg-onyx border-b border-border-subtle">
        <span className="text-[10px] font-mono text-c-text4 tracking-wide whitespace-nowrap overflow-hidden text-ellipsis">
          {activeTab?.filePath ?? "no file open"}
        </span>
        {activeTab?.isModified && (
          <span className="ml-2 text-[9px] font-mono text-accent-cyan">
            ● modified
          </span>
        )}
      </div>

      {/* ── Monaco Editor ── */}
      <div className="flex-1 min-h-0">
        <MonacoEditor
          key={activeTabId ?? "empty"}
          height="100%"
          language={activeTab?.language ?? "typescript"}
          theme={CONSTRUCT_THEME_ID}
          value={activeTab?.content ?? ""}
          onChange={handleEditorChange}
          beforeMount={handleBeforeMount}
          onMount={handleOnMount}
          options={monacoOptions}
          loading={
            <div className="flex items-center justify-center w-full h-full text-[11px] text-c-text4 font-mono">
              loading editor...
            </div>
          }
        />
      </div>
    </div>
  );
}

export default Editor;
