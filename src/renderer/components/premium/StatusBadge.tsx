interface StatusBadgeProps {
  status: "idle" | "working" | "success" | "warning" | "error";
  text?: string;
  className?: string;
}

export function StatusBadge({
  status,
  text,
  className = "",
}: StatusBadgeProps) {
  const config = {
    idle:    { color: "#555",  label: text || "idle" },
    working: { color: "#6366f1", label: text || "working" },
    success: { color: "#10b981", label: text || "success" },
    warning: { color: "#f59e0b", label: text || "warning" },
    error:   { color: "#ef4444", label: text || "error" },
  };

  const c = config[status];

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-[9px] ${className}`}
      style={{ color: c.color }}
    >
      <span style={{ color: c.color }}>●</span>
      {c.label}
    </span>
  );
}
