import { useState, useCallback } from "react";

/* ─────────────────────── types ─────────────────────── */

type MemoryType = "EPI" | "SEM" | "PRC" | "REF";

interface MemoryEntry {
  id: string;
  type: MemoryType;
  timestamp: string;
  relativeTime: string;
  source: string;
  content: string;
  fullContent: string;
  confidence?: number;
  relatedFiles?: string[];
}

interface MemoryState {
  entries: MemoryEntry[];
  selectedId: string | null;
  query: string;
}

/* ─────────────────────── colors ─────────────────────── */

const C = {
  base: "#0c0c10",
  s1: "#12121a",
  s2: "#1a1a24",
  s3: "#22222e",
  accent: "#6366f1",
  t1: "#e8e8ec",
  t2: "#94949c",
  t3: "#6b6b73",
  t4: "#4a4a52",
  epi: "#3b82f6",
  sem: "#a855f7",
  prc: "#f59e0b",
  ref: "#22c55e",
};

const typeColor: Record<MemoryType, string> = {
  EPI: C.epi,
  SEM: C.sem,
  PRC: C.prc,
  REF: C.ref,
};

/* ─────────────────────── demo data ─────────────────────── */

const DEMO_ENTRIES: MemoryEntry[] = [
  {
    id: "1",
    type: "EPI",
    timestamp: "2026-05-28T14:32:00Z",
    relativeTime: "2h ago",
    source: "auth.ts",
    content: "implemented JWT middleware with 15min expiry",
    fullContent:
      "Implemented JWT authentication middleware using jsonwebtoken library. Token expiry set to 15 minutes based on previous project preferences. RS256 algorithm selected for asymmetric signing. Refresh token rotation implemented with httpOnly cookie storage.",
    confidence: 0.94,
    relatedFiles: ["middleware.ts", "types.ts", "api.ts"],
  },
  {
    id: "2",
    type: "EPI",
    timestamp: "2026-05-28T13:15:00Z",
    relativeTime: "3h ago",
    source: "cors.ts",
    content: "fixed CORS configuration for staging deployment",
    fullContent:
      "Updated CORS configuration to allow staging domain origins. Added allowedHeaders for Authorization and Content-Type. Preflight cache duration set to 86400 seconds.",
    confidence: 0.91,
    relatedFiles: ["server.ts", "config.ts"],
  },
  {
    id: "3",
    type: "SEM",
    timestamp: "2026-05-27T16:00:00Z",
    relativeTime: "1d ago",
    source: "--",
    content: "react hooks patterns for data fetching",
    fullContent:
      "Extracted common pattern for data fetching with useSWR. Caching strategy uses stale-while-revalidate with 5min deduping interval. Error retry uses exponential backoff capped at 30 seconds.",
    confidence: 0.87,
    relatedFiles: ["useFetch.ts", "useCache.ts"],
  },
  {
    id: "4",
    type: "PRC",
    timestamp: "2026-05-26T09:20:00Z",
    relativeTime: "2d ago",
    source: "--",
    content: "prisma schema naming conventions: camelCase fields, PascalCase models",
    fullContent:
      "Established Prisma schema conventions: model names in PascalCase (e.g., UserProfile), field names in camelCase (e.g., createdAt), table names in snake_case via @@map directive. Enum values in SCREAMING_SNAKE_CASE.",
    confidence: 0.82,
    relatedFiles: ["schema.prisma"],
  },
  {
    id: "5",
    type: "REF",
    timestamp: "2026-05-25T11:00:00Z",
    relativeTime: "3d ago",
    source: "README.md",
    content: "project uses pnpm workspace with turbo repo",
    fullContent:
      "Monorepo structure using pnpm workspaces with Turborepo for task orchestration. Shared packages: @acme/ui, @acme/utils, @acme/config. Pipeline tasks: build, lint, test, typecheck.",
    confidence: 0.96,
    relatedFiles: ["turbo.json", "pnpm-workspace.yaml"],
  },
  {
    id: "6",
    type: "EPI",
    timestamp: "2026-05-28T10:00:00Z",
    relativeTime: "6h ago",
    source: "billing.ts",
    content: "integrated stripe webhook handler for subscription events",
    fullContent:
      "Stripe webhook endpoint handles checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.updated events. Idempotency enforced via event ID lookup in processed_events table. Signature verification uses stripe-node library with webhook secret from env.",
    confidence: 0.89,
    relatedFiles: ["stripe.ts", "webhook.ts", "schema.prisma"],
  },
];

/* ─────────────────────── sub-components ─────────────────────── */

function TypeBadge({ type }: { type: MemoryType }) {
  return (
    <span
      style={{
        fontSize: "9px",
        fontWeight: 700,
        letterSpacing: "0.06em",
        color: typeColor[type],
        backgroundColor: C.s2,
        borderRadius: "2px",
        padding: "1px 5px",
        fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
        minWidth: "28px",
        textAlign: "center",
        display: "inline-block",
      }}
    >
      {type}
    </span>
  );
}

function SearchInput({
  value,
  onChange,
  onSearch,
}: {
  value: string;
  onChange: (v: string) => void;
  onSearch: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "6px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <span
        style={{
          fontSize: "10px",
          color: C.t4,
          fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        QUERY:
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSearch()}
        style={{
          flex: 1,
          backgroundColor: C.base,
          border: "1px solid rgba(255,255,255,0.04)",
          outline: "none",
          fontSize: "11px",
          color: C.t1,
          fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
          padding: "3px 8px",
          borderRadius: "0px",
          caretColor: C.accent,
        }}
        spellCheck={false}
        autoComplete="off"
      />
      <button
        onClick={onSearch}
        style={{
          fontSize: "10px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          backgroundColor: C.s2,
          color: C.t2,
          border: "1px solid rgba(255,255,255,0.04)",
          borderRadius: "2px",
          padding: "3px 10px",
          cursor: "pointer",
          fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
        }}
        onMouseEnter={(e) => {
          (e.target as HTMLElement).style.backgroundColor = C.s3;
        }}
        onMouseLeave={(e) => {
          (e.target as HTMLElement).style.backgroundColor = C.s2;
        }}
      >
        SEARCH
      </button>
    </div>
  );
}

function DetailPanel({ entry }: { entry: MemoryEntry }) {
  return (
    <div
      style={{
        backgroundColor: C.s2,
        border: "1px solid rgba(255,255,255,0.04)",
        margin: "6px 12px 6px 12px",
        padding: "8px 10px",
        fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
      }}
    >
      {/* metadata row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          fontSize: "10px",
          color: C.t3,
          marginBottom: "6px",
          flexWrap: "wrap",
        }}
      >
        <span>
          TYPE:{" "}
          <span style={{ color: typeColor[entry.type] }}>{entry.type}</span>
        </span>
        <span>
          TIME:{" "}
          <span style={{ color: C.t2 }}>{entry.timestamp}</span>
        </span>
        <span>
          CONFIDENCE:{" "}
          <span style={{ color: C.t2 }}>{(entry.confidence ?? 0).toFixed(2)}</span>
        </span>
        <span>
          SOURCE:{" "}
          <span style={{ color: C.t2 }}>{entry.source}</span>
        </span>
      </div>

      {/* divider */}
      <div
        style={{
          height: "1px",
          backgroundColor: "rgba(255,255,255,0.04)",
          margin: "6px 0",
        }}
      />

      {/* content */}
      <div
        style={{
          fontSize: "11px",
          color: C.t1,
          lineHeight: "16px",
          wordBreak: "break-word",
        }}
      >
        {entry.fullContent}
      </div>

      {/* related files */}
      {entry.relatedFiles && entry.relatedFiles.length > 0 && (
        <>
          <div
            style={{
              height: "1px",
              backgroundColor: "rgba(255,255,255,0.04)",
              margin: "6px 0",
            }}
          />
          <div
            style={{
              fontSize: "10px",
              color: C.t3,
            }}
          >
            RELATED:{" "}
            {entry.relatedFiles.map((f, i) => (
              <span key={f} style={{ color: C.t2 }}>
                {f}
                {i < entry.relatedFiles!.length - 1 ? "  " : ""}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────── main component ─────────────────────── */

function MemoryPanel() {
  const [state, setState] = useState<MemoryState>({
    entries: DEMO_ENTRIES,
    selectedId: null,
    query: "",
  });

  const handleSelect = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      selectedId: prev.selectedId === id ? null : id,
    }));
  }, []);

  const handleSearch = useCallback(() => {
    if (!state.query.trim()) {
      setState((prev) => ({ ...prev, entries: DEMO_ENTRIES }));
      return;
    }
    const q = state.query.toLowerCase();
    setState((prev) => ({
      ...prev,
      entries: DEMO_ENTRIES.filter(
        (e) =>
          e.content.toLowerCase().includes(q) ||
          e.source.toLowerCase().includes(q) ||
          e.type.toLowerCase().includes(q)
      ),
    }));
  }, [state.query]);

  const selectedEntry = state.entries.find((e) => e.id === state.selectedId);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: C.base,
        border: "1px solid rgba(255,255,255,0.04)",
        fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
        overflow: "hidden",
      }}
    >
      {/* ── HEADER ── */}
      <div
        style={{
          padding: "8px 12px",
          fontSize: "10px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: C.t3,
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        MEMORY
      </div>

      {/* ── SEARCH ── */}
      <SearchInput
        value={state.query}
        onChange={(v) => setState((prev) => ({ ...prev, query: v }))}
        onSearch={handleSearch}
      />

      {/* ── TABLE HEADER ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "44px 80px 100px 1fr",
          gap: "8px",
          padding: "4px 12px",
          fontSize: "10px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: C.t4,
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <span>TYPE</span>
        <span>TIMESTAMP</span>
        <span>SOURCE</span>
        <span>CONTENT</span>
      </div>

      {/* ── TABLE BODY ── */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          scrollbarWidth: "thin",
          scrollbarColor: `${C.s3} transparent`,
        }}
      >
        {state.entries.map((entry) => {
          const isSelected = state.selectedId === entry.id;
          return (
            <div key={entry.id}>
              <div
                onClick={() => handleSelect(entry.id)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "44px 80px 100px 1fr",
                  gap: "8px",
                  padding: "4px 12px",
                  fontSize: "11px",
                  fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
                  color: C.t2,
                  backgroundColor: isSelected ? C.s2 : "transparent",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  cursor: "pointer",
                  alignItems: "center",
                  transition: "background-color 0.05s",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLElement).style.backgroundColor = C.s1;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                  }
                }}
              >
                <TypeBadge type={entry.type} />
                <span
                  style={{
                    fontSize: "10px",
                    color: C.t3,
                    whiteSpace: "nowrap",
                  }}
                >
                  {entry.relativeTime}
                </span>
                <span
                  style={{
                    fontSize: "10px",
                    color: entry.source === "--" ? C.t4 : C.t2,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {entry.source}
                </span>
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: C.t2,
                  }}
                >
                  {entry.content}
                </span>
              </div>

              {/* detail panel */}
              {isSelected && selectedEntry && (
                <DetailPanel entry={selectedEntry} />
              )}
            </div>
          );
        })}

        {state.entries.length === 0 && (
          <div
            style={{
              padding: "16px 12px",
              fontSize: "10px",
              color: C.t4,
              textAlign: "center",
            }}
          >
            -- no results --
          </div>
        )}
      </div>

      {/* scrollbar styles */}
      <style>{`
        div::-webkit-scrollbar { width: 4px; height: 4px; }
        div::-webkit-scrollbar-track { background: transparent; }
        div::-webkit-scrollbar-thumb { background: ${C.s3}; border-radius: 2px; }
        div::-webkit-scrollbar-thumb:hover { background: #3a3a4f; }
      `}</style>
    </div>
  );
}

export default MemoryPanel;
