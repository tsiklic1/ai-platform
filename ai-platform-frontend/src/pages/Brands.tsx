import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useBrand, type Brand } from "../context/BrandContext";
import { api } from "../lib/api";

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

// ─── Edit Sidebar ───────────────────────────────────────────

interface SidebarProps {
  brand: Brand | null;
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (data: { name: string; description: string }) => void;
  onDelete: () => void;
}

function BrandSidebar({
  brand,
  open,
  saving,
  onClose,
  onSave,
  onDelete,
}: SidebarProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (brand) {
      setName(brand.name);
      setDescription(brand.description || "");
    }
  }, [brand]);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), description: description.trim() });
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
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Edit Brand</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-2xl leading-none"
          >
            ×
          </button>
        </div>

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
              placeholder="Brief description of your brand"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>

          <button
            onClick={onDelete}
            disabled={saving}
            className="px-4 py-2 bg-white text-red-600 text-sm font-medium rounded-lg border border-red-200 hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            Delete
          </button>

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

export default function Brands() {
  const { session } = useAuth();
  const token = session?.access_token;
  const { brands, selectedBrand, loading, refreshBrands } = useBrand();
  const navigate = useNavigate();

  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [saving, setSaving] = useState(false);

  const handleCardClick = (brand: Brand) => {
    setEditingBrand(brand);
    setSidebarOpen(true);
  };

  const handleClose = () => {
    setSidebarOpen(false);
    setTimeout(() => setEditingBrand(null), 300);
  };

  const handleSave = async (data: { name: string; description: string }) => {
    if (!editingBrand || !token) return;
    setSaving(true);
    try {
      await api(`/brands/${editingBrand.id}`, {
        method: "PUT",
        body: data,
        token,
      });
      handleClose();
      await refreshBrands();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save brand");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingBrand || !token) return;
    if (
      !window.confirm(
        `Delete "${editingBrand.name}"? This will remove all products, content types, and generated images for this brand. This cannot be undone.`
      )
    )
      return;
    setSaving(true);
    try {
      await api(`/brands/${editingBrand.id}`, { method: "DELETE", token });
      handleClose();
      await refreshBrands();
      // If deleted brand was selected, context will auto-fallback to first brand
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete brand");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Brands</h1>
          <p className="mt-1 text-gray-500 text-sm">
            Manage your brands and their identities.
          </p>
        </div>
        <button
          onClick={() => navigate("/brands/new")}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Create Brand
        </button>
      </div>

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

      {loading ? (
        <div className="text-gray-400 text-sm py-12 text-center">
          Loading brands...
        </div>
      ) : brands.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🏢</div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">
            No brands yet
          </h3>
          <p className="text-gray-500 text-sm mb-4">
            Create your first brand to start generating content.
          </p>
          <button
            onClick={() => navigate("/brands/new")}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Create your first brand
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {brands.map((brand) => (
            <button
              key={brand.id}
              onClick={() => handleCardClick(brand)}
              className={`text-left p-5 rounded-xl border bg-white hover:shadow-md transition-all group ${
                selectedBrand?.id === brand.id
                  ? "border-indigo-300 ring-1 ring-indigo-200"
                  : "border-gray-200 hover:border-indigo-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors truncate">
                  {brand.name}
                </h3>
                {selectedBrand?.id === brand.id && (
                  <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full shrink-0 ml-2">
                    Active
                  </span>
                )}
              </div>
              {brand.description && (
                <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                  {brand.description}
                </p>
              )}
              <p className="mt-3 text-xs text-gray-400">
                Updated {timeAgo(brand.updated_at)}
              </p>
            </button>
          ))}
        </div>
      )}

      <BrandSidebar
        brand={editingBrand}
        open={sidebarOpen}
        saving={saving}
        onClose={handleClose}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}
