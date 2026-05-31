import { useState, useCallback } from "react";

/* ─── Types ─── */
interface MCPTool {
  name: string;
  description: string;
}

interface MCPConnection {
  id: string;
  name: string;
  serverUrl: string;
  status: "online" | "offline" | "degraded";
  tools: MCPTool[];
  lastUsed: string;
  health: number;
  latency?: string;
  lastError?: string;
}

/* ─── Demo Data ─── */
const demoConnections: MCPConnection[] = [
  { id: "1", name: "github", serverUrl: "https://api.github.com", status: "online", lastUsed: "2m ago", health: 100, latency: "120ms", tools: [
    { name: "list_repos", description: "List all repositories" }, { name: "create_issue", description: "Create a new issue" }, { name: "get_file", description: "Get file contents" }, { name: "create_pr", description: "Create a pull request" }, { name: "merge_pr", description: "Merge a pull request" }, { name: "list_commits", description: "List recent commits" },
  ]},
  { id: "2", name: "stripe", serverUrl: "https://api.stripe.com", status: "online", lastUsed: "5m ago", health: 100, latency: "85ms", tools: [
    { name: "create_customer", description: "Create a new customer" }, { name: "create_charge", description: "Create a charge" }, { name: "create_subscription", description: "Create subscription" },
  ]},
  { id: "3", name: "figma", serverUrl: "https://api.figma.com", status: "offline", lastUsed: "1h ago", health: 0, latency: "--", lastError: "Connection timeout after 30s", tools: [
    { name: "get_file", description: "Get Figma file" }, { name: "get_components", description: "Get components" },
  ]},
  { id: "4", name: "slack", serverUrl: "https://slack.com/api", status: "degraded", lastUsed: "12m ago", health: 67, latency: "3400ms", lastError: "Elevated latency detected", tools: [
    { name: "post_message", description: "Post message to channel" }, { name: "get_channels", description: "List channels" },
  ]},
  { id: "5", name: "supabase", serverUrl: "https://api.supabase.io", status: "online", lastUsed: "8m ago", health: 100, latency: "45ms", tools: [
    { name: "query_db", description: "Execute SQL query" }, { name: "insert_record", description: "Insert a record" },
  ]},
];

export default function MCPConnector() {
  const [connections, setConnections] = useState<MCPConnection[]>(demoConnections);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const selected = connections.find((c) => c.id === selectedId) || null;

  const handleAdd = useCallback(() => {
    if (!newName.trim() || !newUrl.trim()) return;
    const conn: MCPConnection = {
      id: `conn-${Date.now()}`, name: newName.trim().toLowerCase(), serverUrl: newUrl.trim(),
      status: "offline", lastUsed: "never", health: 0, latency: "--", tools: [],
    };
    setConnections((prev) => [...prev, conn]);
    setNewName(""); setNewUrl(""); setShowAdd(false);
  }, [newName, newUrl]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "online": return "var(--c-running)";
      case "offline": return "var(--c-err)";
      case "degraded": return "var(--c-gold)";
      default: return "var(--c-text3)";
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden font-mono bg-c-base text-c-text">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 shrink-0" style={{ borderBottom: "1px solid var(--c-border)", background: "var(--c-s1)" }}>
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--c-text2)" }}>MCP Connectors</span>
        <button onClick={() => setShowAdd(!showAdd)} className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider font-medium border-none rounded-sm cursor-pointer" style={{ background: "var(--c-s2)", color: "var(--c-text)" }}>
          {showAdd ? "CANCEL" : "ADD"}
        </button>
      </div>

      {/* Add Form */}
      {showAdd && (
        <div className="flex items-center gap-2 px-3 py-2 shrink-0" style={{ borderBottom: "1px solid var(--c-border)", background: "var(--c-s1)" }}>
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="name" className="px-2 py-1 text-[11px] font-mono outline-none" style={{ width: "120px", background: "var(--c-base)", color: "var(--c-text)", border: "1px solid var(--c-border)" }} />
          <input type="text" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://api.example.com" className="flex-1 px-2 py-1 text-[11px] font-mono outline-none" style={{ background: "var(--c-base)", color: "var(--c-text)", border: "1px solid var(--c-border)" }} />
          <button onClick={handleAdd} disabled={!newName.trim() || !newUrl.trim()} className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider font-medium border-none rounded-sm" style={{ background: "var(--c-s2)", color: newName.trim() && newUrl.trim() ? "var(--c-accent)" : "var(--c-text3)", cursor: newName.trim() && newUrl.trim() ? "pointer" : "default" }}>ADD</button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <div className="flex items-center sticky top-0 z-[1]" style={{ borderBottom: "1px solid var(--c-border)", background: "var(--c-s1)" }}>
          {["NAME", "STATUS", "TOOLS", "LAST-USED", "HEALTH"].map((h) => (
            <div key={h} className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider whitespace-nowrap" style={{ flex: h === "NAME" ? 1.5 : 1, color: "var(--c-text3)" }}>{h}</div>
          ))}
        </div>
        {connections.map((conn) => {
          const isSelected = selectedId === conn.id;
          return (
            <div key={conn.id} onClick={() => setSelectedId(isSelected ? null : conn.id)} className="flex items-center cursor-pointer" style={{ background: isSelected ? "var(--c-s2)" : "var(--c-base)", borderLeft: isSelected ? "2px solid var(--c-accent)" : "2px solid transparent" }}
              onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "var(--c-s2)"; }}
              onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "var(--c-base)"; }}>
              <div className="px-2 py-1.5 text-[11px] font-mono overflow-hidden text-ellipsis whitespace-nowrap" style={{ flex: 1.5, color: "var(--c-text)" }}>{conn.name}</div>
              <div className="px-2 py-1.5 text-[11px] font-mono lowercase" style={{ flex: 1, color: getStatusColor(conn.status) }}>{conn.status}</div>
              <div className="px-2 py-1.5 text-[11px] font-mono" style={{ flex: 1, color: "var(--c-text2)" }}>{conn.tools.length}</div>
              <div className="px-2 py-1.5 text-[11px] font-mono" style={{ flex: 1, color: "var(--c-text3)" }}>{conn.lastUsed}</div>
              <div className="px-2 py-1.5 text-[11px] font-mono" style={{ flex: 1, color: conn.health >= 90 ? "var(--c-running)" : conn.health >= 50 ? "var(--c-gold)" : "var(--c-err)" }}>{conn.health}%</div>
            </div>
          );
        })}
      </div>

      {/* Selected Detail Panel */}
      {selected && (
        <div className="shrink-0 max-h-[220px] overflow-auto" style={{ background: "var(--c-s2)", borderTop: "1px solid var(--c-border)" }}>
          <div className="flex items-center justify-between px-3 py-1.5" style={{ borderBottom: "1px solid var(--c-border)" }}>
            <span className="text-[11px] font-semibold" style={{ color: "var(--c-text)" }}>{selected.name}</span>
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-mono lowercase" style={{ color: getStatusColor(selected.status) }}>{selected.status}</span>
              <button onClick={() => setSelectedId(null)} className="text-[10px] bg-none border-none cursor-pointer font-mono" style={{ color: "var(--c-text3)" }}>x</button>
            </div>
          </div>
          <div className="flex gap-5 px-3 py-1.5" style={{ borderBottom: "1px solid var(--c-border)" }}>
            <div><span className="text-[9px] uppercase tracking-wider" style={{ color: "var(--c-text4)" }}>URL</span><div className="text-[11px] font-mono" style={{ color: "var(--c-text2)" }}>{selected.serverUrl}</div></div>
            <div><span className="text-[9px] uppercase tracking-wider" style={{ color: "var(--c-text4)" }}>LATENCY</span><div className="text-[11px] font-mono" style={{ color: "var(--c-text2)" }}>{selected.latency || "--"}</div></div>
            <div><span className="text-[9px] uppercase tracking-wider" style={{ color: "var(--c-text4)" }}>HEALTH</span><div className="text-[11px] font-mono" style={{ color: selected.health >= 90 ? "var(--c-running)" : selected.health >= 50 ? "var(--c-gold)" : "var(--c-err)" }}>{selected.health}%</div></div>
            {selected.lastError && <div><span className="text-[9px] uppercase tracking-wider" style={{ color: "var(--c-text4)" }}>LAST ERROR</span><div className="text-[11px]" style={{ color: "var(--c-err)" }}>{selected.lastError}</div></div>}
          </div>
          <div className="px-3 py-1.5">
            <div className="text-[10px] font-medium uppercase tracking-wider mb-1.5" style={{ color: "var(--c-text3)" }}>Tools ({selected.tools.length})</div>
            {selected.tools.length === 0 ? <div className="text-[11px]" style={{ color: "var(--c-text3)" }}>No tools available</div> : (
              <div className="grid gap-px" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
                {selected.tools.map((tool) => (
                  <div key={tool.name} className="px-2 py-1 flex flex-col gap-[2px]" style={{ background: "var(--c-s3)" }}>
                    <span className="text-[10px] font-mono overflow-hidden text-ellipsis whitespace-nowrap" style={{ color: "var(--c-text)" }}>{tool.name}</span>
                    <span className="text-[9px] overflow-hidden text-ellipsis whitespace-nowrap" style={{ color: "var(--c-text3)" }}>{tool.description}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
