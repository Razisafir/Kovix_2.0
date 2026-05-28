import {
  Files,
  GitBranch,
  Bot,
  Brain,
  Wrench,
  Plug,
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  FileJson,
  Settings,
  Plus,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  X,
} from "lucide-react";
import { useState } from "react";

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
  modified: "#d4a72c",
  agentModified: "#6366f1",
  error: "#ef4444",
};

interface RailItem {
  id: string;
  icon: React.ReactNode;
  badge?: number;
}

const railItems: RailItem[] = [
  { id: "files", icon: <Files size={16} />, badge: 0 },
  { id: "src", icon: <GitBranch size={16} />, badge: 3 },
  { id: "agt", icon: <Bot size={16} />, badge: 1 },
  { id: "mem", icon: <Brain size={16} />, badge: 1247 },
  { id: "skl", icon: <Wrench size={16} />, badge: 0 },
  { id: "mcp", icon: <Plug size={16} />, badge: 2 },
];

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
  { name: "package.json", type: "file", indent: 0, fileType: "json" },
  { name: "README.md", type: "file", indent: 0, fileType: "md" },
];

const activeContextTags = ["auth-flow", "api-integration", "ui-components"];

function Sidebar() {
  const [activeRail, setActiveRail] = useState("files");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(["src", "components"])
  );
  const [activeFile, setActiveFile] = useState("Sidebar.tsx");

  const toggleFolder = (name: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const getFileIcon = (node: FileNode) => {
    if (node.type === "folder") {
      return expandedFolders.has(node.name) ? (
        <FolderOpen size={12} style={{ color: COLORS.accent, flexShrink: 0 }} />
      ) : (
        <Folder size={12} style={{ color: COLORS.dim, flexShrink: 0 }} />
      );
    }
    if (node.fileType === "tsx" || node.fileType === "ts")
      return <FileCode size={12} style={{ color: COLORS.muted, flexShrink: 0 }} />;
    if (node.fileType === "json")
      return <FileJson size={12} style={{ color: COLORS.muted, flexShrink: 0 }} />;
    return <FileText size={12} style={{ color: COLORS.muted, flexShrink: 0 }} />;
  };

  const getModBadge = (mod?: string) => {
    if (!mod) return null;
    const color =
      mod === "M" ? COLORS.modified : mod === "A" ? COLORS.agentModified : COLORS.error;
    return (
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          color,
          marginLeft: 6,
          fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
        }}
      >
        [{mod}]
      </span>
    );
  };

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", backgroundColor: COLORS.base }}>
      {/* Left Icon Rail */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: 32,
          padding: "4px 0",
          backgroundColor: COLORS.surface1,
          borderRight: `1px solid ${COLORS.border}`,
          flexShrink: 0,
        }}
      >
        {railItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveRail(item.id)}
            title={item.id.toUpperCase()}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 26,
              height: 26,
              marginBottom: 2,
              borderRadius: 2,
              border: "none",
              cursor: "pointer",
              backgroundColor:
                activeRail === item.id ? COLORS.surface2 : "transparent",
              color:
                activeRail === item.id ? COLORS.textPrimary : COLORS.muted,
              transition: "background-color 100ms, color 100ms",
            }}
          >
            {item.icon}
            {item.badge ? (
              <span
                style={{
                  position: "absolute",
                  bottom: 2,
                  right: 2,
                  fontSize: 9,
                  fontWeight: 600,
                  lineHeight: 1,
                  padding: "0 3px",
                  borderRadius: 9999,
                  backgroundColor: COLORS.surface2,
                  color: COLORS.textSecondary,
                  fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
                }}
              >
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            ) : null}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          title="Settings"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 26,
            height: 26,
            marginBottom: 2,
            borderRadius: 2,
            border: "none",
            cursor: "pointer",
            backgroundColor: "transparent",
            color: COLORS.muted,
          }}
        >
          <Settings size={16} />
        </button>
      </div>

      {/* Main Content Area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          backgroundColor: COLORS.base,
        }}
      >
        {/* PROJECT Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            height: 28,
            padding: "0 8px",
            backgroundColor: COLORS.surface1,
            borderBottom: `1px solid ${COLORS.border}`,
            userSelect: "none",
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.08em",
              color: COLORS.muted,
              textTransform: "uppercase",
              flex: 1,
            }}
          >
            project: construct
          </span>
          <div style={{ display: "flex", gap: 2 }}>
            <button
              title="New File"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 20,
                height: 20,
                borderRadius: 2,
                border: "none",
                cursor: "pointer",
                backgroundColor: "transparent",
                color: COLORS.muted,
              }}
            >
              <Plus size={12} />
            </button>
            <button
              title="Refresh"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 20,
                height: 20,
                borderRadius: 2,
                border: "none",
                cursor: "pointer",
                backgroundColor: "transparent",
                color: COLORS.muted,
              }}
            >
              <RefreshCw size={12} />
            </button>
            <button
              title="Settings"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 20,
                height: 20,
                borderRadius: 2,
                border: "none",
                cursor: "pointer",
                backgroundColor: "transparent",
                color: COLORS.muted,
              }}
            >
              <Settings size={12} />
            </button>
          </div>
        </div>

        {/* File Tree */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "2px 0",
          }}
        >
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
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: 22,
                  paddingLeft: 8 + node.indent * 12,
                  paddingRight: 8,
                  cursor: "pointer",
                  backgroundColor: isActive ? COLORS.surface2 : "transparent",
                  borderLeft: isActive
                    ? `2px solid ${COLORS.accent}`
                    : "2px solid transparent",
                  transition: "background-color 50ms",
                }}
                onMouseEnter={(e) => {
                  if (!isActive)
                    (e.currentTarget as HTMLElement).style.backgroundColor =
                      COLORS.surface1;
                }}
                onMouseLeave={(e) => {
                  if (!isActive)
                    (e.currentTarget as HTMLElement).style.backgroundColor =
                      "transparent";
                }}
              >
                {isFolder ? (
                  isExpanded ? (
                    <ChevronDown
                      size={10}
                      style={{
                        color: COLORS.dim,
                        marginRight: 4,
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <ChevronRight
                      size={10}
                      style={{
                        color: COLORS.dim,
                        marginRight: 4,
                        flexShrink: 0,
                      }}
                    />
                  )
                ) : (
                  <div style={{ width: 14, flexShrink: 0 }} />
                )}
                {getFileIcon(node)}
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
                    color: isActive ? COLORS.textPrimary : COLORS.textSecondary,
                    marginLeft: 4,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {node.name}
                </span>
                {getModBadge(node.mod)}
              </div>
            );
          })}
        </div>

        {/* ACTIVE CONTEXT Section */}
        <div
          style={{
            borderTop: `1px solid ${COLORS.border}`,
            padding: "6px 8px",
            backgroundColor: COLORS.surface1,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.08em",
              color: COLORS.muted,
              textTransform: "uppercase",
              marginBottom: 6,
              userSelect: "none",
            }}
          >
            active context
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {activeContextTags.map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: 10,
                  padding: "2px 6px",
                  borderRadius: 2,
                  backgroundColor: COLORS.surface2,
                  color: COLORS.textSecondary,
                  fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
                  letterSpacing: "0.02em",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* MEMORY Stats */}
        <div
          style={{
            borderTop: `1px solid ${COLORS.border}`,
            padding: "4px 8px",
            backgroundColor: COLORS.surface1,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
              color: COLORS.dim,
              letterSpacing: "0.02em",
            }}
          >
            memory: 1,247 contexts
          </div>
        </div>
      </div>
    </div>
  );
}

export default Sidebar;
