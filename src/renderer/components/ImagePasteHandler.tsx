import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Image, X, Upload } from "lucide-react";

export interface PastedImage {
  id: string;
  file: File;
  preview: string;
  uploaded?: boolean;
}

interface ImagePasteHandlerProps {
  onImagesPasted: (images: PastedImage[]) => void;
  images: PastedImage[];
  onRemoveImage: (id: string) => void;
  maxImages?: number;
}

export function ImagePasteHandler({
  onImagesPasted,
  images,
  onRemoveImage,
  maxImages = 5,
}: ImagePasteHandlerProps) {
  const [isDragging, setIsDragging] = useState(false);

  // Handle paste
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const newImages: PastedImage[] = [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            const id = `img-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            newImages.push({
              id,
              file,
              preview: URL.createObjectURL(file),
            });
          }
        }
      }

      if (newImages.length > 0) {
        onImagesPasted([...images, ...newImages].slice(0, maxImages));
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [images, onImagesPasted, maxImages]);

  // Handle drag & drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("image/")
      );
      const newImages = files.map((file) => ({
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        preview: URL.createObjectURL(file),
      }));
      if (newImages.length > 0) {
        onImagesPasted([...images, ...newImages].slice(0, maxImages));
      }
    },
    [images, onImagesPasted, maxImages]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className="relative"
    >
      {/* Drop zone indicator */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-construct-accent-primary/10 border-2 border-dashed border-construct-accent-primary rounded-xl flex items-center justify-center z-50"
          >
            <div className="text-center">
              <Upload
                size={24}
                className="text-construct-accent-primary mx-auto mb-2"
              />
              <span className="text-sm text-construct-accent-primary">
                Drop images here
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pasted image previews */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {images.map((img) => (
            <div key={img.id} className="relative group">
              <img
                src={img.preview}
                alt="Pasted"
                className="w-16 h-16 object-cover rounded-lg border border-construct-border"
              />
              <button
                onClick={() => onRemoveImage(img.id)}
                className="absolute -top-1 -right-1 w-4 h-4 bg-construct-semantic-error rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove image"
              >
                <X size={10} className="text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Paste hint */}
      {images.length === 0 && (
        <div className="flex items-center gap-1 text-[10px] text-construct-text-muted">
          <Image size={10} />
          <span>Ctrl+V to paste image</span>
        </div>
      )}
    </div>
  );
}

export default ImagePasteHandler;
