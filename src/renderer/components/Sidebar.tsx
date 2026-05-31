import { useState } from "react";

interface FileNode {
  name: string;
  type: "file" | "folder";
  indent: number;
  expanded?: boolean;
  mod?: "M" | "A" | "E";
  fileType?: string;
}

const fileTree: FileNode[] = [
  { name: "src", type: "folder", indent: 0, expanded: true },
  { name: "components", type: "folder", indent: 1, expanded: true },
  { name: "Sidebar.tsx", type: "file", indent: 2, mod: "M", fileType: "tsx" },
  { name: "Editor.tsx", type: "file", indent: 2, mod: "A", fileType: "tsx" },
  { name: "Panel.tsx", type: "file", indent: 2, fileType: "tsx" },
  { name: "StatusBar.tsx", type: "file", indent: 2, mod: "E", fileType: "tsx" },
  { name: "App.tsx", type: "file", indent: 1, mod: "M", fileType: "tsx" },
  { name: "main.tsx", type: "file", indent: 1, fileType: "tsx" },
  { name: "tests", type: "folder", indent: 0, expanded: false },
  { name: "test_agent.py", type: "file", indent: 1, fileType: "py" },
  { name: "test_memory.py", type: "file", indent: 1, fileType: "py" },
  { name: "requirements.txt", type: "file", indent: 0, fileType: "txt" },
  { name: "README.md", type: "file", indent: 0, fileType: "md" },
];

const recentMemories = [
  { text: "Uses FastAPI + async routes", time: "2 days ago", dotColor: "bg-[#4ade80]" },
  { text: "Prefers snake_case, ruff for linting", time: "1 week ago", dotColor: "bg-[#60a5fa]" },
  { text: "Added ChromaDB for embeddings", time: "2 weeks ago", dotColor: "bg-[#facc15]" },
];

/** Returns a Tailwind bg-* class for the file status dot */
function dotClass(mod?: string): string {
  if (mod === "M") return "bg-[#facc15]"; // yellow — modified
  if (mod === "A") return "bg-[#4ade80]"; // green — clean / added
  if (mod === "E") return "bg-[#60a5fa]"; // blue — info / error
  return "bg-[#3a494a]"; // muted — no status
}

/** Returns a Tailwind text-* class for the mod badge */
function modBadgeClass(mod?: string): string {
  if (mod === "M") return "text-[#e9c349]";  // gold
  if (mod === "A") return "text-accent-cyan"; // cyan
  if (mod === "E") return "text-[#f87171]";   // red
  return "";
}

function Sidebar() {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(["src", "components"])
  );
  const [activeFile, setActiveFile] = useState("main.py");

  const toggleFolder = (name: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <aside className="flex flex-col h-full bg-bg-onyx border-r border-border-subtle glass-panel">
      {/* ── Explorer Header ── */}
      <div className="h-10 px-4 flex items-center justify-between border-b border-border-subtle">
        <span className="font-mono text-[10px] font-semibold tracking-widest uppercase text-text-secondary">
          MY-API-PROJECT
        </span>
        <span className="material-symbols-outlined text-[16px] cursor-pointer text-text-secondary hover:text-text-primary transition-colors">
          more_horiz
        </span>
      </div>

      {/* ── File Tree ── */}
      <div className="flex-1 overflow-auto py-2 font-mono text-sm">
        <div className="flex flex-col gap-[2px]">
          {fileTree.map((node) => {
            const isFolder = node.type === "folder";
            const isExpanded = expandedFolders.has(node.name);
            const isActive = activeFile === node.name;

            return (
              <div
                key={node.name + node.indent}
                onClick={() => {
                  if (isFolder) toggleFolder(node.name);
                  else setActiveFile(node.name);
                }}
                className={
                  "flex items-center cursor-pointer border-l-2 transition-colors duration-[50ms] " +
                  (isActive
                    ? "border-accent-cyan bg-white/5 text-text-primary"
                    : "border-transparent hover:bg-white/5 text-text-secondary")
                }
                style={{
                  height: 26,
                  paddingLeft: 16 + node.indent * 16,
                  paddingRight: 8,
                }}
              >
                {isFolder ? (
                  <span className="material-symbols-outlined text-[16px] mr-1 text-[#3a494a]">
                    {isExpanded ? "arrow_drop_down" : "arrow_right"}
                  </span>
                ) : (
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 mr-2 ${dotClass(node.mod)}`}
                  />
                )}
                <span className="truncate text-[13px]">
                  {isFolder ? node.name + "/" : node.name}
                </span>
                {node.mod && (
                  <span
                    className={`text-[9px] font-semibold ml-[6px] font-mono ${modBadgeClass(node.mod)}`}
                  >
                    [{node.mod}]
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Recent Memory Section ── */}
      <div className="h-64 border-t border-border-subtle flex flex-col">
        <div className="h-10 px-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-accent-gold">
            memory
          </span>
          <span className="font-mono text-[10px] font-semibold tracking-widest uppercase text-text-secondary">
            RECENT MEMORY
          </span>
        </div>
        <div className="flex-1 overflow-auto p-4 flex flex-col gap-4">
          {recentMemories.map((mem, i) => (
            <div key={i} className="flex gap-3">
              <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${mem.dotColor}`} />
              <div>
                <div className="text-sm text-text-primary">{mem.text}</div>
                <div className="text-xs text-text-secondary mt-1">{mem.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
