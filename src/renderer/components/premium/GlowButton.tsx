import { ReactNode } from "react";
import { Loader2 } from "lucide-react";

interface GlowButtonProps {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  type?: "button" | "submit";
}

export function GlowButton({
  variant = "primary",
  size = "md",
  children,
  onClick,
  disabled = false,
  loading = false,
  className = "",
  type = "button",
}: GlowButtonProps) {
  const sizeClasses = {
    sm: "px-2 py-[6px] text-[9px]",
    md: "px-3 py-[6px] text-[10px]",
    lg: "px-4 py-2 text-[11px]",
  };

  const variantClasses = {
    primary:
      "bg-[#6366f1] text-white border-[#6366f1] hover:bg-[#5558e0]",
    secondary:
      "bg-[#1a1a24] text-[#e2e2e2] border-[#22222e] hover:bg-[#22222e] hover:border-[#6366f1]",
    danger:
      "bg-[#1a1a24] text-[#ef4444] border-[#22222e] hover:bg-[#22222e] hover:border-[#ef4444]",
    ghost:
      "bg-transparent text-[#666] border-transparent hover:text-[#e2e2e2] hover:border-[#22222e]",
  };

  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      className={`
        inline-flex items-center justify-center gap-1.5
        font-mono font-medium
        border
        transition-colors duration-100
        ${sizeClasses[size]}
        ${variantClasses[variant]}
        ${isDisabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
        ${className}
      `}
      style={{ borderRadius: 2 }}
    >
      {loading && (
        <Loader2
          size={size === "sm" ? 10 : size === "md" ? 11 : 12}
          className="animate-spin"
        />
      )}
      {children}
    </button>
  );
}
