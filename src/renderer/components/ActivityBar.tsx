import React from "react";
import useAppStore from "../stores/useAppStore";

const ACTIVITY_ICONS = [
  { id: "explorer", icon: "\u{1F4C1}", label: "Explorer" },
  { id: "search", icon: "\u{1F50D}", label: "Search" },
  { id: "git", icon: "\u{1F33F}", label: "Source Control" },
  { id: "debug", icon: "\u{1F41E}", label: "Run and Debug" },
  { id: "extensions", icon: "\u{1F9E9}", label: "Extensions" },
  { id: "mcp", icon: "\u{1F50C}", label: "MCP" },
];

export const ActivityBar: React.FC = () => {
  const activeSidebarTab = useAppStore((s) => s.activeSidebarTab);
  const setActiveSidebarTab = useAppStore((s) => s.setActiveSidebarTab);
  const sidebarVisible = useAppStore((s) => s.sidebarVisible);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);

  const handleIconClick = (id: string) => {
    if (activeSidebarTab === id && sidebarVisible) {
      // Clicking the active icon again toggles the sidebar closed
      toggleSidebar();
    } else {
      setActiveSidebarTab(id);
      if (!sidebarVisible) {
        toggleSidebar();
      }
    }
  };

  return (
    <div
      className="flex flex-col items-center py-2 shrink-0 select-none"
      style={{
        width: 48,
        background: "#0D1117",
        borderRight: "1px solid #1A1F2E",
      }}
    >
      {ACTIVITY_ICONS.map((item) => {
        const isActive = activeSidebarTab === item.id && sidebarVisible;
        return (
          <button
            key={item.id}
            onClick={() => handleIconClick(item.id)}
            className="flex items-center justify-center cursor-pointer bg-transparent border-none transition-colors duration-150"
            style={{
              width: 48,
              height: 48,
              borderLeft: isActive ? "2px solid #00E5FF" : "2px solid transparent",
              color: isActive ? "#00E5FF" : "#4A5568",
              backgroundColor: isActive ? "rgba(0, 229, 255, 0.08)" : "transparent",
            }}
            title={item.label}
          >
            <span className="text-[18px]">{item.icon}</span>
          </button>
        );
      })}

      {/* Spacer to push settings to bottom */}
      <div className="flex-1" />

      {/* Settings gear at bottom */}
      <button
        className="flex items-center justify-center cursor-pointer bg-transparent border-none transition-colors duration-150"
        style={{
          width: 48,
          height: 48,
          borderLeft: "2px solid transparent",
          color: "#4A5568",
        }}
        title="Settings"
      >
        <span className="text-[18px]">{"\u2699\uFE0F"}</span>
      </button>
    </div>
  );
};

export default ActivityBar;
