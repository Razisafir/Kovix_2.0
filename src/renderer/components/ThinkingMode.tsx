import { motion, AnimatePresence } from "framer-motion";
import { Brain, Lightbulb, Sparkles } from "lucide-react";

interface ThinkingModeProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  thinkingSteps?: string[];
}

export function ThinkingMode({
  enabled,
  onToggle,
  thinkingSteps = [],
}: ThinkingModeProps) {
  return (
    <div className="space-y-2">
      {/* Toggle button */}
      <button
        onClick={() => onToggle(!enabled)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 ${
          enabled
            ? "bg-construct-accent-primary/20 text-construct-accent-primary border border-construct-accent-primary/30"
            : "bg-construct-bg-tertiary text-construct-text-muted border border-transparent hover:border-construct-border"
        }`}
      >
        <Brain size={14} />
        <span>Deep Think {enabled ? "ON" : "OFF"}</span>
        {enabled && <Sparkles size={12} className="animate-pulse" />}
      </button>

      {/* Thinking steps visualization */}
      <AnimatePresence>
        {enabled && thinkingSteps.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="space-y-1 pl-2 border-l-2 border-construct-accent-primary/30"
          >
            {thinkingSteps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.15 }}
                className="flex items-center gap-2 text-[11px] text-construct-text-secondary"
              >
                <Lightbulb size={10} className="text-construct-accent-primary" />
                {step}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ThinkingMode;
