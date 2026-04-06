interface AspectRatioToggleProps {
  value: "1:1" | "9:16";
  onChange: (value: "1:1" | "9:16") => void;
}

export function AspectRatioToggle({ value, onChange }: AspectRatioToggleProps) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => onChange("1:1")}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
          value === "1:1"
            ? "bg-indigo-600 text-white border-indigo-600"
            : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
        }`}
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <rect x="1" y="1" width="12" height="12" rx="1.5" />
        </svg>
        1:1
      </button>
      <button
        type="button"
        onClick={() => onChange("9:16")}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
          value === "9:16"
            ? "bg-indigo-600 text-white border-indigo-600"
            : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
        }`}
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 10 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <rect x="1" y="1" width="8" height="14" rx="1.5" />
        </svg>
        9:16
      </button>
    </div>
  );
}
