import { useState, useRef, type DragEvent } from "react";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

interface ImageDropZoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
  imageCount: number;
  maxImages: number;
}

export function ImageDropZone({
  onFileSelected,
  disabled,
  imageCount,
  maxImages,
}: ImageDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const atCapacity = imageCount >= maxImages;

  const validate = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return "File must be an image (JPEG, PNG, or WebP)";
    }
    if (file.size > MAX_SIZE) {
      return "File too large (max 10MB)";
    }
    return null;
  };

  const handleFile = (file: File) => {
    setError(null);
    const err = validate(file);
    if (err) {
      setError(err);
      return;
    }
    onFileSelected(file);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (atCapacity || disabled) return;

    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (!atCapacity && !disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleClick = () => {
    if (!atCapacity && !disabled) inputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so same file can be selected again
    e.target.value = "";
  };

  if (atCapacity) {
    return (
      <div className="border-2 border-dashed border-gray-200 rounded-lg px-4 py-6 text-center">
        <p className="text-sm text-gray-400">✓ Maximum images reached</p>
        <p className="text-xs text-gray-400 mt-1">
          {imageCount}/{maxImages} images
        </p>
      </div>
    );
  }

  return (
    <div>
      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-lg px-4 py-6 text-center cursor-pointer transition-colors ${
          isDragging
            ? "border-indigo-400 bg-indigo-50"
            : "border-gray-300 hover:border-gray-400"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <p className="text-sm text-gray-500">
          📁 Drop image here or click to browse
        </p>
        <p className="text-xs text-gray-400 mt-1">
          JPEG, PNG, WebP · Max 10MB
        </p>
        <p className="text-xs text-gray-400 mt-1">
          {imageCount}/{maxImages} images
        </p>
      </div>

      {error && (
        <p className="text-xs text-red-500 mt-1.5">{error}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleInputChange}
        className="hidden"
      />
    </div>
  );
}
