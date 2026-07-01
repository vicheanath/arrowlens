import React, { useState } from "react";
import { Download, FileText, FileJson, Database, Loader2 } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { exportQueryResults, ExportFormat } from "../services/exportService";
import { useToastStore } from "../utils/toast";
import { cn } from "../utils/formatters";
import { errorToMessage } from "../utils/errors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ExportModalProps {
  sql: string;
  rowCount: number;
  connectionId: string | null;
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

export function ExportModal({ sql, rowCount, connectionId, onClose }: ExportModalProps) {
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
      const exported = await exportQueryResults(sql, destPath, selectedFormat, connectionId);
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
        message: errorToMessage(e),
        duration: 7000,
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download size={16} /> Export Results
          </DialogTitle>
          <DialogDescription>
            Exporting <span className="font-mono text-foreground">{rowCount.toLocaleString()}</span> rows
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {FORMATS.map((fmt) => {
            const selected = selectedFormat === fmt.id;
            return (
              <button
                key={fmt.id}
                type="button"
                onClick={() => setSelectedFormat(fmt.id)}
                aria-pressed={selected}
                className={cn(
                  "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                  selected
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {fmt.icon}
                    <span>{fmt.label}</span>
                    <span className="font-mono text-xs text-muted-foreground">{fmt.ext}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{fmt.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? <Loader2 className="animate-spin" /> : <Download />}
            {isExporting ? "Exporting…" : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
