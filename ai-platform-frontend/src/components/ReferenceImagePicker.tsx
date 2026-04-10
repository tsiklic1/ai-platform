import { useState, useEffect } from "react";
import { api } from "../lib/api";

// ─── Types ──────────────────────────────────────────────────

export interface SelectedReferenceImage {
  source: "generated_image" | "product_image";
  id: string;
  url: string;
}

interface ProductImage {
  id: string;
  url: string;
  productName: string;
}

interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  created_at: string;
}

interface ReferenceImagePickerProps {
  brandId: string;
  token: string;
  open: boolean;
  maxSelect?: number;
  already?: SelectedReferenceImage[];
  onSelect: (images: SelectedReferenceImage[]) => void;
  onClose: () => void;
}

// ─── Component ──────────────────────────────────────────────

export function ReferenceImagePicker({
  brandId,
  token,
  open,
  maxSelect = 1,
  already = [],
  onSelect,
  onClose,
}: ReferenceImagePickerProps) {
  const [tab, setTab] = useState<"product" | "generated">("product");
  const [productImages, setProductImages] = useState<ProductImage[]>([]);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingGenerated, setLoadingGenerated] = useState(false);
  const [selected, setSelected] = useState<SelectedReferenceImage[]>([]);

  // Fetch product images when modal opens
  useEffect(() => {
    if (!open || !brandId || !token) return;
    setSelected(already);

    setLoadingProducts(true);
    api<{
      products: Array<{
        id: string;
        name: string;
        brand_product_images: Array<{ id: string; url: string }>;
      }>;
    }>(`/brands/${brandId}/products`, { token })
      .then((data) => {
        const images: ProductImage[] = [];
        for (const p of data.products) {
          for (const img of p.brand_product_images || []) {
            images.push({
              id: img.id,
              url: img.url,
              productName: p.name,
            });
          }
        }
        setProductImages(images);
      })
      .catch((err) => console.error("Failed to fetch product images:", err))
      .finally(() => setLoadingProducts(false));

    setLoadingGenerated(true);
    api<{
      images: Array<{
        id: string;
        url: string;
        prompt: string;
        created_at: string;
      }>;
    }>(`/brands/${brandId}/images?limit=50`, { token })
      .then((data) => setGeneratedImages(data.images))
      .catch((err) => console.error("Failed to fetch generated images:", err))
      .finally(() => setLoadingGenerated(false));
  }, [open, brandId, token]);

  if (!open) return null;

  const toggleImage = (img: SelectedReferenceImage) => {
    setSelected((prev) => {
      const exists = prev.findIndex((s) => s.id === img.id);
      if (exists >= 0) return prev.filter((s) => s.id !== img.id);
      if (prev.length >= maxSelect) {
        // Replace the last one if at limit
        return [...prev.slice(0, maxSelect - 1), img];
      }
      return [...prev, img];
    });
  };

  const handleConfirm = () => {
    if (selected.length > 0) {
      onSelect(selected);
    }
  };

  const isLoading = tab === "product" ? loadingProducts : loadingGenerated;
  const isEmpty =
    tab === "product"
      ? !loadingProducts && productImages.length === 0
      : !loadingGenerated && generatedImages.length === 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Choose Reference {maxSelect > 1 ? "Images" : "Image"}
              {maxSelect > 1 && (
                <span className="text-sm font-normal text-gray-400 ml-2">
                  {selected.length}/{maxSelect}
                </span>
              )}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors text-2xl leading-none"
            >
              &times;
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 px-6">
            <button
              onClick={() => setTab("product")}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === "product"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Product Images
            </button>
            <button
              onClick={() => setTab("generated")}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === "generated"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Generated Images
            </button>
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
            {isLoading ? (
              <div className="grid grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square rounded-lg bg-gray-100 animate-pulse"
                  />
                ))}
              </div>
            ) : isEmpty ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                {tab === "product"
                  ? "No product images found. Upload images on the Brand Identity page."
                  : "No generated images yet. Generate images on the Pictures page."}
              </div>
            ) : tab === "product" ? (
              <div>
                {/* Group by product name */}
                {(() => {
                  const grouped: Record<string, ProductImage[]> = {};
                  for (const img of productImages) {
                    if (!grouped[img.productName]) grouped[img.productName] = [];
                    grouped[img.productName].push(img);
                  }
                  return Object.entries(grouped).map(([name, imgs]) => (
                    <div key={name} className="mb-4">
                      <p className="text-xs font-medium text-gray-500 mb-2">
                        {name}
                      </p>
                      <div className="grid grid-cols-4 gap-3">
                        {imgs.map((img) => {
                          const selIdx = selected.findIndex((s) => s.id === img.id);
                          return (
                            <button
                              key={img.id}
                              onClick={() =>
                                toggleImage({
                                  source: "product_image",
                                  id: img.id,
                                  url: img.url,
                                })
                              }
                              className={`relative aspect-square rounded-lg overflow-hidden bg-gray-100 ring-2 transition-all ${
                                selIdx >= 0
                                  ? "ring-indigo-500 ring-offset-2"
                                  : "ring-transparent hover:ring-gray-300"
                              }`}
                            >
                              <img
                                src={img.url}
                                alt={name}
                                className="w-full h-full object-cover"
                              />
                              {selIdx >= 0 && maxSelect > 1 && (
                                <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">
                                  {selIdx + 1}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-3">
                {generatedImages.map((img) => {
                  const selIdx = selected.findIndex((s) => s.id === img.id);
                  return (
                    <button
                      key={img.id}
                      onClick={() =>
                        toggleImage({
                          source: "generated_image",
                          id: img.id,
                          url: img.url,
                        })
                      }
                      className={`group relative aspect-square rounded-lg overflow-hidden bg-gray-100 ring-2 transition-all ${
                        selIdx >= 0
                          ? "ring-indigo-500 ring-offset-2"
                          : "ring-transparent hover:ring-gray-300"
                      }`}
                    >
                      <img
                        src={img.url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                      {selIdx >= 0 && maxSelect > 1 && (
                        <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">
                          {selIdx + 1}
                        </span>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-[10px] text-white truncate">
                          {img.prompt}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={selected.length === 0}
              className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {maxSelect > 1 && selected.length > 0
                ? `Select ${selected.length} image${selected.length > 1 ? "s" : ""}`
                : "Select"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
