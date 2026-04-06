import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";

interface ContentTypeSummary {
  id: string;
  name: string;
  description: string | null;
  default_aspect_ratio: string;
  is_default: boolean;
  sort_order: number;
}

interface ContentTypeSelectorProps {
  brandId: string;
  token: string;
  value: string | null;
  onChange: (
    contentTypeId: string | null,
    defaultAspectRatio?: string
  ) => void;
}

export function ContentTypeSelector({
  brandId,
  token,
  value,
  onChange,
}: ContentTypeSelectorProps) {
  const [contentTypes, setContentTypes] = useState<ContentTypeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTooltip, setShowTooltip] = useState(false);

  const fetchContentTypes = useCallback(async () => {
    if (!brandId || !token) return;
    try {
      const data = await api<{ contentTypes: ContentTypeSummary[] }>(
        `/brands/${brandId}/content-types`,
        { token }
      );
      setContentTypes(data.contentTypes);
    } catch (err) {
      console.error("Failed to fetch content types:", err);
    } finally {
      setLoading(false);
    }
  }, [brandId, token]);

  useEffect(() => {
    setLoading(true);
    fetchContentTypes();
  }, [fetchContentTypes]);

  const selected = contentTypes.find((ct) => ct.id === value) || null;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value || null;
    const ct = contentTypes.find((c) => c.id === id);
    onChange(id, ct?.default_aspect_ratio);
  };

  if (loading) {
    return (
      <div className="h-9 w-full bg-gray-100 rounded-lg animate-pulse" />
    );
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={value || ""}
        onChange={handleChange}
        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
      >
        <option value="">Custom (no template)</option>
        {contentTypes.map((ct) => (
          <option key={ct.id} value={ct.id}>
            {ct.name}
          </option>
        ))}
      </select>

      {/* Info icon with tooltip */}
      {selected && selected.description && (
        <div
          className="relative"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <span className="text-gray-400 hover:text-gray-600 cursor-help text-sm">
            ℹ️
          </span>
          {showTooltip && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg z-50">
              <p className="font-medium mb-1">{selected.name}</p>
              <p className="text-gray-300">{selected.description}</p>
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
