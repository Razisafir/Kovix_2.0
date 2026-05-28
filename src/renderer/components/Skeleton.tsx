import React from "react";

interface SkeletonLineProps {
  width?: string;
  height?: string;
  className?: string;
}

export const SkeletonLine: React.FC<SkeletonLineProps> = ({
  width = "100%",
  height = "16px",
  className = "",
}) => {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width, height }}
    />
  );
};

interface SkeletonBlockProps {
  width?: string;
  height?: string;
  rounded?: string;
  className?: string;
}

export const SkeletonBlock: React.FC<SkeletonBlockProps> = ({
  width = "100%",
  height = "80px",
  rounded = "6px",
  className = "",
}) => {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width, height, borderRadius: rounded }}
    />
  );
};

interface SkeletonCircleProps {
  size?: string;
  className?: string;
}

export const SkeletonCircle: React.FC<SkeletonCircleProps> = ({
  size = "40px",
  className = "",
}) => {
  return (
    <div
      className={`skeleton rounded-full ${className}`}
      style={{ width: size, height: size }}
    />
  );
};

interface SkeletonTextProps {
  lines?: number;
  lineHeight?: string;
  lastLineWidth?: string;
  className?: string;
}

export const SkeletonText: React.FC<SkeletonTextProps> = ({
  lines = 3,
  lineHeight = "14px",
  lastLineWidth = "60%",
  className = "",
}) => {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine
          key={i}
          height={lineHeight}
          width={i === lines - 1 ? lastLineWidth : "100%"}
        />
      ))}
    </div>
  );
};

export const SkeletonCard: React.FC<{ className?: string }> = ({
  className = "",
}) => {
  return (
    <div className={`p-4 space-y-3 ${className}`}>
      <div className="flex items-center gap-3">
        <SkeletonCircle size="36px" />
        <div className="flex-1 space-y-2">
          <SkeletonLine width="60%" height="12px" />
          <SkeletonLine width="40%" height="10px" />
        </div>
      </div>
      <SkeletonText lines={2} lineHeight="12px" lastLineWidth="80%" />
    </div>
  );
};

export default {
  Line: SkeletonLine,
  Block: SkeletonBlock,
  Circle: SkeletonCircle,
  Text: SkeletonText,
  Card: SkeletonCard,
};
