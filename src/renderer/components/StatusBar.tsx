import useAppStore from "../stores/useAppStore";

function StatusBar() {
  const branch = "feat/plan-act-mode";
  const skills = useAppStore((s) => s.skills);
  const activeSkillCount = skills.filter((s) => s.installed).length;

  const openSkillSettings = () => {
    window.dispatchEvent(new CustomEvent("construct:open-settings"));
  };

  return (
    <footer className="h-8 flex-shrink-0 bg-bg-onyx border-t border-border-subtle flex items-center justify-between px-4 text-xs font-mono text-text-secondary relative z-50">
      {/* Left section */}
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

      {/* Right section */}
      <div className="flex items-center gap-6">
        {/* Skills indicator */}
        <span
          className="cursor-pointer hover:text-white flex items-center gap-1.5 transition-colors"
          onClick={openSkillSettings}
          title={`${activeSkillCount} skills active — click to manage`}
        >
          <span className="material-symbols-outlined text-[14px]">settings_suggest</span>
          {activeSkillCount} skills
        </span>
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
