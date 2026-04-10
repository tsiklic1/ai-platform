import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";

type Step = "input" | "generating" | "preview";

interface FramePromptBuilderModalProps {
  open: boolean;
  brandId: string;
  skillIds: string[];
  onClose: () => void;
  onUse: (formattedPrompt: string) => void;
}

export function FramePromptBuilderModal({
  open,
  brandId,
  skillIds,
  onClose,
  onUse,
}: FramePromptBuilderModalProps) {
  const { session } = useAuth();
  const token = session?.access_token;

  const [step, setStep] = useState<Step>("input");
  const [vibe, setVibe] = useState("");
  const [frames, setFrames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStep("input");
      setVibe("");
      setFrames([]);
      setError(null);
    }
  }, [open]);

  const handleGenerate = async () => {
    if (!vibe.trim() || !token) return;
    setStep("generating");
    setError(null);

    try {
      const data = await api<{ frames: string[] }>(
        "/frame-prompt-builder/generate",
        {
          method: "POST",
          body: {
            vibe: vibe.trim(),
            brand_id: brandId,
            skill_ids: skillIds.length > 0 ? skillIds : undefined,
          },
          token,
        }
      );
      setFrames(data.frames);
      setStep("preview");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate scenario"
      );
      setStep("input");
    }
  };

  const handleUse = () => {
    const formatted = frames
      .map((desc, i) => `Frame ${i + 1}: ${desc}`)
      .join("\n\n");
    onUse(formatted);
  };

  const handleRegenerate = () => {
    handleGenerate();
  };

  const updateFrame = (index: number, value: string) => {
    setFrames((prev) => prev.map((f, i) => (i === index ? value : f)));
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              AI Prompt Builder
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors text-2xl leading-none"
            >
              &times;
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">
            {/* Error */}
            {error && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
                {error}
              </div>
            )}

            {/* Step: Input */}
            {step === "input" && (
              <div>
                <p className="text-sm text-gray-600 mb-4">
                  Describe the vibe, theme, or scenario you want for your
                  5-frame video sequence. The AI will generate detailed
                  descriptions for each frame.
                </p>
                <textarea
                  value={vibe}
                  onChange={(e) => setVibe(e.target.value)}
                  placeholder="e.g. 'beach party sunset with cocktails', 'dark cinematic product reveal', 'sporty tennis vibe - realistic'..."
                  rows={4}
                  maxLength={500}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      handleGenerate();
                    }
                  }}
                />
                <p className="text-[10px] text-gray-400 mt-1 text-right">
                  {vibe.length}/500
                </p>
              </div>
            )}

            {/* Step: Generating */}
            {step === "generating" && (
              <div className="flex flex-col items-center justify-center py-16">
                <svg
                  className="animate-spin h-8 w-8 text-indigo-500 mb-4"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <p className="text-sm text-gray-500">
                  Generating 5-frame scenario...
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  This usually takes 5-10 seconds
                </p>
              </div>
            )}

            {/* Step: Preview */}
            {step === "preview" && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Edit any frame below, then click "Use This" to fill your
                  prompt.
                </p>
                {frames.map((frame, i) => (
                  <div key={i}>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Frame {i + 1}
                    </label>
                    <textarea
                      value={frame}
                      onChange={(e) => updateFrame(i, e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
            <div>
              {step === "preview" && (
                <button
                  onClick={handleRegenerate}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Regenerate
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              {step === "input" && (
                <button
                  onClick={handleGenerate}
                  disabled={!vibe.trim()}
                  className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Generate Scenario
                </button>
              )}
              {step === "preview" && (
                <button
                  onClick={handleUse}
                  className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Use This
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
