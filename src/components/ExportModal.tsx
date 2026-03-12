import React, { useState } from "react";
import { Download, X, FileText, FileJson, Database, Loader2 } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { exportQueryResults, ExportFormat } from "../services/exportService";
import { useToastStore } from "../utils/toast";
import { cn } from "../utils/formatters";

interface ExportModalProps {
  sql: string;
  rowCount: number;
  onClose: () => void;
}

const FORMATS: { id: ExportFormat; label: string; ext: string; icon: React.ReactNode; description: string }[] = [
  {
    id: "csv",
    label: "CSV",
    ext: ".csv",
    icon: <FileText size={16} />,
    description: "Comma-separated values, compatible with Excel and most tools",
  },
  {
    id: "json",
    label: "NDJSON",
    ext: ".ndjson",
    icon: <FileJson size={16} />,
    description: "Newline-delimited JSON, one object per row",
  },
  {
    id: "parquet",
    label: "Parquet",
    ext: ".parquet",
    icon: <Database size={16} />,
    description: "Columnar binary format — ideal for large datasets",
  },
];

export function ExportModal({ sql, rowCount, onClose }: ExportModalProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("csv");
  const [isExporting, setIsExporting] = useState(false);
  const { addToast } = useToastStore();

  const handleExport = async () => {
    const fmt = FORMATS.find((f) => f.id === selectedFormat)!;
    const destPath = await save({
      defaultPath: `export${fmt.ext}`,
      filters: [{ name: fmt.label, extensions: [fmt.ext.replace(".", "")] }],
    });

    if (!destPath) return; // user cancelled the dialog

    setIsExporting(true);
    try {
      const exported = await exportQueryResults(sql, destPath, selectedFormat);
      addToast({
        type: "success",
        title: "Export complete",
        message: `${exported.toLocaleString()} rows written to ${destPath}`,
      });
      onClose();
    } catch (e) {
      addToast({
        type: "error",
        title: "Export failed",
        message: e instanceof Error ? e.message : String(e),
        duration: 7000,
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-surface-1 border border-border rounded-lg shadow-xl w-[420px] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-text-primary font-semibold">
            <Download size={16} />
            <span>Export Results</span>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-text-muted mb-4">
          Exporting <span className="text-text-secondary font-mono">{rowCount.toLocaleString()}</span> rows
        </p>

        {/* Format selection */}
        <div className="space-y-2 mb-5">
          {FORMATS.map((fmt) => (
            <label
              key={fmt.id}
              className={cn(
                "flex items-start gap-3 rounded-md border px-3 py-2.5 cursor-pointer transition-colors",
                selectedFormat === fmt.id
                  ? "border-accent-teal bg-accent-teal/10 text-text-primary"
                  : "border-border hover:border-border-hover text-text-secondary"
              )}
            >
              <input
                type="radio"
                name="format"
                value={fmt.id}
                checked={selectedFormat === fmt.id}
                onChange={() => setSelectedFormat(fmt.id)}
                className="mt-0.5 accent-teal-500"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {fmt.icon}
                  <span>{fmt.label}</span>
                  <span className="text-xs text-text-muted font-mono">{fmt.ext}</span>
                </div>
                <p className="text-xs text-text-muted mt-0.5">{fmt.description}</p>
              </div>
            </label>
          ))}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost text-sm px-4 py-1.5">
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="btn-primary text-sm px-4 py-1.5 flex items-center gap-2"
          >
            {isExporting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            {isExporting ? "Exporting…" : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}
