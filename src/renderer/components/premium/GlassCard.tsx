import { ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
}

export function GlassCard({ children, className = "" }: GlassCardProps) {
  return (
    <div
      className={`bg-[#12121a] border border-[#22222e] p-3 ${className}`}
      style={{ borderRadius: 0 }}
    >
      {children}
    </div>
  );
}
