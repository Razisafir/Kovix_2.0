import {
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileCode, X } from "lucide-react";

export interface FileChip {
  path: string;
  name: string;
}

interface FileReferenceInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onFileAttach: (files: FileChip[]) => void;
  projectFiles: string[];
  attachedFiles: FileChip[];
}

export function FileReferenceInput({
  value,
  onChange,
  onSubmit,
  onFileAttach,
  projectFiles,
  attachedFiles,
}: FileReferenceInputProps) {
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [filter, setFilter] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [cursorPos, setCursorPos] = useState(0);

  // Detect @ trigger
  const checkTrigger = useCallback(() => {
    const beforeCursor = value.slice(0, cursorPos);
    const match = beforeCursor.match(/@([\w./-]*)$/);
    if (match) {
      setFilter(match[1].toLowerCase());
      setShowAutocomplete(true);
    } else {
      setShowAutocomplete(false);
    }
  }, [value, cursorPos]);

  useEffect(() => {
    checkTrigger();
  }, [checkTrigger]);

  const filtered = projectFiles
    .filter((f) => f.toLowerCase().includes(filter))
    .slice(0, 8);

  const attachFile = (path: string) => {
    const name = path.split("/").pop() || path;
    const newFiles = [...attachedFiles, { path, name }];
    onFileAttach(newFiles);
    // Remove @filter from input
    const before = value.slice(0, cursorPos).replace(/@[\w./-]*$/, "");
    const after = value.slice(cursorPos);
    onChange(before + after);
    setShowAutocomplete(false);
    inputRef.current?.focus();
  };

  const removeFile = (path: string) => {
    onFileAttach(attachedFiles.filter((f) => f.path !== path));
  };

  return (
    <div className="relative">
      {/* Attached file chips */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {attachedFiles.map((file) => (
            <span
              key={file.path}
              className="flex items-center gap-1 px-2 py-0.5 bg-construct-accent-primary/15 text-construct-accent-primary rounded-md text-[10px]"
            >
              <FileCode size={10} />
              {file.name}
              <button
                onClick={() => removeFile(file.path)}
                className="hover:text-construct-semantic-error"
                title="Remove file"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input with @ autocomplete */}
      <div className="relative">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setCursorPos(e.target.selectionStart);
          }}
          onSelect={(e) => setCursorPos(e.currentTarget.selectionStart)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder="Type @ to reference a file..."
          className="w-full h-20 px-3 py-2 bg-construct-bg-tertiary border border-construct-border rounded-xl text-xs text-construct-text-primary placeholder-construct-text-muted outline-none focus:border-construct-accent-primary resize-none transition-colors"
        />

        {/* Autocomplete dropdown */}
        <AnimatePresence>
          {showAutocomplete && filtered.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              className="absolute bottom-full left-0 mb-1 w-64 max-h-40 overflow-y-auto bg-construct-bg-secondary border border-construct-border rounded-lg shadow-xl z-50"
            >
              {filtered.map((file) => (
                <button
                  key={file}
                  onClick={() => attachFile(file)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-[11px] text-construct-text-secondary hover:bg-construct-bg-elevated hover:text-construct-text-primary transition-colors text-left"
                >
                  <FileCode
                    size={12}
                    className="text-construct-accent-primary shrink-0"
                  />
                  <span className="truncate">{file}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default FileReferenceInput;
