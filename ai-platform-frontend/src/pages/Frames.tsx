import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useBrand } from "../context/BrandContext";
import { api } from "../lib/api";
import { NoBrandPrompt } from "../components/NoBrandPrompt";
import { AspectRatioToggle } from "../components/AspectRatioToggle";
import { ContentTypeSelector } from "../components/ContentTypeSelector";
import { SkillPicker } from "../components/SkillPicker";

// ─── Types ──────────────────────────────────────────────────

interface Frame {
  id: string;
  frame_number: number;
  url: string;
}

interface FrameSetSummary {
  id: string;
  prompt: string;
  aspect_ratio: string;
  content_type_id: string | null;
  status: string;
  frame_count: number;
  created_at: string;
  frames: Frame[];
}

interface FrameSetFull {
  id: string;
  user_id: string;
  brand_id: string;
  content_type_id: string | null;
  prompt: string;
  full_prompt: string;
  aspect_ratio: string;
  status: string;
  frame_count: number;
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

// ─── Detail Sidebar ─────────────────────────────────────────

interface SidebarProps {
  frameSet: FrameSetFull | null;
  frames: Frame[];
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
}

function FrameDetailSidebar({
  frameSet,
  frames,
  open,
  loading,
  onClose,
  onDelete,
}: SidebarProps) {
  const [showFullPrompt, setShowFullPrompt] = useState(false);

  useEffect(() => {
    setShowFullPrompt(false);
  }, [frameSet?.id]);

  const handleDelete = () => {
    if (!frameSet) return;
    if (!window.confirm("Delete this frame set? This cannot be undone."))
      return;
    onDelete(frameSet.id);
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      <div
        className={`fixed top-0 right-0 h-full w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Frame Set Details
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {loading ? (
            <div className="text-gray-400 text-sm py-8 text-center">
              Loading...
            </div>
          ) : frameSet ? (
            <>
              {/* All frames in a vertical list */}
              <div className="space-y-3">
                {frames.map((f) => (
                  <div
                    key={f.id}
                    className="rounded-lg overflow-hidden bg-gray-100"
                  >
                    <div className="text-[10px] text-gray-500 px-2 py-1 bg-gray-50 font-medium">
                      Frame {f.frame_number}/{frameSet.frame_count}
                    </div>
                    <img src={f.url} alt="" className="w-full h-auto" />
                  </div>
                ))}
              </div>

              {/* Prompt */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Prompt
                </label>
                <p className="text-sm text-gray-900">{frameSet.prompt}</p>
              </div>

              {/* Full prompt */}
              {frameSet.full_prompt && frameSet.full_prompt !== frameSet.prompt && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Full Prompt (assembled)
                  </label>
                  <div className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                    {showFullPrompt ? (
                      <pre className="whitespace-pre-wrap font-mono text-xs">
                        {frameSet.full_prompt}
                      </pre>
                    ) : (
                      <>
                        <pre className="whitespace-pre-wrap font-mono text-xs line-clamp-3">
                          {frameSet.full_prompt}
                        </pre>
                        <button
                          onClick={() => setShowFullPrompt(true)}
                          className="text-indigo-600 hover:text-indigo-800 text-xs mt-1"
                        >
                          Show more
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">
                  {frameSet.aspect_ratio}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs ${
                    frameSet.status === "complete"
                      ? "bg-green-50 text-green-600"
                      : frameSet.status === "failed"
                      ? "bg-red-50 text-red-600"
                      : "bg-yellow-50 text-yellow-600"
                  }`}
                >
                  {frameSet.status}
                </span>
                <span>{timeAgo(frameSet.created_at)}</span>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        {!loading && frameSet && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center gap-3">
            <button
              onClick={handleDelete}
              className="px-4 py-2 bg-white text-red-600 text-sm font-medium rounded-lg border border-red-200 hover:bg-red-50 transition-colors"
            >
              Delete
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors ml-auto"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Main Page ──────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function Frames() {
  const { session } = useAuth();
  const token = session?.access_token || "";
  const { selectedBrand, loading: brandLoading } = useBrand();

  const brandId = selectedBrand?.id || "";

  // Generation form state
  const [contentTypeId, setContentTypeId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"1:1" | "9:16">("9:16");
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // Gallery state
  const [frameSets, setFrameSets] = useState<FrameSetSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingGallery, setLoadingGallery] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedFrameSet, setSelectedFrameSet] = useState<FrameSetFull | null>(
    null
  );
  const [selectedFrames, setSelectedFrames] = useState<Frame[]>([]);
  const [sidebarLoading, setSidebarLoading] = useState(false);

  // Fetch frame sets
  const fetchFrameSets = useCallback(
    async (pageNum: number, append: boolean = false) => {
      if (!token || !brandId) {
        setFrameSets([]);
        setTotal(0);
        setLoadingGallery(false);
        return;
      }
      try {
        const data = await api<{
          frameSets: FrameSetSummary[];
          total: number;
          page: number;
          limit: number;
        }>(`/brands/${brandId}/frames?page=${pageNum}&limit=${PAGE_SIZE}`, {
          token,
        });
        if (append) {
          setFrameSets((prev) => [...prev, ...data.frameSets]);
        } else {
          setFrameSets(data.frameSets);
        }
        setTotal(data.total);
        setPage(pageNum);
      } catch (err) {
        console.error("Failed to fetch frame sets:", err);
      } finally {
        setLoadingGallery(false);
        setLoadingMore(false);
      }
    },
    [token, brandId]
  );

  useEffect(() => {
    setLoadingGallery(true);
    setPage(1);
    setContentTypeId(null);
    setPrompt("");
    setAspectRatio("9:16");
    setSelectedSkillIds([]);
    fetchFrameSets(1);
  }, [fetchFrameSets]);

  // Generate handler
  const handleGenerate = async () => {
    if (!prompt.trim() || !token || !brandId) return;
    setGenerating(true);
    setGenError(null);
    try {
      await api(`/brands/${brandId}/frames/generate`, {
        method: "POST",
        body: {
          prompt: prompt.trim(),
          content_type_id: contentTypeId,
          aspect_ratio: aspectRatio,
          skill_ids:
            selectedSkillIds.length > 0 ? selectedSkillIds : undefined,
        },
        token,
      });
      await fetchFrameSets(1);
    } catch (err) {
      setGenError(
        err instanceof Error ? err.message : "Frame generation failed"
      );
    } finally {
      setGenerating(false);
    }
  };

  // Content type change
  const handleContentTypeChange = (
    id: string | null,
    defaultAspectRatio?: string
  ) => {
    setContentTypeId(id);
    if (defaultAspectRatio === "1:1" || defaultAspectRatio === "9:16") {
      setAspectRatio(defaultAspectRatio);
    }
  };

  // Load more
  const handleLoadMore = () => {
    setLoadingMore(true);
    fetchFrameSets(page + 1, true);
  };

  // Open detail sidebar
  const handleCardClick = async (fs: FrameSetSummary) => {
    if (!token || !brandId) return;
    setSidebarLoading(true);
    setSidebarOpen(true);
    try {
      const data = await api<{ frameSet: FrameSetFull; frames: Frame[] }>(
        `/brands/${brandId}/frames/${fs.id}`,
        { token }
      );
      setSelectedFrameSet(data.frameSet);
      setSelectedFrames(data.frames);
    } catch (err) {
      console.error("Failed to fetch frame set details:", err);
      setSidebarOpen(false);
    } finally {
      setSidebarLoading(false);
    }
  };

  const handleCloseSidebar = () => {
    setSidebarOpen(false);
    setTimeout(() => {
      setSelectedFrameSet(null);
      setSelectedFrames([]);
    }, 300);
  };

  // Delete
  const handleDelete = async (frameSetId: string) => {
    const previousSets = frameSets;
    const previousTotal = total;

    setFrameSets((prev) => prev.filter((fs) => fs.id !== frameSetId));
    setTotal((prev) => prev - 1);
    handleCloseSidebar();

    try {
      await api(`/brands/${brandId}/frames/${frameSetId}`, {
        method: "DELETE",
        token,
      });
    } catch (err) {
      setFrameSets(previousSets);
      setTotal(previousTotal);
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  };

  // Ctrl+Enter to generate
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

  const hasMore = frameSets.length < total;

  return (
    <div className="max-w-5xl mx-auto py-6 px-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Video Frames</h1>
        <p className="mt-1 text-sm text-gray-500">
          Generate 5 sequential frames for video content for{" "}
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

        {/* Top row: Content Type + Aspect Ratio */}
        <div className="flex items-end gap-3 mb-3">
          <div className="flex-1">
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
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Ratio
            </label>
            <AspectRatioToggle value={aspectRatio} onChange={setAspectRatio} />
          </div>
        </div>

        {/* Skills */}
        <div className="mb-3">
          <SkillPicker
            action="frames"
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
            placeholder="Describe the video sequence you want to generate (5 frames will be created)..."
            disabled={generating}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none disabled:opacity-50"
          />
        </div>

        {/* Generate button */}
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-gray-400">
            Generates 5 frames sequentially (~2 min). Each frame references
            the previous for visual continuity.{" "}
            <span className="text-gray-300">Cmd+Enter to generate</span>
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
                Generating frames...
              </span>
            ) : (
              "Generate 5 Frames"
            )}
          </button>
        </div>
      </div>

      {/* Frame Sets Gallery */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Generated Frame Sets
          {total > 0 && (
            <span className="text-sm font-normal text-gray-400 ml-2">
              ({total})
            </span>
          )}
        </h2>

        {loadingGallery ? (
          <div className="text-gray-400 text-sm py-12 text-center">
            Loading frame sets...
          </div>
        ) : frameSets.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4 opacity-50">🎬</div>
            <h3 className="text-lg font-medium text-gray-400 mb-1">
              No frame sets generated yet
            </h3>
            <p className="text-gray-400 text-sm">
              Use the form above to generate your first set of video frames.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {frameSets.map((fs) => (
              <button
                key={fs.id}
                onClick={() => handleCardClick(fs)}
                className="w-full text-left bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:border-indigo-300 hover:shadow-md transition-all group"
              >
                {/* Frame strip */}
                <div className="flex gap-1.5 mb-3">
                  {fs.frames.map((f) => (
                    <div
                      key={f.id}
                      className="flex-1 aspect-[9/16] rounded-lg overflow-hidden bg-gray-100"
                    >
                      <img
                        src={f.url}
                        alt={`Frame ${f.frame_number}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                  {/* Placeholder slots for incomplete sets */}
                  {Array.from({
                    length: fs.frame_count - fs.frames.length,
                  }).map((_, i) => (
                    <div
                      key={`placeholder-${i}`}
                      className="flex-1 aspect-[9/16] rounded-lg bg-gray-100 flex items-center justify-center"
                    >
                      <span className="text-gray-300 text-xs">--</span>
                    </div>
                  ))}
                </div>

                {/* Meta row */}
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-700 truncate max-w-md group-hover:text-indigo-600 transition-colors">
                    {fs.prompt}
                  </p>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                      {fs.aspect_ratio}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        fs.status === "complete"
                          ? "bg-green-50 text-green-600"
                          : fs.status === "failed"
                          ? "bg-red-50 text-red-600"
                          : "bg-yellow-50 text-yellow-600"
                      }`}
                    >
                      {fs.status}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {timeAgo(fs.created_at)}
                    </span>
                  </div>
                </div>
              </button>
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

      {/* Detail Sidebar */}
      <FrameDetailSidebar
        frameSet={selectedFrameSet}
        frames={selectedFrames}
        open={sidebarOpen}
        loading={sidebarLoading}
        onClose={handleCloseSidebar}
        onDelete={handleDelete}
      />
    </div>
  );
}
