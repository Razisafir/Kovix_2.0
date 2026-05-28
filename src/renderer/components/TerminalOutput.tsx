import { useRef, useEffect, useState, useCallback } from "react";

/* ─────────────────────── types ─────────────────────── */

export interface LogEntry {
  timestamp: string;
  level: "INF" | "OK" | "WRN" | "ERR" | "WRK" | "DBG";
  message: string;
  source?: string;
}

export interface TerminalOutputProps {
  logs: LogEntry[];
  maxHeight?: string;
  onCommand?: (cmd: string) => void;
  showInput?: boolean;
}

/* ─────────────────────── styles ─────────────────────── */

const COLORS = {
  base: "#0c0c10",
  s1: "#12121a",
  s2: "#1a1a24",
  s3: "#22222e",
  accent: "#6366f1",
  t1: "#e8e8ec",
  t2: "#94949c",
  t3: "#6b6b73",
  t4: "#4a4a52",
  inf: "#6366f1",
  ok: "#22c55e",
  wrn: "#f59e0b",
  err: "#ef4444",
  wrk: "#6366f1",
  dbg: "#4a4a52",
};

const levelColor: Record<LogEntry["level"], string> = {
  INF: COLORS.inf,
  OK: COLORS.ok,
  WRN: COLORS.wrn,
  ERR: COLORS.err,
  WRK: COLORS.wrk,
  DBG: COLORS.dbg,
};

/* ─────────────────────── component ─────────────────────── */

export function TerminalOutput({
  logs,
  maxHeight = "100%",
  onCommand,
  showInput = false,
}: TerminalOutputProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState("");

  /* auto-scroll to bottom on new logs */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs.length]);

  const handleSubmit = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && inputValue.trim() && onCommand) {
        onCommand(inputValue.trim());
        setInputValue("");
      }
    },
    [inputValue, onCommand]
  );

  const focusInput = useCallback(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: COLORS.s1,
        border: "1px solid rgba(255,255,255,0.04)",
        fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
      }}
    >
      {/* log rows */}
      <div
        ref={scrollRef}
        onClick={focusInput}
        style={{
          flex: 1,
          overflow: "auto",
          padding: "6px 8px",
          maxHeight,
          scrollbarWidth: "thin",
          scrollbarColor: `${COLORS.s3} transparent`,
        }}
      >
        {logs.length === 0 && (
          <div
            style={{
              fontSize: "10px",
              color: COLORS.t4,
              fontFamily: 'inherit',
            }}
          >
            -- no output --
          </div>
        )}

        {logs.map((log, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
              padding: "1px 0",
              fontFamily: 'inherit',
            }}
          >
            {/* timestamp */}
            <span
              style={{
                fontSize: "10px",
                color: COLORS.t4,
                fontFamily: 'inherit',
                whiteSpace: "nowrap",
                minWidth: "56px",
                userSelect: "none",
              }}
            >
              {log.timestamp}
            </span>

            {/* level badge */}
            <span
              style={{
                fontSize: "9px",
                fontWeight: 600,
                color: levelColor[log.level],
                backgroundColor: COLORS.s2,
                borderRadius: "2px",
                padding: "1px 4px",
                whiteSpace: "nowrap",
                minWidth: "28px",
                textAlign: "center",
                letterSpacing: "0.04em",
                fontFamily: 'inherit',
              }}
            >
              {log.level}
            </span>

            {/* source (optional) */}
            {log.source && (
              <span
                style={{
                  fontSize: "9px",
                  color: COLORS.t4,
                  fontFamily: 'inherit',
                  whiteSpace: "nowrap",
                  minWidth: "60px",
                  textAlign: "right",
                  userSelect: "none",
                }}
              >
                {log.source}
              </span>
            )}

            {/* message */}
            <span
              style={{
                fontSize: "11px",
                color: COLORS.t1,
                fontFamily: 'inherit',
                lineHeight: "16px",
                wordBreak: "break-all",
                flex: 1,
              }}
            >
              {log.message}
            </span>
          </div>
        ))}

        {/* input line */}
        {showInput && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              marginTop: "4px",
              fontFamily: 'inherit',
            }}
          >
            <span
              style={{
                fontSize: "12px",
                color: COLORS.accent,
                fontFamily: 'inherit',
                userSelect: "none",
              }}
            >
              &gt;
            </span>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleSubmit}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: "12px",
                color: COLORS.t1,
                fontFamily: 'inherit',
                caretColor: COLORS.accent,
                padding: 0,
              }}
              spellCheck={false}
              autoComplete="off"
            />
            {/* blinking cursor indicator (CSS handles blink) */}
            <style>{`
              .terminal-cursor {
                animation: terminal-blink 1s step-end infinite;
              }
              @keyframes terminal-blink {
                0%, 100% { opacity: 1; }
                50% { opacity: 0; }
              }
            `}</style>
            <span
              className="terminal-cursor"
              style={{
                fontSize: "12px",
                color: COLORS.accent,
                fontFamily: 'inherit',
                userSelect: "none",
              }}
            >
              _
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default TerminalOutput;
