import React, { useEffect } from "react";
import { cn } from "../../utils/formatters";
import { cellToString } from "../../utils/formatters";

export interface EditableCellViewProps {
  isEditing: boolean;
  value: unknown;
  rightAligned: boolean;
  draftValue: string;
  onDraftChange: (value: string) => void;
  onCancel: () => void;
  onSave: (nextMove?: { rowDelta: number; colDelta: number }) => void;
}

export function EditableCellView({
  isEditing,
  value,
  rightAligned,
  draftValue,
  onDraftChange,
  onCancel,
  onSave,
}: EditableCellViewProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const wasEditingRef = React.useRef(false);
  const isNull = value === null || value === undefined;

  useEffect(() => {
    // Focus only when first entering edit mode — avoids re-focusing on every keystroke re-render.
    if (isEditing && !wasEditingRef.current) {
      const input = inputRef.current;
      if (input) {
        input.focus();
        const end = input.value.length;
        input.setSelectionRange(end, end);
      }
    }
    wasEditingRef.current = isEditing;
  }, [isEditing]);

  if (isEditing) {
    return (
      <div className="w-full flex items-center gap-1.5">
        <input
          ref={inputRef}
          value={draftValue}
          placeholder="Edit value"
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSave({ rowDelta: 1, colDelta: 0 });
            }
            if (e.key === "Tab") {
              e.preventDefault();
              onSave({ rowDelta: 0, colDelta: e.shiftKey ? -1 : 1 });
            }
            if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
          className={cn(
            "w-full text-xs bg-surface-4/90 border border-accent-blue/60 rounded px-2 py-1.5 outline-none",
            "shadow-[0_0_0_1px_rgba(59,130,246,0.25)] placeholder:text-text-muted/70",
            rightAligned ? "text-right" : "text-left",
          )}
          title="Enter: save/down · Tab: save/next · Esc: cancel"
        />
      </div>
    );
  }

  return isNull ? (
    <span className="text-text-muted italic text-xs">null</span>
  ) : (
    <span className="text-truncate">{cellToString(value)}</span>
  );
}
