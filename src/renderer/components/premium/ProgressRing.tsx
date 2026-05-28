interface ProgressBarProps {
  progress: number;
  width?: number;
  showPercent?: boolean;
}

export function ProgressRing({
  progress,
  width = 20,
  showPercent = true,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, progress));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;

  const bar = "█".repeat(filled) + "░".repeat(empty);

  return (
    <span
      className="inline-flex items-center gap-2 font-mono text-[10px] whitespace-pre"
      style={{ color: "#6366f1" }}
    >
      <span style={{ color: "#6366f1" }}>{bar}</span>
      {showPercent && (
        <span style={{ color: "#e2e2e2", fontSize: 10 }}>
          {Math.round(clamped)}%
        </span>
      )}
    </span>
  );
}
