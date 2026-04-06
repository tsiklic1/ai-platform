import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useBrand } from "../context/BrandContext";
import { api } from "../lib/api";

export function BrandSwitcher() {
  const { session } = useAuth();
  const { brands, selectedBrand, loading, setSelectedBrand, refreshBrands } = useBrand();
  const [isOpen, setIsOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const handleDelete = async (e: React.MouseEvent, brandId: string, brandName: string) => {
    e.stopPropagation();
    if (!session?.access_token) return;
    if (!window.confirm(`Delete "${brandName}"? This will remove all products, content types, and generated images for this brand. This cannot be undone.`)) return;
    setDeleting(brandId);
    try {
      await api(`/brands/${brandId}`, { method: "DELETE", token: session.access_token });
      await refreshBrands();
    } catch (err) {
      console.error("Failed to delete brand:", err);
    } finally {
      setDeleting(null);
    }
  };

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen]);

  if (loading) {
    return (
      <div className="px-3 py-2">
        <div className="h-5 w-32 bg-gray-700 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div ref={ref} className="relative px-3">
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left hover:bg-gray-700 transition-colors"
      >
        <span
          className={`text-sm font-semibold truncate ${
            selectedBrand ? "text-white" : "text-gray-400"
          }`}
        >
          {selectedBrand?.name || "Select brand..."}
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 shrink-0 ml-2 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute left-3 right-3 top-full mt-1 bg-gray-700 rounded-lg shadow-lg border border-gray-600 z-50 overflow-hidden">
          {/* Brand list */}
          {brands.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">No brands yet</div>
          ) : (
            <div className="py-1">
              {brands.map((brand) => (
                <div
                  key={brand.id}
                  className="group flex items-center hover:bg-gray-600 transition-colors"
                >
                  <button
                    onClick={() => {
                      setSelectedBrand(brand);
                      setIsOpen(false);
                    }}
                    className="flex-1 flex items-center justify-between px-3 py-2 text-sm text-gray-200 min-w-0"
                  >
                    <span className="truncate">{brand.name}</span>
                    {selectedBrand?.id === brand.id && (
                      <svg
                        className="w-4 h-4 text-indigo-400 shrink-0 ml-2"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, brand.id, brand.name)}
                    disabled={deleting === brand.id}
                    className="opacity-0 group-hover:opacity-100 px-2 py-2 text-gray-400 hover:text-red-400 transition-all shrink-0"
                    title={`Delete ${brand.name}`}
                  >
                    {deleting === brand.id ? (
                      <span className="text-xs">...</span>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-gray-600" />

          {/* Actions */}
          <div className="py-1">
            <button
              onClick={() => {
                setIsOpen(false);
                navigate("/brands/new");
              }}
              className="w-full flex items-center px-3 py-2 text-sm text-gray-300 hover:bg-gray-600 hover:text-white transition-colors"
            >
              <span className="mr-2">＋</span> New Brand
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
