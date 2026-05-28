import { Brain } from "lucide-react";

interface ContextBarProps {
  percent: number; // 0-100
  onClick?: () => void;
}

export function ContextBar({ percent, onClick }: ContextBarProps) {
  const color =
    percent < 70
      ? "bg-construct-semantic-success"
      : percent < 90
        ? "bg-construct-semantic-warning"
        : "bg-construct-semantic-error";

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 group"
      title="Context window usage"
    >
      <Brain
        size={10}
        className="text-construct-text-muted group-hover:text-construct-accent-primary transition-colors"
      />
      <span className="text-[10px] text-construct-text-muted group-hover:text-construct-text-primary transition-colors">
        {Math.round(percent)}%
      </span>
      <div className="w-12 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </button>
  );
}

export default ContextBar;
