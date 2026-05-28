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

/* ─── Colors ─── */
const BASE = "#0c0c10";
const S1 = "#12121a";
const S2 = "#1a1a24";
const S3 = "#22222e";
const ACCENT = "#6366f1";
const TEXT = "#e8e8ec";
const TEXT_MUTED = "#94949c";
const TEXT_DIM = "#6b6b73";
const TEXT_FAINT = "#4a4a52";
const BORDER = "rgba(255,255,255,0.04)";
const GREEN = "#22c55e";
const RED = "#ef4444";
const AMBER = "#f59e0b";
const ff = '"Geist Mono", "JetBrains Mono", monospace';

/* ─── Demo Data ─── */
const demoConnections: MCPConnection[] = [
  {
    id: "1",
    name: "github",
    serverUrl: "https://api.github.com",
    status: "online",
    lastUsed: "2m ago",
    health: 100,
    latency: "120ms",
    tools: [
      { name: "list_repos", description: "List all repositories" },
      { name: "create_issue", description: "Create a new issue" },
      { name: "get_file", description: "Get file contents" },
      { name: "create_pr", description: "Create a pull request" },
      { name: "merge_pr", description: "Merge a pull request" },
      { name: "list_commits", description: "List recent commits" },
      { name: "get_repo", description: "Get repository details" },
      { name: "list_branches", description: "List branches" },
      { name: "create_branch", description: "Create a new branch" },
      { name: "list_releases", description: "List releases" },
      { name: "create_release", description: "Create a release" },
      { name: "list_workflows", description: "List CI workflows" },
      { name: "trigger_workflow", description: "Trigger workflow run" },
      { name: "list_collaborators", description: "List collaborators" },
      { name: "add_collaborator", description: "Add collaborator" },
      { name: "create_repo", description: "Create new repository" },
      { name: "delete_repo", description: "Delete repository" },
      { name: "fork_repo", description: "Fork a repository" },
      { name: "star_repo", description: "Star a repository" },
      { name: "list_stargazers", description: "List stargazers" },
      { name: "create_webhook", description: "Create webhook" },
      { name: "list_webhooks", description: "List webhooks" },
      { name: "get_rate_limit", description: "Check rate limit" },
      { name: "search_code", description: "Search code" },
      { name: "search_issues", description: "Search issues" },
    ],
  },
  {
    id: "2",
    name: "stripe",
    serverUrl: "https://api.stripe.com",
    status: "online",
    lastUsed: "5m ago",
    health: 100,
    latency: "85ms",
    tools: [
      { name: "create_customer", description: "Create a new customer" },
      { name: "create_charge", description: "Create a charge" },
      { name: "create_subscription", description: "Create subscription" },
      { name: "refund", description: "Process a refund" },
      { name: "get_customer", description: "Get customer details" },
      { name: "list_customers", description: "List all customers" },
      { name: "create_invoice", description: "Create an invoice" },
      { name: "get_balance", description: "Get account balance" },
      { name: "create_product", description: "Create a product" },
      { name: "create_price", description: "Create a price" },
      { name: "list_invoices", description: "List invoices" },
      { name: "cancel_subscription", description: "Cancel subscription" },
      { name: "update_customer", description: "Update customer" },
      { name: "create_coupon", description: "Create coupon" },
      { name: "list_charges", description: "List charges" },
    ],
  },
  {
    id: "3",
    name: "figma",
    serverUrl: "https://api.figma.com",
    status: "offline",
    lastUsed: "1h ago",
    health: 0,
    latency: "--",
    lastError: "Connection timeout after 30s",
    tools: [
      { name: "get_file", description: "Get Figma file" },
      { name: "get_components", description: "Get components" },
      { name: "export_image", description: "Export node as image" },
      { name: "get_comments", description: "Get file comments" },
      { name: "post_comment", description: "Post a comment" },
      { name: "get_team_projects", description: "Get team projects" },
      { name: "get_project_files", description: "Get project files" },
      { name: "get_styles", description: "Get published styles" },
      { name: "get_components_set", description: "Get component set" },
      { name: "search_files", description: "Search files" },
      { name: "get_file_versions", description: "Get file versions" },
      { name: "delete_comment", description: "Delete comment" },
    ],
  },
  {
    id: "4",
    name: "slack",
    serverUrl: "https://slack.com/api",
    status: "degraded",
    lastUsed: "12m ago",
    health: 67,
    latency: "3400ms",
    lastError: "Elevated latency detected",
    tools: [
      { name: "post_message", description: "Post message to channel" },
      { name: "get_channels", description: "List channels" },
      { name: "get_users", description: "List workspace users" },
      { name: "get_conversations", description: "List conversations" },
      { name: "upload_file", description: "Upload file" },
      { name: "update_message", description: "Update message" },
      { name: "delete_message", description: "Delete message" },
      { name: "get_reactions", description: "Get message reactions" },
      { name: "add_reaction", description: "Add reaction" },
      { name: "create_channel", description: "Create channel" },
    ],
  },
  {
    id: "5",
    name: "supabase",
    serverUrl: "https://api.supabase.io",
    status: "online",
    lastUsed: "8m ago",
    health: 100,
    latency: "45ms",
    tools: [
      { name: "query_db", description: "Execute SQL query" },
      { name: "insert_record", description: "Insert a record" },
      { name: "auth_user", description: "Manage auth users" },
      { name: "storage_upload", description: "Upload file to storage" },
      { name: "storage_download", description: "Download file" },
      { name: "rpc", description: "Call RPC function" },
      { name: "subscribe", description: "Subscribe to realtime changes" },
      { name: "backup", description: "Trigger backup" },
    ],
  },
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
      id: `conn-${Date.now()}`,
      name: newName.trim().toLowerCase(),
      serverUrl: newUrl.trim(),
      status: "offline",
      lastUsed: "never",
      health: 0,
      latency: "--",
      tools: [],
    };
    setConnections((prev) => [...prev, conn]);
    setNewName("");
    setNewUrl("");
    setShowAdd(false);
  }, [newName, newUrl]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "online":
        return GREEN;
      case "offline":
        return RED;
      case "degraded":
        return AMBER;
      default:
        return TEXT_DIM;
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        fontFamily: ff,
        background: BASE,
        color: TEXT,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: `1px solid ${BORDER}`,
          flexShrink: 0,
          background: S1,
        }}
      >
        <span
          style={{
            fontSize: "10px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: TEXT_MUTED,
          }}
        >
          MCP Connectors
        </span>
        <button
          onClick={() => setShowAdd(!showAdd)}
          style={{
            padding: "4px 10px",
            fontSize: "10px",
            fontFamily: ff,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontWeight: 500,
            background: S2,
            color: TEXT,
            border: "none",
            borderRadius: "2px",
            cursor: "pointer",
          }}
        >
          {showAdd ? "CANCEL" : "ADD"}
        </button>
      </div>

      {/* Add Form */}
      {showAdd && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 12px",
            borderBottom: `1px solid ${BORDER}`,
            flexShrink: 0,
            background: S1,
          }}
        >
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="name"
            style={{
              width: "120px",
              padding: "4px 8px",
              fontSize: "11px",
              fontFamily: ff,
              background: BASE,
              color: TEXT,
              border: `1px solid ${BORDER}`,
              outline: "none",
            }}
          />
          <input
            type="text"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://api.example.com"
            style={{
              flex: 1,
              padding: "4px 8px",
              fontSize: "11px",
              fontFamily: ff,
              background: BASE,
              color: TEXT,
              border: `1px solid ${BORDER}`,
              outline: "none",
            }}
          />
          <button
            onClick={handleAdd}
            disabled={!newName.trim() || !newUrl.trim()}
            style={{
              padding: "4px 10px",
              fontSize: "10px",
              fontFamily: ff,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 500,
              background: S2,
              color: newName.trim() && newUrl.trim() ? ACCENT : TEXT_DIM,
              border: "none",
              borderRadius: "2px",
              cursor: newName.trim() && newUrl.trim() ? "pointer" : "default",
            }}
          >
            ADD
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {/* Table Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            borderBottom: `1px solid ${BORDER}`,
            position: "sticky",
            top: 0,
            zIndex: 1,
            background: S1,
          }}
        >
          {["NAME", "STATUS", "TOOLS", "LAST-USED", "HEALTH"].map((h) => (
            <div
              key={h}
              style={{
                flex: h === "NAME" ? 1.5 : h === "HEALTH" ? 1 : 1,
                padding: "6px 8px",
                fontSize: "10px",
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: TEXT_DIM,
                whiteSpace: "nowrap",
              }}
            >
              {h}
            </div>
          ))}
        </div>

        {/* Rows */}
        {connections.map((conn) => {
          const isSelected = selectedId === conn.id;
          return (
            <div
              key={conn.id}
              onClick={() => setSelectedId(isSelected ? null : conn.id)}
              style={{
                display: "flex",
                alignItems: "center",
                cursor: "pointer",
                background: isSelected ? S2 : BASE,
                borderLeft: isSelected ? `2px solid ${ACCENT}` : "2px solid transparent",
              }}
              onMouseEnter={(e) => {
                if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = S2;
              }}
              onMouseLeave={(e) => {
                if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = BASE;
              }}
            >
              {/* NAME */}
              <div
                style={{
                  flex: 1.5,
                  padding: "6px 8px",
                  fontSize: "11px",
                  color: TEXT,
                  fontFamily: ff,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {conn.name}
              </div>
              {/* STATUS */}
              <div
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  fontSize: "11px",
                  color: getStatusColor(conn.status),
                  fontFamily: ff,
                  textTransform: "lowercase",
                }}
              >
                {conn.status}
              </div>
              {/* TOOLS */}
              <div
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  fontSize: "11px",
                  color: TEXT_MUTED,
                  fontFamily: ff,
                }}
              >
                {conn.tools.length}
              </div>
              {/* LAST-USED */}
              <div
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  fontSize: "11px",
                  color: TEXT_DIM,
                  fontFamily: ff,
                }}
              >
                {conn.lastUsed}
              </div>
              {/* HEALTH */}
              <div
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  fontSize: "11px",
                  color:
                    conn.health >= 90
                      ? GREEN
                      : conn.health >= 50
                        ? AMBER
                        : RED,
                  fontFamily: ff,
                }}
              >
                {conn.health}%
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Detail Panel */}
      {selected && (
        <div
          style={{
            flexShrink: 0,
            maxHeight: "220px",
            overflow: "auto",
            background: S2,
            borderTop: `1px solid ${BORDER}`,
          }}
        >
          {/* Detail Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 12px",
              borderBottom: `1px solid ${BORDER}`,
            }}
          >
            <span style={{ fontSize: "11px", fontWeight: 600, color: TEXT }}>
              {selected.name}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span
                style={{
                  fontSize: "11px",
                  color: getStatusColor(selected.status),
                  fontFamily: ff,
                  textTransform: "lowercase",
                }}
              >
                {selected.status}
              </span>
              <button
                onClick={() => setSelectedId(null)}
                style={{
                  fontSize: "10px",
                  color: TEXT_DIM,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: ff,
                }}
              >
                x
              </button>
            </div>
          </div>

          {/* Meta Row */}
          <div
            style={{
              display: "flex",
              gap: "20px",
              padding: "6px 12px",
              borderBottom: `1px solid ${BORDER}`,
            }}
          >
            <div>
              <span style={{ fontSize: "9px", color: TEXT_FAINT, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                URL
              </span>
              <div style={{ fontSize: "11px", color: TEXT_MUTED, fontFamily: ff }}>
                {selected.serverUrl}
              </div>
            </div>
            <div>
              <span style={{ fontSize: "9px", color: TEXT_FAINT, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                LATENCY
              </span>
              <div style={{ fontSize: "11px", color: TEXT_MUTED, fontFamily: ff }}>
                {selected.latency || "--"}
              </div>
            </div>
            <div>
              <span style={{ fontSize: "9px", color: TEXT_FAINT, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                HEALTH
              </span>
              <div
                style={{
                  fontSize: "11px",
                  fontFamily: ff,
                  color:
                    selected.health >= 90
                      ? GREEN
                      : selected.health >= 50
                        ? AMBER
                        : RED,
                }}
              >
                {selected.health}%
              </div>
            </div>
            {selected.lastError && (
              <div>
                <span style={{ fontSize: "9px", color: TEXT_FAINT, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  LAST ERROR
                </span>
                <div style={{ fontSize: "11px", color: RED }}>
                  {selected.lastError}
                </div>
              </div>
            )}
          </div>

          {/* Tools Grid */}
          <div style={{ padding: "6px 12px" }}>
            <div
              style={{
                fontSize: "10px",
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: TEXT_DIM,
                marginBottom: "6px",
              }}
            >
              Tools ({selected.tools.length})
            </div>
            {selected.tools.length === 0 ? (
              <div style={{ fontSize: "11px", color: TEXT_DIM }}>No tools available</div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                  gap: "1px",
                }}
              >
                {selected.tools.map((tool) => (
                  <div
                    key={tool.name}
                    style={{
                      padding: "4px 8px",
                      background: S3,
                      display: "flex",
                      flexDirection: "column",
                      gap: "2px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "10px",
                        color: TEXT,
                        fontFamily: ff,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {tool.name}
                    </span>
                    <span
                      style={{
                        fontSize: "9px",
                        color: TEXT_DIM,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {tool.description}
                    </span>
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
