function StatusBar() {
  const branch = "feat/plan-act-mode";

  return (
    <footer className="h-8 flex-shrink-0 bg-bg-onyx border-t border-border-subtle flex items-center justify-between px-4 text-xs font-mono text-text-secondary relative z-50">
      {/* ── Left section ── */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 text-status-running">
          <span className="w-2 h-2 rounded-full bg-status-running" />
          memory active
        </div>
        <div className="flex items-center gap-2 text-accent-cyan">
          <span className="w-2 h-2 rounded-full bg-accent-cyan" />
          Kimi K2.5 · local
        </div>
        <div className="text-text-secondary">
          main.py · line 25
        </div>
      </div>

      {/* ── Right section ── */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[14px]">edit_note</span>
          {branch}
        </div>
        <div>
          2 pending · 0 errors
        </div>
      </div>
    </footer>
  );
}

export default StatusBar;
