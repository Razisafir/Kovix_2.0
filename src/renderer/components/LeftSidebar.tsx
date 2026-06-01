import React from "react";
import useAppStore from "../stores/useAppStore";
import { FileTree } from "./FileTree";

interface LeftSidebarProps {
  onFileSelect: (path: string) => void;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({ onFileSelect }) => {
  const activeSidebarTab = useAppStore((s) => s.activeSidebarTab);
  const mcpConnections = useAppStore((s) => s.mcpConnections);

  const renderContent = () => {
    switch (activeSidebarTab) {
      case "explorer":
        return <FileTree onFileSelect={onFileSelect} />;

      case "mcp":
        return (
          <div className="h-full flex flex-col bg-[#0A0E1A] text-[#E0E7FF] overflow-hidden font-sans">
            {/* MCP Header */}
            <div className="h-[30px] flex items-center px-3 shrink-0 border-b border-[#1A1F2E]">
              <span className="text-[10px] font-bold tracking-widest uppercase text-[#4A5568]">
                MCP Connectors
              </span>
            </div>

            {/* MCP Content */}
            <div className="flex-1 overflow-auto p-3">
              {mcpConnections.length === 0 ? (
                <div className="text-center py-8">
                  <span className="text-2xl mb-2 block opacity-30">{"\u{1F50C}"}</span>
                  <p className="text-[11px] text-[#4A5568] font-mono">
                    No MCP connectors configured
                  </p>
                  <p className="text-[10px] text-[#4A5568] mt-1">
                    Connect external tools via MCP protocol
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {mcpConnections.map((conn) => (
                    <div
                      key={conn.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded bg-[#141B2D] border border-[#1A1F2E]"
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            conn.status === "connected"
                              ? "#00E5FF"
                              : conn.status === "error"
                                ? "#FF4757"
                                : "#4A5568",
                        }}
                      />
                      <span className="text-[11px] font-mono text-[#E0E7FF] truncate flex-1">
                        {conn.name}
                      </span>
                      <span className="text-[9px] text-[#4A5568] font-mono">
                        {conn.tools.length} tools
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );

      case "search":
      case "git":
      case "debug":
      case "extensions":
        return (
          <div className="h-full flex flex-col bg-[#0A0E1A] text-[#E0E7FF] overflow-hidden font-sans">
            <div className="h-[30px] flex items-center px-3 shrink-0 border-b border-[#1A1F2E]">
              <span className="text-[10px] font-bold tracking-widest uppercase text-[#4A5568]">
                {activeSidebarTab.charAt(0).toUpperCase() + activeSidebarTab.slice(1)}
              </span>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <span className="text-3xl block mb-3 opacity-15">
                  {activeSidebarTab === "search"
                    ? "\u{1F50D}"
                    : activeSidebarTab === "git"
                      ? "\u{1F33F}"
                      : activeSidebarTab === "debug"
                        ? "\u{1F41E}"
                        : "\u{1F9E9}"}
                </span>
                <p className="text-[11px] text-[#4A5568] font-mono">
                  Coming in v0.2.0
                </p>
              </div>
            </div>
          </div>
        );

      default:
        return <FileTree onFileSelect={onFileSelect} />;
    }
  };

  return <>{renderContent()}</>;
};

export default LeftSidebar;
