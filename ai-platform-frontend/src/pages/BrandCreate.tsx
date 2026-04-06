import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useBrand } from "../context/BrandContext";
import { api } from "../lib/api";
import type { Brand } from "../context/BrandContext";

export default function BrandCreate() {
  const { session } = useAuth();
  const { refreshBrands, setSelectedBrand } = useBrand();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Brand name is required");
      return;
    }

    if (!session?.access_token) return;

    setSubmitting(true);
    try {
      const data = await api<{ brand: Brand }>("/brands", {
        method: "POST",
        body: { name: name.trim(), description: description.trim() || null },
        token: session.access_token,
      });

      await refreshBrands();
      setSelectedBrand(data.brand);
      navigate("/identity");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create brand");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex items-start justify-center pt-12">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900">
          Create a new brand
        </h1>
        <p className="mt-1 text-gray-500 text-sm">
          Define your brand to start creating on-brand content.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Brand name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder="e.g. Acme Corp"
              autoFocus
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-400">
              {name.length}/100 characters
            </p>
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

          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="w-full px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Creating..." : "Create Brand"}
          </button>

          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-full px-4 py-2 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
}
