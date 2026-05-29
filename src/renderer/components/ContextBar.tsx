import { Brain } from "lucide-react";

interface ContextBarProps {
  percent: number;
  onClick?: () => void;
}

const C = {
  s2: "#1a1a24",
  s3: "#22222e",
  accent: "#6366f1",
  t2: "#94949c",
  t3: "#6b6b73",
  ok: "#10b981",
  wrn: "#f59e0b",
  err: "#ef4444",
};

export function ContextBar({ percent, onClick }: ContextBarProps) {
  const barColor =
    percent < 70 ? C.ok : percent < 90 ? C.wrn : C.err;

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 bg-transparent border-none cursor-pointer"
      style={{
        fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
      }}
      title="Context window usage"
    >
      <Brain size={10} color={C.t3} />
      <span className="text-[10px] text-[#6b6b73] tabular-nums">
        {Math.round(percent)}%
      </span>
      <div className="w-8 h-1 overflow-hidden rounded-none" style={{ background: C.s3 }}>
        <div
          className="h-full transition-[width] duration-100 ease-in-out rounded-none"
          style={{
            background: barColor,
            width: `${percent}%`,
          }}
        />
      </div>
    </button>
  );
}

export default ContextBar;
