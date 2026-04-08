import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useBrand } from "../context/BrandContext";
import { api } from "../lib/api";
import { NoBrandPrompt } from "../components/NoBrandPrompt";
import { AspectRatioToggle } from "../components/AspectRatioToggle";
import { ContentTypeSelector } from "../components/ContentTypeSelector";
import { SkillPicker } from "../components/SkillPicker";

// ─── Types ──────────────────────────────────────────────────

interface GeneratedImage {
  id: string;
  prompt: string;
  aspect_ratio: string;
  content_type_id: string | null;
  url: string;
  created_at: string;
}

interface GeneratedImageFull extends GeneratedImage {
  user_id: string;
  brand_id: string;
  full_prompt: string;
  storage_path: string;
}

interface ContentTypeSummary {
  id: string;
  name: string;
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
  image: GeneratedImageFull | null;
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
}

function ImageDetailSidebar({
  image,
  open,
  loading,
  onClose,
  onDelete,
}: SidebarProps) {
  const [showFullPrompt, setShowFullPrompt] = useState(false);

  // Reset expand state when image changes
  useEffect(() => {
    setShowFullPrompt(false);
  }, [image?.id]);

  const handleDownload = () => {
    if (!image) return;
    const a = document.createElement("a");
    a.href = image.url;
    a.download = `generated-${image.id}.${image.url.includes(".png") ? "png" : "jpg"}`;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDelete = () => {
    if (!image) return;
    if (
      !window.confirm(
        "Delete this generated image? This cannot be undone."
      )
    )
      return;
    onDelete(image.id);
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
        className={`fixed top-0 right-0 h-full w-full max-w-xl bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Image Details
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
          ) : image ? (
            <>
              {/* Full image */}
              <div className="rounded-lg overflow-hidden bg-gray-100">
                <img
                  src={image.url}
                  alt=""
                  className="w-full h-auto"
                />
              </div>

              {/* Prompt */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Prompt
                </label>
                <p className="text-sm text-gray-900">{image.prompt}</p>
              </div>

              {/* Full prompt */}
              {image.full_prompt && image.full_prompt !== image.prompt && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Full Prompt (assembled)
                  </label>
                  <div className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                    {showFullPrompt ? (
                      <pre className="whitespace-pre-wrap font-mono text-xs">
                        {image.full_prompt}
                      </pre>
                    ) : (
                      <>
                        <pre className="whitespace-pre-wrap font-mono text-xs line-clamp-3">
                          {image.full_prompt}
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
                  {image.aspect_ratio}
                </span>
                <span>{timeAgo(image.created_at)}</span>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        {!loading && image && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center gap-3">
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Download
            </button>
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

export default function Images() {
  const { session } = useAuth();
  const token = session?.access_token || "";
  const { selectedBrand, loading: brandLoading } = useBrand();

  const brandId = selectedBrand?.id || "";

  // Generation form state
  const [contentTypeId, setContentTypeId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"1:1" | "9:16">("1:1");
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // Gallery state
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingGallery, setLoadingGallery] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filterContentTypeId, setFilterContentTypeId] = useState<string>("");
  const [filterContentTypes, setFilterContentTypes] = useState<
    ContentTypeSummary[]
  >([]);

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<GeneratedImageFull | null>(
    null
  );
  const [sidebarLoading, setSidebarLoading] = useState(false);

  // Fetch gallery
  const fetchImages = useCallback(
    async (pageNum: number, append: boolean = false) => {
      if (!token || !brandId) {
        setImages([]);
        setTotal(0);
        setLoadingGallery(false);
        return;
      }
      try {
        const params = new URLSearchParams({
          page: String(pageNum),
          limit: String(PAGE_SIZE),
        });
        if (filterContentTypeId) {
          params.set("content_type_id", filterContentTypeId);
        }
        const data = await api<{
          images: GeneratedImage[];
          total: number;
          page: number;
          limit: number;
        }>(`/brands/${brandId}/images?${params.toString()}`, {
          token,
        });
        if (append) {
          setImages((prev) => [...prev, ...data.images]);
        } else {
          setImages(data.images);
        }
        setTotal(data.total);
        setPage(pageNum);
      } catch (err) {
        console.error("Failed to fetch images:", err);
      } finally {
        setLoadingGallery(false);
        setLoadingMore(false);
      }
    },
    [token, brandId, filterContentTypeId]
  );

  // Reset form + filter when brand changes
  useEffect(() => {
    setContentTypeId(null);
    setPrompt("");
    setAspectRatio("1:1");
    setSelectedSkillIds([]);
    setFilterContentTypeId("");
  }, [brandId]);

  // Fetch filter dropdown options when brand changes
  useEffect(() => {
    if (!token || !brandId) {
      setFilterContentTypes([]);
      return;
    }
    api<{ contentTypes: ContentTypeSummary[] }>(
      `/brands/${brandId}/content-types`,
      { token }
    )
      .then((data) => setFilterContentTypes(data.contentTypes))
      .catch((err) => console.error("Failed to fetch content types:", err));
  }, [token, brandId]);

  // Refetch gallery whenever brand or filter changes
  useEffect(() => {
    setLoadingGallery(true);
    setPage(1);
    fetchImages(1);
  }, [fetchImages]);

  // Generate handler
  const handleGenerate = async () => {
    if (!prompt.trim() || !token || !brandId) return;
    setGenerating(true);
    setGenError(null);
    try {
      await api(`/brands/${brandId}/images/generate`, {
        method: "POST",
        body: {
          prompt: prompt.trim(),
          content_type_id: contentTypeId,
          aspect_ratio: aspectRatio,
          skill_ids: selectedSkillIds.length > 0 ? selectedSkillIds : undefined,
        },
        token,
      });
      // Refetch gallery from page 1 so new image appears first
      await fetchImages(1);
    } catch (err) {
      setGenError(
        err instanceof Error ? err.message : "Generation failed"
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
    fetchImages(page + 1, true);
  };

  // Open detail sidebar
  const handleCardClick = async (img: GeneratedImage) => {
    if (!token || !brandId) return;
    setSidebarLoading(true);
    setSidebarOpen(true);
    try {
      const data = await api<{ image: GeneratedImageFull }>(
        `/brands/${brandId}/images/${img.id}`,
        { token }
      );
      setSelectedImage(data.image);
    } catch (err) {
      console.error("Failed to fetch image details:", err);
      setSidebarOpen(false);
    } finally {
      setSidebarLoading(false);
    }
  };

  const handleCloseSidebar = () => {
    setSidebarOpen(false);
    setTimeout(() => setSelectedImage(null), 300);
  };

  // Delete (optimistic)
  const handleDelete = async (imageId: string) => {
    const previousImages = images;
    const previousTotal = total;

    setImages((prev) => prev.filter((img) => img.id !== imageId));
    setTotal((prev) => prev - 1);
    handleCloseSidebar();

    try {
      await api(`/brands/${brandId}/images/${imageId}`, {
        method: "DELETE",
        token,
      });
    } catch (err) {
      // Revert
      setImages(previousImages);
      setTotal(previousTotal);
      alert(err instanceof Error ? err.message : "Delete failed");
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

  const hasMore = images.length < total;

  return (
    <div className="relative min-h-[calc(100vh-2rem)]">
      {/* Gallery Background */}
      <div className="pb-64">
        {/* Filter bar */}
        {filterContentTypes.length > 0 && (
          <div className="flex items-center gap-2 mb-4">
            <label className="text-xs font-medium text-gray-500">
              Filter by content type
            </label>
            <select
              value={filterContentTypeId}
              onChange={(e) => setFilterContentTypeId(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">All</option>
              {filterContentTypes.map((ct) => (
                <option key={ct.id} value={ct.id}>
                  {ct.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {loadingGallery ? (
          <div className="text-gray-400 text-sm py-24 text-center">
            Loading images...
          </div>
        ) : images.length === 0 ? (
          <div className="text-center py-24">
            <div className="text-5xl mb-4 opacity-50">🖼️</div>
            <h3 className="text-lg font-medium text-gray-400 mb-1">
              {filterContentTypeId
                ? "No images for this content type"
                : "No images generated yet"}
            </h3>
            <p className="text-gray-400 text-sm">
              {filterContentTypeId
                ? "Try a different filter or generate one below."
                : "Use the prompt below to create your first image."}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {images.map((img) => (
                <button
                  key={img.id}
                  onClick={() => handleCardClick(img)}
                  className="aspect-square rounded-lg overflow-hidden bg-gray-100 hover:opacity-90 hover:ring-2 hover:ring-indigo-400 transition-all group relative"
                >
                  <img
                    src={img.url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  {/* Hover overlay with prompt */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity p-2 w-full">
                      <p className="text-white text-xs line-clamp-2 drop-shadow">
                        {img.prompt}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[10px] bg-white/20 text-white px-1.5 py-0.5 rounded">
                          {img.aspect_ratio}
                        </span>
                        <span className="text-[10px] text-white/70">
                          {timeAgo(img.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="text-center mt-4 mb-4">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="px-6 py-2 bg-white/80 backdrop-blur text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-white disabled:opacity-50 transition-colors"
                >
                  {loadingMore ? "Loading..." : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Floating Generation Form */}
      <div className="fixed bottom-[10%] left-64 right-0 z-30 px-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-lg p-4 max-w-3xl mx-auto">
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
              action="image"
              token={token}
              selectedIds={selectedSkillIds}
              onChange={setSelectedSkillIds}
            />
          </div>

          {/* Prompt + Generate button row */}
          <div className="flex gap-2">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              placeholder="Describe the image you want to generate..."
              disabled={generating}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none disabled:opacity-50"
            />
            <button
              onClick={handleGenerate}
              disabled={generating || !prompt.trim()}
              className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-end shrink-0"
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
                "Generate"
              )}
            </button>
          </div>

          {/* Warning */}
          <p className="text-[10px] text-gray-400 mt-2">
            ⚠ Generation may take up to 30 seconds. Product images are used as
            references automatically.
          </p>
        </div>
      </div>

      {/* Detail Sidebar */}
      <ImageDetailSidebar
        image={selectedImage}
        open={sidebarOpen}
        loading={sidebarLoading}
        onClose={handleCloseSidebar}
        onDelete={handleDelete}
      />
    </div>
  );
}
