import React, { useEffect, useRef } from "react";
import { cn } from "../../utils/formatters";
import { cellToString } from "../../utils/formatters";
import { getEditKind, EditKind } from "../../utils/dataTypes";

export interface EditableCellViewProps {
  isEditing: boolean;
  value: unknown;
  dataType: string;
  rightAligned: boolean;
  isDirty?: boolean;
  draftValue: string;
  onDraftChange: (value: string) => void;
  onCancel: () => void;
  onSave: (nextMove?: { rowDelta: number; colDelta: number }) => void;
}

type Move = { rowDelta: number; colDelta: number };

export function EditableCellView({
  isEditing,
  value,
  dataType,
  rightAligned,
  isDirty = false,
  draftValue,
  onDraftChange,
  onCancel,
  onSave,
}: EditableCellViewProps) {
  const isNull = value === null || value === undefined;

  if (isEditing) {
    return (
      <CellEditor
        kind={getEditKind(dataType)}
        rightAligned={rightAligned}
        draftValue={draftValue}
        onDraftChange={onDraftChange}
        onCancel={onCancel}
        onSave={onSave}
      />
    );
  }

  if (isNull) {
    return (
      <span
        className={cn(
          "text-[10px] font-medium uppercase tracking-wide",
          isDirty ? "text-amber-300" : "text-muted-foreground/60",
        )}
      >
        null
      </span>
    );
  }

  return (
    <span className={cn("text-truncate", isDirty && "text-amber-300")}>{cellToString(value)}</span>
  );
}

// --- Editors ----------------------------------------------------------------

interface EditorProps {
  kind: EditKind;
  rightAligned: boolean;
  draftValue: string;
  onDraftChange: (value: string) => void;
  onCancel: () => void;
  onSave: (nextMove?: Move) => void;
}

/** Shared save/cancel/navigation keys for the single-line editors. */
function singleLineKeyDown(
  e: React.KeyboardEvent,
  onSave: (m?: Move) => void,
  onCancel: () => void,
) {
  if (e.key === "Enter") {
    e.preventDefault();
    onSave({ rowDelta: e.shiftKey ? -1 : 1, colDelta: 0 });
  } else if (e.key === "Tab") {
    e.preventDefault();
    onSave({ rowDelta: 0, colDelta: e.shiftKey ? -1 : 1 });
  } else if (e.key === "Escape") {
    e.preventDefault();
    onCancel();
  }
}

const OVERLAY =
  "absolute inset-0 z-20 h-full w-full bg-card px-3 font-mono text-sm text-foreground " +
  "outline-none ring-2 ring-inset ring-primary placeholder:italic placeholder:text-muted-foreground/60";

function CellEditor({ kind, rightAligned, draftValue, onDraftChange, onCancel, onSave }: EditorProps) {
  if (kind === "boolean") {
    return (
      <BooleanEditor
        draftValue={draftValue}
        onDraftChange={onDraftChange}
        onCancel={onCancel}
        onSave={onSave}
      />
    );
  }

  if (kind === "json") {
    return (
      <JsonEditor
        draftValue={draftValue}
        onDraftChange={onDraftChange}
        onCancel={onCancel}
        onSave={onSave}
      />
    );
  }

  return (
    <TextEditor
      numeric={kind === "number"}
      rightAligned={rightAligned}
      draftValue={draftValue}
      onDraftChange={onDraftChange}
      onCancel={onCancel}
      onSave={onSave}
    />
  );
}

function TextEditor({
  numeric,
  rightAligned,
  draftValue,
  onDraftChange,
  onCancel,
  onSave,
}: {
  numeric: boolean;
  rightAligned: boolean;
  draftValue: string;
  onDraftChange: (value: string) => void;
  onCancel: () => void;
  onSave: (nextMove?: Move) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.focus();
    const end = input.value.length;
    input.setSelectionRange(end, end);
  }, []);

  return (
    <input
      ref={ref}
      value={draftValue}
      placeholder="Empty"
      aria-label="Edit cell value"
      inputMode={numeric ? "decimal" : undefined}
      onChange={(e) => onDraftChange(e.target.value)}
      onKeyDown={(e) => singleLineKeyDown(e, onSave, onCancel)}
      className={cn(OVERLAY, numeric || rightAligned ? "text-right" : "text-left")}
      title="Enter: save & down · Shift+Enter: up · Tab: save & next · Esc: cancel"
    />
  );
}

function BooleanEditor({
  draftValue,
  onDraftChange,
  onCancel,
  onSave,
}: {
  draftValue: string;
  onDraftChange: (value: string) => void;
  onCancel: () => void;
  onSave: (nextMove?: Move) => void;
}) {
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);

  // Normalize whatever string is in the draft to a canonical true/false.
  const normalized = /^(t|true|1|yes)$/i.test(draftValue.trim()) ? "true" : "false";

  return (
    <select
      ref={ref}
      value={normalized}
      aria-label="Edit boolean value"
      onChange={(e) => onDraftChange(e.target.value)}
      onKeyDown={(e) => singleLineKeyDown(e, onSave, onCancel)}
      className={cn(OVERLAY, "cursor-pointer pr-1")}
      title="Enter: save & down · Tab: save & next · Esc: cancel · Del: set NULL"
    >
      <option value="true">true</option>
      <option value="false">false</option>
    </select>
  );
}

function JsonEditor({
  draftValue,
  onDraftChange,
  onCancel,
  onSave,
}: {
  draftValue: string;
  onDraftChange: (value: string) => void;
  onCancel: () => void;
  onSave: (nextMove?: Move) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.focus();
    const end = ta.value.length;
    ta.setSelectionRange(end, end);
  }, []);

  return (
    <textarea
      ref={ref}
      value={draftValue}
      placeholder="Empty"
      aria-label="Edit JSON value"
      rows={5}
      onChange={(e) => onDraftChange(e.target.value)}
      onKeyDown={(e) => {
        // Newlines are meaningful in JSON, so plain Enter inserts a line;
        // Cmd/Ctrl+Enter (or Tab) commits.
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          onSave({ rowDelta: 1, colDelta: 0 });
        } else if (e.key === "Tab") {
          e.preventDefault();
          onSave({ rowDelta: 0, colDelta: e.shiftKey ? -1 : 1 });
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      className={cn(
        // Taller than the cell; the cell drops `overflow-hidden` while editing.
        "absolute left-0 top-0 z-30 min-h-[112px] w-full resize-none rounded-b-md bg-card px-3 py-1.5",
        "font-mono text-xs leading-relaxed text-foreground outline-none ring-2 ring-inset ring-primary",
        "placeholder:italic placeholder:text-muted-foreground/60",
      )}
      title="Cmd/Ctrl+Enter: save · Tab: save & next · Esc: cancel"
    />
  );
}
