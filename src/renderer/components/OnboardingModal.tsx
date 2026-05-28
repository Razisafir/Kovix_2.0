import { useState, useCallback } from "react";

/* ─── Colors ─── */
const BASE = "#0c0c10";
const S1 = "#12121a";
const S2 = "#1a1a24";
const S3 = "#22222e";
const ACCENT = "#6366f1";
const TEXT = "#e8e8ec";
const TEXT_MUTED = "#94949c";
const TEXT_DIM = "#6b6b73";
const TEXT_FAINT = "#4a4a52";
const BORDER = "rgba(255,255,255,0.04)";
const ff = '"Geist Mono", "JetBrains Mono", monospace';

interface OnboardingModalProps {
  onComplete?: () => void;
}

export default function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const [step, setStep] = useState(0);
  const [projectPath, setProjectPath] = useState("");
  const [goal, setGoal] = useState("");
  const [llmProvider, setLlmProvider] = useState<"local" | "claude">("local");
  const [theme, setTheme] = useState<"dark" | "light" | "system">("dark");

  const totalSteps = 5;

  const goNext = useCallback(() => {
    if (step < totalSteps - 1) {
      setStep((s) => s + 1);
    }
  }, [step]);

  const goBack = useCallback(() => {
    if (step > 0) {
      setStep((s) => s - 1);
    }
  }, [step]);

  const handleSkip = useCallback(() => {
    onComplete?.();
  }, [onComplete]);

  const handleFinish = useCallback(() => {
    try {
      localStorage.setItem("construct_onboarding_complete", "true");
      localStorage.setItem("construct_theme", theme);
      localStorage.setItem("construct_llm", llmProvider);
      localStorage.setItem("construct_project_path", projectPath);
      localStorage.setItem("construct_goal", goal);
    } catch {
      // ignore storage errors
    }
    onComplete?.();
  }, [onComplete, theme, llmProvider, projectPath, goal]);

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ fontSize: "10px", color: TEXT_DIM, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              [{step + 1}/{totalSteps}] Project
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "10px", color: TEXT_DIM, textTransform: "uppercase", letterSpacing: "0.08em", minWidth: "36px" }}>
                Path
              </span>
              <input
                type="text"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder="/home/user/project"
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  fontSize: "11px",
                  fontFamily: ff,
                  background: S1,
                  color: TEXT,
                  border: `1px solid ${BORDER}`,
                  outline: "none",
                }}
              />
              <button
                onClick={() => setProjectPath("/home/user/project")}
                style={{
                  padding: "6px 12px",
                  fontSize: "10px",
                  fontFamily: ff,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  background: S2,
                  color: TEXT_MUTED,
                  border: "none",
                  borderRadius: "2px",
                  cursor: "pointer",
                }}
              >
                Browse
              </button>
            </div>
          </div>
        );

      case 1:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ fontSize: "10px", color: TEXT_DIM, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              [{step + 1}/{totalSteps}] Goal
            </div>
            <input
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Describe what you want to build..."
              style={{
                width: "100%",
                padding: "6px 10px",
                fontSize: "11px",
                fontFamily: ff,
                background: S1,
                color: TEXT,
                border: `1px solid ${BORDER}`,
                outline: "none",
              }}
            />
          </div>
        );

      case 2:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ fontSize: "10px", color: TEXT_DIM, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              [{step + 1}/{totalSteps}] LLM Provider
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <button
                onClick={() => setLlmProvider("local")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 10px",
                  fontSize: "11px",
                  fontFamily: ff,
                  background: llmProvider === "local" ? S2 : "transparent",
                  color: llmProvider === "local" ? TEXT : TEXT_DIM,
                  border: `1px solid ${llmProvider === "local" ? BORDER : "transparent"}`,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{ color: llmProvider === "local" ? ACCENT : TEXT_FAINT }}>
                  {llmProvider === "local" ? "◉" : "○"}
                </span>
                <span>Local (Ollama)</span>
              </button>
              <button
                onClick={() => setLlmProvider("claude")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 10px",
                  fontSize: "11px",
                  fontFamily: ff,
                  background: llmProvider === "claude" ? S2 : "transparent",
                  color: llmProvider === "claude" ? TEXT : TEXT_DIM,
                  border: `1px solid ${llmProvider === "claude" ? BORDER : "transparent"}`,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{ color: llmProvider === "claude" ? ACCENT : TEXT_FAINT }}>
                  {llmProvider === "claude" ? "◉" : "○"}
                </span>
                <span>Claude (API key required)</span>
              </button>
            </div>
          </div>
        );

      case 3:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ fontSize: "10px", color: TEXT_DIM, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              [{step + 1}/{totalSteps}] Theme
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {(["dark", "light", "system"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 10px",
                    fontSize: "11px",
                    fontFamily: ff,
                    background: theme === t ? S2 : "transparent",
                    color: theme === t ? TEXT : TEXT_DIM,
                    border: `1px solid ${theme === t ? BORDER : "transparent"}`,
                    cursor: "pointer",
                    textAlign: "left",
                    textTransform: "capitalize",
                  }}
                >
                  <span style={{ color: theme === t ? ACCENT : TEXT_FAINT }}>
                    {theme === t ? "◉" : "○"}
                  </span>
                  <span>{t}</span>
                </button>
              ))}
            </div>
          </div>
        );

      case 4:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ fontSize: "10px", color: TEXT_DIM, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              [{step + 1}/{totalSteps}] Ready
            </div>
            <div style={{ fontSize: "11px", color: TEXT_MUTED, lineHeight: "1.5" }}>
              <div>All set. Press Enter to begin.</div>
              <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: TEXT_DIM }}>Project</span>
                  <span style={{ color: TEXT_FAINT }}>{projectPath || "Not set"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: TEXT_DIM }}>Goal</span>
                  <span style={{ color: TEXT_FAINT }}>{goal || "Not set"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: TEXT_DIM }}>LLM</span>
                  <span style={{ color: TEXT_FAINT }}>{llmProvider === "local" ? "Ollama" : "Claude"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: TEXT_DIM }}>Theme</span>
                  <span style={{ color: TEXT_FAINT, textTransform: "capitalize" }}>{theme}</span>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.8)",
        fontFamily: ff,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "480px",
          margin: "0 16px",
          background: BASE,
          border: `1px solid ${BORDER}`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Title Section */}
        <div
          style={{
            padding: "20px 24px 8px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: "14px",
              fontWeight: 700,
              color: TEXT,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            CONSTRUCT
          </div>
          <div
            style={{
              fontSize: "11px",
              color: TEXT_MUTED,
              marginTop: "4px",
            }}
          >
            Autonomous AI coding agent
          </div>
        </div>

        {/* Divider */}
        <div style={{ margin: "8px 24px", borderTop: `1px solid ${BORDER}` }} />

        {/* Step Content */}
        <div
          style={{
            padding: "16px 24px",
            minHeight: "140px",
          }}
        >
          {renderStep()}
        </div>

        {/* Divider */}
        <div style={{ margin: "8px 24px", borderTop: `1px solid ${BORDER}` }} />

        {/* Footer Buttons */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 24px 16px",
          }}
        >
          <button
            onClick={goBack}
            disabled={step === 0}
            style={{
              padding: "6px 12px",
              fontSize: "10px",
              fontFamily: ff,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 500,
              background: S2,
              color: step === 0 ? TEXT_FAINT : TEXT_MUTED,
              border: "none",
              borderRadius: "2px",
              cursor: step === 0 ? "default" : "pointer",
            }}
          >
            {" < Back "}
          </button>

          <button
            onClick={handleSkip}
            style={{
              padding: "6px 12px",
              fontSize: "10px",
              fontFamily: ff,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 500,
              background: "transparent",
              color: TEXT_DIM,
              border: "none",
              cursor: "pointer",
            }}
          >
            Skip
          </button>

          {step === totalSteps - 1 ? (
            <button
              onClick={handleFinish}
              style={{
                padding: "6px 12px",
                fontSize: "10px",
                fontFamily: ff,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontWeight: 500,
                background: ACCENT,
                color: "#fff",
                border: "none",
                borderRadius: "2px",
                cursor: "pointer",
              }}
            >
              Begin
            </button>
          ) : (
            <button
              onClick={goNext}
              style={{
                padding: "6px 12px",
                fontSize: "10px",
                fontFamily: ff,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontWeight: 500,
                background: S2,
                color: TEXT,
                border: "none",
                borderRadius: "2px",
                cursor: "pointer",
              }}
            >
              {" Next > "}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
