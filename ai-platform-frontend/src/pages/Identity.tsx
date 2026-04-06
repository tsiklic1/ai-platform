import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useBrand } from "../context/BrandContext";
import { api, apiUpload } from "../lib/api";
import { NoBrandPrompt } from "../components/NoBrandPrompt";
import { ImageDropZone } from "../components/ImageDropZone";

// ─── Types ──────────────────────────────────────────────────

interface ProductImage {
  id: string;
  product_id: string;
  storage_path: string;
  url: string;
  sort_order: number;
  created_at: string;
}

interface Product {
  id: string;
  brand_id: string;
  name: string;
  description: string | null;
  category: string | null;
  created_at: string;
  updated_at: string;
  brand_product_images: ProductImage[];
}

// ─── Product Sidebar ────────────────────────────────────────

interface SidebarProps {
  product: Product | null;
  isNew: boolean;
  open: boolean;
  saving: boolean;
  brandId: string;
  token: string;
  removedImageIds: Set<string>;
  onClose: () => void;
  onSave: (data: { name: string; description: string; category: string }) => void;
  onDelete: () => void;
  onRefresh: () => Promise<void>;
  onImageRemoved: (imageId: string) => void;
  onImageRemoveFailed: (imageId: string) => void;
}

function ProductSidebar({
  product,
  isNew,
  open,
  saving,
  brandId,
  token,
  removedImageIds,
  onClose,
  onSave,
  onDelete,
  onRefresh,
  onImageRemoved,
  onImageRemoveFailed,
}: SidebarProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (isNew) {
      setName("");
      setDescription("");
      setCategory("");
    } else if (product) {
      setName(product.name);
      setDescription(product.description || "");
      setCategory(product.category || "");
    }
  }, [product, isNew]);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      description: description.trim(),
      category: category.trim(),
    });
  };

  const handleFileSelected = async (file: File) => {
    if (!product) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      await apiUpload(
        `/brands/${brandId}/products/${product.id}/images`,
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
    if (!product) return;
    if (!window.confirm("Delete this image?")) return;

    // Optimistic: hide immediately (parent owns the state)
    onImageRemoved(imageId);

    // Delete in background
    api(
      `/brands/${brandId}/products/${product.id}/images/${imageId}`,
      { method: "DELETE", token }
    )
      .then(() => onRefresh())
      .catch((err) => {
        onImageRemoveFailed(imageId);
        alert(err instanceof Error ? err.message : "Delete failed");
      });
  };

  const images = (product?.brand_product_images ?? []).filter(
    (img) => !removedImageIds.has(img.id)
  );

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      <div
        className={`fixed top-0 right-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {isNew ? "New Product" : "Edit Product"}
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder="e.g. Premium Coffee Blend"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Beverages"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Brief description of this product"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"
            />
          </div>

          {/* Image section — only for existing products */}
          {!isNew && product && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Product Images ({images.length}/5)
              </label>

              {/* Image gallery */}
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

              {/* Upload zone */}
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
              Create the product first, then you can add images.
            </p>
          )}
        </div>

        {/* Footer */}
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
      </div>
    </>
  );
}

// ─── Main Page ──────────────────────────────────────────────

export default function Identity() {
  const { session } = useAuth();
  const token = session?.access_token || "";
  const { selectedBrand, loading: brandLoading } = useBrand();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removedImageIds, setRemovedImageIds] = useState<Set<string>>(new Set());

  const brandId = selectedBrand?.id || "";

  // Track selected product ID in a ref so fetchProducts always sees latest
  const selectedProductIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedProductIdRef.current = selectedProduct?.id ?? null;
  }, [selectedProduct]);

  // Fetch products
  const fetchProducts = useCallback(async () => {
    if (!token || !brandId) {
      setProducts([]);
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const data = await api<{ products: Product[] }>(
        `/brands/${brandId}/products`,
        { token }
      );
      setProducts(data.products);

      // Update selected product if sidebar is open (to refresh images)
      const currentId = selectedProductIdRef.current;
      if (currentId) {
        const updated = data.products.find((p) => p.id === currentId);
        if (updated) setSelectedProduct(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [token, brandId]);

  useEffect(() => {
    setLoading(true);
    fetchProducts();
  }, [fetchProducts]);

  // Sidebar handlers
  const handleNew = () => {
    setSelectedProduct(null);
    setIsNew(true);
    setSidebarOpen(true);
  };

  const handleCardClick = (product: Product) => {
    setSelectedProduct(product);
    setIsNew(false);
    setSidebarOpen(true);
  };

  const handleClose = () => {
    setSidebarOpen(false);
    setTimeout(() => {
      setSelectedProduct(null);
      setIsNew(false);
    }, 300);
  };

  const handleSave = async (data: {
    name: string;
    description: string;
    category: string;
  }) => {
    if (!token || !brandId) return;
    setSaving(true);
    try {
      if (isNew) {
        await api(`/brands/${brandId}/products`, {
          method: "POST",
          body: data,
          token,
        });
      } else if (selectedProduct) {
        await api(`/brands/${brandId}/products/${selectedProduct.id}`, {
          method: "PUT",
          body: data,
          token,
        });
      }
      handleClose();
      await fetchProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save product");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedProduct || !token || !brandId) return;
    if (
      !window.confirm(
        `Delete "${selectedProduct.name}"? This will remove the product and all its images. This cannot be undone.`
      )
    )
      return;
    setSaving(true);
    try {
      await api(`/brands/${brandId}/products/${selectedProduct.id}`, {
        method: "DELETE",
        token,
      });
      handleClose();
      await fetchProducts();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete product"
      );
    } finally {
      setSaving(false);
    }
  };

  // Loading / no brand states
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
            Brand Identity — {selectedBrand.name}
          </h1>
          <p className="mt-1 text-gray-500 text-sm">
            Manage your products and their reference images.
          </p>
        </div>
        <button
          onClick={handleNew}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Add Product
        </button>
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
          Loading products...
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📦</div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">
            No products yet
          </h3>
          <p className="text-gray-500 text-sm mb-4">
            Add products and upload reference images to establish your brand's
            visual identity.
          </p>
          <button
            onClick={handleNew}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Add your first product
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product) => {
            const images = product.brand_product_images.filter(
              (img) => !removedImageIds.has(img.id)
            );
            const thumb = images[0]?.url;

            return (
              <button
                key={product.id}
                onClick={() => handleCardClick(product)}
                className="text-left rounded-xl border border-gray-200 bg-white hover:border-indigo-300 hover:shadow-md transition-all group overflow-hidden"
              >
                {/* Thumbnail */}
                {thumb ? (
                  <div className="aspect-video bg-gray-100">
                    <img
                      src={thumb}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="aspect-video bg-gray-50 flex items-center justify-center">
                    <span className="text-2xl text-gray-300">📷</span>
                  </div>
                )}

                {/* Info */}
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors truncate">
                    {product.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1.5">
                    {product.category && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {product.category}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {images.length}/5 images
                    </span>
                  </div>
                </div>
              </button>
            );
          })}

          {/* Add product card */}
          <button
            onClick={handleNew}
            className="rounded-xl border-2 border-dashed border-gray-300 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all flex flex-col items-center justify-center min-h-[200px] group"
          >
            <span className="text-3xl text-gray-300 group-hover:text-indigo-400 transition-colors">
              +
            </span>
            <span className="mt-1 text-sm text-gray-400 group-hover:text-indigo-500 transition-colors">
              Add Product
            </span>
          </button>
        </div>
      )}

      {/* Sidebar */}
      <ProductSidebar
        product={selectedProduct}
        isNew={isNew}
        open={sidebarOpen}
        saving={saving}
        brandId={brandId}
        token={token}
        removedImageIds={removedImageIds}
        onClose={handleClose}
        onSave={handleSave}
        onDelete={handleDelete}
        onRefresh={fetchProducts}
        onImageRemoved={(id) =>
          setRemovedImageIds((prev) => new Set(prev).add(id))
        }
        onImageRemoveFailed={(id) =>
          setRemovedImageIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          })
        }
      />
    </div>
  );
}
