import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useBrand } from "../context/BrandContext";
import { api } from "../lib/api";
import { NoBrandPrompt } from "../components/NoBrandPrompt";
import { ContentTypeSelector } from "../components/ContentTypeSelector";
import { SkillPicker } from "../components/SkillPicker";

// ─── Types ──────────────────────────────────────────────────

interface GeneratedText {
  id: string;
  prompt: string;
  generated_text: string;
  content_type_id: string | null;
  created_at: string;
}

// ─── Helpers ────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Caption Card ───────────────────────────────────────────

interface CaptionCardProps {
  text: GeneratedText;
  contentTypeName: string | null;
  onDelete: (id: string) => void;
  onTogglePrompt: (id: string) => void;
  expandedPromptId: string | null;
}

function CaptionCard({
  text,
  contentTypeName,
  onDelete,
  onTogglePrompt,
  expandedPromptId,
}: CaptionCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text.generated_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = text.generated_text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDelete = () => {
    if (!window.confirm("Delete this caption? This cannot be undone.")) return;
    onDelete(text.id);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 transition-shadow hover:shadow-md">
      {/* Generated text */}
      <p className="text-gray-900 text-sm leading-relaxed whitespace-pre-wrap">
        {text.generated_text}
      </p>

      {/* Divider */}
      <div className="border-t border-gray-100 mt-4 pt-3">
        {/* Prompt */}
        <div className="flex items-start gap-2 mb-2">
          <span className="text-xs text-gray-400 shrink-0 mt-0.5">
            Prompt:
          </span>
          <p className="text-xs text-gray-500 line-clamp-1">{text.prompt}</p>
          <button
            onClick={() => onTogglePrompt(text.id)}
            className="text-xs text-indigo-500 hover:text-indigo-700 shrink-0"
          >
            {expandedPromptId === text.id ? "Less" : "More"}
          </button>
        </div>

        {/* Expanded prompt */}
        {expandedPromptId === text.id && (
          <div className="mb-3 px-3 py-2 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600 whitespace-pre-wrap">
              {text.prompt}
            </p>
          </div>
        )}

        {/* Meta row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {contentTypeName && (
              <span className="text-[11px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
                {contentTypeName}
              </span>
            )}
            <span className="text-[11px] text-gray-400">
              {timeAgo(text.created_at)}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              {copied ? (
                <>
                  <span className="text-green-600">✓</span>
                  <span className="text-green-600">Copied!</span>
                </>
              ) : (
                <>
                  <span>📋</span>
                  <span>Copy</span>
                </>
              )}
            </button>
            <button
              onClick={handleDelete}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-500 bg-white rounded-lg border border-red-200 hover:bg-red-50 transition-colors"
            >
              <span>🗑</span>
              <span>Delete</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function Captions() {
  const { session } = useAuth();
  const token = session?.access_token || "";
  const { selectedBrand, loading: brandLoading } = useBrand();

  const brandId = selectedBrand?.id || "";

  // Generation form state
  const [contentTypeId, setContentTypeId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // Content type names cache (for badges)
  const [contentTypeNames, setContentTypeNames] = useState<
    Record<string, string>
  >({});

  // Captions list state
  const [texts, setTexts] = useState<GeneratedText[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Expanded prompt state
  const [expandedPromptId, setExpandedPromptId] = useState<string | null>(null);

  // Fetch content type names for badges
  useEffect(() => {
    if (!brandId || !token) return;
    api<{
      contentTypes: { id: string; name: string }[];
    }>(`/brands/${brandId}/content-types`, { token })
      .then((data) => {
        const names: Record<string, string> = {};
        data.contentTypes.forEach((ct) => {
          names[ct.id] = ct.name;
        });
        setContentTypeNames(names);
      })
      .catch(console.error);
  }, [brandId, token]);

  // Fetch captions
  const fetchTexts = useCallback(
    async (pageNum: number, append: boolean = false) => {
      if (!token || !brandId) {
        setTexts([]);
        setTotal(0);
        setLoadingList(false);
        return;
      }
      try {
        const data = await api<{
          texts: GeneratedText[];
          total: number;
          page: number;
          limit: number;
        }>(`/brands/${brandId}/texts?page=${pageNum}&limit=${PAGE_SIZE}`, {
          token,
        });
        if (append) {
          setTexts((prev) => [...prev, ...data.texts]);
        } else {
          setTexts(data.texts);
        }
        setTotal(data.total);
        setPage(pageNum);
      } catch (err) {
        console.error("Failed to fetch texts:", err);
      } finally {
        setLoadingList(false);
        setLoadingMore(false);
      }
    },
    [token, brandId]
  );

  // Reset on brand change
  useEffect(() => {
    setLoadingList(true);
    setPage(1);
    setContentTypeId(null);
    setPrompt("");
    setSelectedSkillIds([]);
    setExpandedPromptId(null);
    fetchTexts(1);
  }, [fetchTexts]);

  // Generate handler
  const handleGenerate = async () => {
    if (!prompt.trim() || !token || !brandId) return;
    setGenerating(true);
    setGenError(null);
    try {
      await api(`/brands/${brandId}/texts/generate`, {
        method: "POST",
        body: {
          prompt: prompt.trim(),
          content_type_id: contentTypeId,
          skill_ids: selectedSkillIds.length > 0 ? selectedSkillIds : undefined,
        },
        token,
      });
      // Refetch from page 1 so new caption appears first
      await fetchTexts(1);
      setPrompt("");
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  // Content type change (no aspect ratio for text)
  const handleContentTypeChange = (id: string | null) => {
    setContentTypeId(id);
  };

  // Load more
  const handleLoadMore = () => {
    setLoadingMore(true);
    fetchTexts(page + 1, true);
  };

  // Delete (optimistic)
  const handleDelete = async (textId: string) => {
    const previousTexts = texts;
    const previousTotal = total;

    setTexts((prev) => prev.filter((t) => t.id !== textId));
    setTotal((prev) => prev - 1);

    try {
      await api(`/brands/${brandId}/texts/${textId}`, {
        method: "DELETE",
        token,
      });
    } catch (err) {
      // Revert
      setTexts(previousTexts);
      setTotal(previousTotal);
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  };

  // Toggle expanded prompt
  const handleTogglePrompt = (id: string) => {
    setExpandedPromptId((prev) => (prev === id ? null : id));
  };

  // Handle Ctrl+Enter / Cmd+Enter to generate
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleGenerate();
    }
  };

  // Loading / no brand
  if (brandLoading) {
    return (
      <div className="text-gray-400 text-sm py-12 text-center">Loading...</div>
    );
  }

  if (!selectedBrand) {
    return <NoBrandPrompt />;
  }

  const hasMore = texts.length < total;

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Captions</h1>
        <p className="mt-1 text-sm text-gray-500">
          Generate Instagram captions for{" "}
          <span className="font-medium text-gray-700">
            {selectedBrand.name}
          </span>
          .
        </p>
      </div>

      {/* Generation Form */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-8">
        {/* Error */}
        {genError && (
          <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs mb-3">
            {genError}
          </div>
        )}

        {/* Content Type */}
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Content Type
          </label>
          <ContentTypeSelector
            brandId={brandId}
            token={token}
            value={contentTypeId}
            onChange={handleContentTypeChange}
          />
        </div>

        {/* Skills */}
        <div className="mb-3">
          <SkillPicker
            action="text"
            token={token}
            selectedIds={selectedSkillIds}
            onChange={setSelectedSkillIds}
          />
        </div>

        {/* Prompt */}
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Prompt <span className="text-red-400">*</span>
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            placeholder="What should the caption be about..."
            disabled={generating}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none disabled:opacity-50"
          />
        </div>

        {/* Generate button */}
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-gray-400">
            ⚠ Uses Claude to generate on-brand captions.{" "}
            <span className="text-gray-300">⌘+Enter to generate</span>
          </p>
          <button
            onClick={handleGenerate}
            disabled={generating || !prompt.trim()}
            className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin h-4 w-4"
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
                Generating...
              </span>
            ) : (
              "Generate Caption"
            )}
          </button>
        </div>
      </div>

      {/* Generated Captions */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Generated Captions
          {total > 0 && (
            <span className="text-sm font-normal text-gray-400 ml-2">
              ({total})
            </span>
          )}
        </h2>

        {loadingList ? (
          <div className="text-gray-400 text-sm py-12 text-center">
            Loading captions...
          </div>
        ) : texts.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4 opacity-50">✍️</div>
            <h3 className="text-lg font-medium text-gray-400 mb-1">
              No captions generated yet
            </h3>
            <p className="text-gray-400 text-sm">
              Use the form above to create your first caption.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {texts.map((t) => (
              <CaptionCard
                key={t.id}
                text={t}
                contentTypeName={
                  t.content_type_id
                    ? contentTypeNames[t.content_type_id] || null
                    : null
                }
                onDelete={handleDelete}
                onTogglePrompt={handleTogglePrompt}
                expandedPromptId={expandedPromptId}
              />
            ))}

            {/* Load more */}
            {hasMore && (
              <div className="text-center pt-2 pb-4">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="px-6 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {loadingMore ? "Loading..." : "Load more"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
