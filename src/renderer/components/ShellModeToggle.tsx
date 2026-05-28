import { motion } from "framer-motion";
import { Terminal, Zap, Shield } from "lucide-react";

interface ShellModeToggleProps {
  shellMode: boolean;
  onToggle: (shellMode: boolean) => void;
}

export function ShellModeToggle({ shellMode, onToggle }: ShellModeToggleProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onToggle(false)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
          !shellMode
            ? "bg-construct-accent-primary/20 text-construct-accent-primary"
            : "text-construct-text-muted hover:text-construct-text-secondary"
        }`}
      >
        <Zap size={10} />
        Agent
      </button>
      <motion.button
        onClick={() => onToggle(true)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
          shellMode
            ? "bg-construct-semantic-warning/20 text-construct-semantic-warning"
            : "text-construct-text-muted hover:text-construct-text-secondary"
        }`}
      >
        <Terminal size={10} />
        Shell
        <Shield size={9} className="text-construct-semantic-warning" />
      </motion.button>
    </div>
  );
}

export default ShellModeToggle;
