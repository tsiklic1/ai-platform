import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useBrand } from "../context/BrandContext";
import { api, apiUpload } from "../lib/api";
import { NoBrandPrompt } from "../components/NoBrandPrompt";
import { AspectRatioToggle } from "../components/AspectRatioToggle";
import { ImageDropZone } from "../components/ImageDropZone";

// ─── Types ──────────────────────────────────────────────────

interface ContentTypeSummary {
  id: string;
  name: string;
  description: string | null;
  default_aspect_ratio: string;
  is_default: boolean;
  sort_order: number;
}

interface ContentTypeImage {
  id: string;
  content_type_id: string;
  storage_path: string;
  url: string;
  sort_order: number;
  created_at: string;
}

interface ContentTypeFull extends ContentTypeSummary {
  user_id: string;
  brand_id: string;
  text_prompt_template: string | null;
  image_prompt_template: string | null;
  image_style: string | null;
  created_at: string;
  updated_at: string;
  content_type_images: ContentTypeImage[];
}

// ─── Sidebar ────────────────────────────────────────────────

interface SidebarProps {
  contentType: ContentTypeFull | null;
  isNew: boolean;
  open: boolean;
  saving: boolean;
  loading: boolean;
  brandId: string;
  token: string;
  onClose: () => void;
  onSave: (data: {
    name: string;
    description: string;
    default_aspect_ratio: "1:1" | "9:16";
    image_style: string;
    image_prompt_template: string;
    text_prompt_template: string;
  }) => void;
  onDelete: () => void;
  onRefresh: () => Promise<void>;
}

function ContentTypeSidebar({
  contentType,
  isNew,
  open,
  saving,
  loading,
  brandId,
  token,
  onClose,
  onSave,
  onDelete,
  onRefresh,
}: SidebarProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"1:1" | "9:16">("1:1");
  const [imageStyle, setImageStyle] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [textPrompt, setTextPrompt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [removedImageIds, setRemovedImageIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setRemovedImageIds(new Set());
  }, [contentType?.id]);

  const images = (contentType?.content_type_images ?? []).filter(
    (img) => !removedImageIds.has(img.id)
  );

  const handleFileSelected = async (file: File) => {
    if (!contentType) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      await apiUpload(
        `/brands/${brandId}/content-types/${contentType.id}/images`,
        formData,
        token
      );
      await onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteImage = (imageId: string) => {
    if (!contentType) return;
    if (!window.confirm("Delete this reference image?")) return;

    setRemovedImageIds((prev) => new Set(prev).add(imageId));

    api(
      `/brands/${brandId}/content-types/${contentType.id}/images/${imageId}`,
      { method: "DELETE", token }
    )
      .then(() => onRefresh())
      .catch((err) => {
        setRemovedImageIds((prev) => {
          const next = new Set(prev);
          next.delete(imageId);
          return next;
        });
        alert(err instanceof Error ? err.message : "Delete failed");
      });
  };

  useEffect(() => {
    if (isNew) {
      setName("");
      setDescription("");
      setAspectRatio("1:1");
      setImageStyle("");
      setImagePrompt("");
      setTextPrompt("");
    } else if (contentType) {
      setName(contentType.name);
      setDescription(contentType.description || "");
      setAspectRatio(
        contentType.default_aspect_ratio === "9:16" ? "9:16" : "1:1"
      );
      setImageStyle(contentType.image_style || "");
      setImagePrompt(contentType.image_prompt_template || "");
      setTextPrompt(contentType.text_prompt_template || "");
    }
  }, [contentType, isNew]);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      description: description.trim(),
      default_aspect_ratio: aspectRatio,
      image_style: imageStyle.trim(),
      image_prompt_template: imagePrompt.trim(),
      text_prompt_template: textPrompt.trim(),
    });
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
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {isNew ? "New Content Type" : "Edit Content Type"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {loading ? (
            <div className="text-gray-400 text-sm py-8 text-center">
              Loading...
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  placeholder="e.g. Product Showcase"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of this content type"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Default Aspect Ratio
                </label>
                <AspectRatioToggle
                  value={aspectRatio}
                  onChange={setAspectRatio}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Image Style
                </label>
                <input
                  type="text"
                  value={imageStyle}
                  onChange={(e) => setImageStyle(e.target.value)}
                  placeholder="e.g. Studio lighting, clean background, sharp focus"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Image Prompt Template
                </label>
                <textarea
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  rows={6}
                  placeholder="Instructions for generating images with this content type..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"
                  style={{ minHeight: "150px" }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Text Prompt Template
                </label>
                <textarea
                  value={textPrompt}
                  onChange={(e) => setTextPrompt(e.target.value)}
                  rows={6}
                  placeholder="Instructions for generating captions/text with this content type..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"
                  style={{ minHeight: "150px" }}
                />
              </div>

              {/* Reference Images — only for existing content types */}
              {!isNew && contentType && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Reference Images ({images.length}/5)
                  </label>

                  {images.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {images.map((img) => (
                        <div key={img.id} className="relative group aspect-square">
                          <img
                            src={img.url}
                            alt=""
                            className="w-full h-full object-cover rounded-lg"
                          />
                          <button
                            onClick={() => handleDeleteImage(img.id)}
                            className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs leading-none"
                            title="Delete image"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <ImageDropZone
                    onFileSelected={handleFileSelected}
                    disabled={uploading}
                    imageCount={images.length}
                    maxImages={5}
                  />
                  {uploading && (
                    <p className="text-xs text-indigo-500 mt-1.5">Uploading...</p>
                  )}
                </div>
              )}

              {isNew && (
                <p className="text-xs text-gray-400 italic">
                  Create the content type first, then you can add reference images.
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving..." : isNew ? "Create" : "Save Changes"}
            </button>

            {!isNew && (
              <button
                onClick={onDelete}
                disabled={saving}
                className="px-4 py-2 bg-white text-red-600 text-sm font-medium rounded-lg border border-red-200 hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                Delete
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors ml-auto"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Main Page ──────────────────────────────────────────────

export default function ContentTypes() {
  const { session } = useAuth();
  const token = session?.access_token || "";
  const { selectedBrand, loading: brandLoading } = useBrand();

  const [contentTypes, setContentTypes] = useState<ContentTypeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedCT, setSelectedCT] = useState<ContentTypeFull | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sidebarLoading, setSidebarLoading] = useState(false);

  const brandId = selectedBrand?.id || "";

  // Fetch content types list
  const fetchContentTypes = useCallback(async () => {
    if (!token || !brandId) {
      setContentTypes([]);
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const data = await api<{ contentTypes: ContentTypeSummary[] }>(
        `/brands/${brandId}/content-types`,
        { token }
      );
      setContentTypes(data.contentTypes);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load content types"
      );
    } finally {
      setLoading(false);
    }
  }, [token, brandId]);

  useEffect(() => {
    setLoading(true);
    fetchContentTypes();
  }, [fetchContentTypes]);

  // Open sidebar for new content type
  const handleNew = () => {
    setSelectedCT(null);
    setIsNew(true);
    setSidebarOpen(true);
  };

  // Open sidebar for existing content type (fetch full data)
  const handleCardClick = async (ct: ContentTypeSummary) => {
    if (!token || !brandId) return;
    setIsNew(false);
    setSidebarLoading(true);
    setSidebarOpen(true);
    try {
      const data = await api<{ contentType: ContentTypeFull }>(
        `/brands/${brandId}/content-types/${ct.id}`,
        { token }
      );
      setSelectedCT(data.contentType);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load content type"
      );
      setSidebarOpen(false);
    } finally {
      setSidebarLoading(false);
    }
  };

  const handleClose = () => {
    setSidebarOpen(false);
    setTimeout(() => {
      setSelectedCT(null);
      setIsNew(false);
    }, 300);
  };

  const handleSave = async (data: {
    name: string;
    description: string;
    default_aspect_ratio: "1:1" | "9:16";
    image_style: string;
    image_prompt_template: string;
    text_prompt_template: string;
  }) => {
    if (!token || !brandId) return;
    setSaving(true);
    try {
      if (isNew) {
        await api(`/brands/${brandId}/content-types`, {
          method: "POST",
          body: data,
          token,
        });
      } else if (selectedCT) {
        await api(`/brands/${brandId}/content-types/${selectedCT.id}`, {
          method: "PUT",
          body: data,
          token,
        });
      }
      handleClose();
      await fetchContentTypes();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save content type"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedCT || !token || !brandId) return;
    if (
      !window.confirm(
        `Delete "${selectedCT.name}"? This content type will be removed. Any generated images using it will keep their data but lose the content type reference.`
      )
    )
      return;

    const deletedId = selectedCT.id;
    const previousList = contentTypes;

    // Optimistic: remove from list and close sidebar immediately
    setContentTypes((prev) => prev.filter((ct) => ct.id !== deletedId));
    handleClose();

    // Delete in background
    try {
      await api(`/brands/${brandId}/content-types/${deletedId}`, {
        method: "DELETE",
        token,
      });
      await fetchContentTypes();
    } catch (err) {
      // Revert on failure
      setContentTypes(previousList);
      setError(
        err instanceof Error ? err.message : "Failed to delete content type"
      );
    }
  };

  if (brandLoading) {
    return (
      <div className="text-gray-400 text-sm py-12 text-center">Loading...</div>
    );
  }

  if (!selectedBrand) {
    return <NoBrandPrompt />;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Content Types — {selectedBrand.name}
          </h1>
          <p className="mt-1 text-gray-500 text-sm">
            Define how your brand's content should be generated.
          </p>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-600 ml-4"
          >
            ×
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="text-gray-400 text-sm py-12 text-center">
          Loading content types...
        </div>
      ) : contentTypes.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📝</div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">
            No content types yet
          </h3>
          <p className="text-gray-500 text-sm mb-4">
            Create one to define how your brand's content should look.
          </p>
          <button
            onClick={handleNew}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Create content type
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {contentTypes.map((ct) => (
            <button
              key={ct.id}
              onClick={() => handleCardClick(ct)}
              className="text-left p-5 rounded-xl border border-gray-200 bg-white hover:border-indigo-300 hover:shadow-md transition-all group"
            >
              <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors truncate">
                {ct.name}
              </h3>
              {ct.description && (
                <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                  {ct.description}
                </p>
              )}
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {ct.default_aspect_ratio}
                </span>
                {ct.is_default && (
                  <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                    Default
                  </span>
                )}
              </div>
            </button>
          ))}

          {/* New content type card */}
          <button
            onClick={handleNew}
            className="p-5 rounded-xl border-2 border-dashed border-gray-300 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all flex flex-col items-center justify-center min-h-[120px] group"
          >
            <span className="text-3xl text-gray-300 group-hover:text-indigo-400 transition-colors">
              +
            </span>
            <span className="mt-1 text-sm text-gray-400 group-hover:text-indigo-500 transition-colors">
              New Content Type
            </span>
          </button>
        </div>
      )}

      {/* Sidebar */}
      <ContentTypeSidebar
        contentType={selectedCT}
        isNew={isNew}
        open={sidebarOpen}
        saving={saving}
        loading={sidebarLoading}
        brandId={brandId}
        token={token}
        onClose={handleClose}
        onSave={handleSave}
        onDelete={handleDelete}
        onRefresh={async () => {
          if (selectedCT) {
            try {
              const data = await api<{ contentType: ContentTypeFull }>(
                `/brands/${brandId}/content-types/${selectedCT.id}`,
                { token }
              );
              setSelectedCT(data.contentType);
            } catch (err) {
              console.error("Failed to refresh content type:", err);
            }
          }
        }}
      />
    </div>
  );
}
