import React from "react";
import { Database, FolderOpen, X, Check, AlertCircle, Loader2, Plug } from "lucide-react";
import { DatabaseType } from "../../models/database";
import { DATABASE_PROVIDER_LIST, getDatabaseProvider } from "../../models/databaseProviders";
import { testConnection } from "../../services/databaseService";
import { errorToMessage } from "../../utils/errors";
import { LoadingSpinner } from "../LoadingSpinner";
import { IconBtn } from "./SidebarPrimitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Callout } from "@/components/ui/callout";

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "ok" }
  | { status: "error"; message: string };

export interface NewConnectionFormProps {
  dbType: DatabaseType;
  dbName: string;
  dbConnString: string;
  isLoading: boolean;
  onDbTypeChange: (type: DatabaseType) => void;
  onDbNameChange: (name: string) => void;
  onDbConnStringChange: (connStr: string) => void;
  onConnect: () => void;
  onCancel: () => void;
}

export function NewConnectionForm({
  dbType,
  dbName,
  dbConnString,
  isLoading,
  onDbTypeChange,
  onDbNameChange,
  onDbConnStringChange,
  onConnect,
  onCancel,
}: NewConnectionFormProps) {
  const provider = getDatabaseProvider(dbType);
  const isFile = provider.connectionMode === "file";

  const [testState, setTestState] = React.useState<TestState>({ status: "idle" });

  // A new target invalidates the previous test result.
  React.useEffect(() => {
    setTestState({ status: "idle" });
  }, [dbType, dbConnString]);

  const handleTest = async () => {
    if (!dbConnString.trim()) return;
    setTestState({ status: "testing" });
    try {
      await testConnection(dbType, dbConnString.trim());
      setTestState({ status: "ok" });
    } catch (e) {
      setTestState({ status: "error", message: errorToMessage(e) });
    }
  };

  return (
    <div className="mx-2 my-2 overflow-hidden rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          New Connection
        </span>
        <IconBtn onClick={onCancel} title="Cancel" icon={<X size={12} />} />
      </div>

      <div className="space-y-3 px-3 py-3">
        {/* Database type picker — driven by the provider registry */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Database Type
          </Label>
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${DATABASE_PROVIDER_LIST.length}, minmax(0, 1fr))` }}
          >
            {DATABASE_PROVIDER_LIST.map((p) => {
              const isActive = dbType === p.type;
              return (
                <Button
                  key={p.type}
                  type="button"
                  variant={isActive ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => onDbTypeChange(p.type)}
                  className="text-[11px] font-semibold"
                >
                  <span className={isActive ? "" : p.color}>{p.label}</span>
                </Button>
              );
            })}
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            {isFile
              ? "SQLite is a single local file — pick it and you're connected, no server needed."
              : `Connect to a ${provider.label} server with a connection string (host, port, database, and credentials).`}
          </p>
        </div>

        {/* Name field */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="conn-name" className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Name <span className="normal-case opacity-50">(optional)</span>
          </Label>
          <Input
            id="conn-name"
            className="text-xs"
            placeholder={provider.namePlaceholder}
            value={dbName}
            onChange={(e) => onDbNameChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onConnect()}
            autoFocus
          />
        </div>

        {/* Connection URL (URL-mode engines only) */}
        {!isFile && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="conn-url" className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Connection URL
            </Label>
            <Input
              id="conn-url"
              className="font-mono text-xs"
              placeholder={provider.urlPlaceholder}
              value={dbConnString}
              onChange={(e) => onDbConnStringChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onConnect()}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        )}

        {/* File-mode hint */}
        {isFile && (
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            A file browser will open. Select a{" "}
            <code className="font-mono opacity-80">.db</code>,{" "}
            <code className="font-mono opacity-80">.sqlite</code>, or{" "}
            <code className="font-mono opacity-80">.sqlite3</code> file.
          </p>
        )}

        {/* Test result */}
        {testState.status === "ok" && (
          <Callout variant="info" icon={<Check />}>
            Connection succeeded — the server is reachable.
          </Callout>
        )}
        {testState.status === "error" && (
          <Callout variant="destructive" icon={<AlertCircle />}>
            <span className="font-medium">Couldn't connect.</span> {testState.message}
          </Callout>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          {!isFile && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={isLoading || testState.status === "testing" || !dbConnString.trim()}
            >
              {testState.status === "testing" ? <Loader2 className="animate-spin" /> : <Plug size={13} />}
              {testState.status === "testing" ? "Testing…" : "Test"}
            </Button>
          )}
          <Button onClick={onConnect} disabled={isLoading} size="sm" className="flex-1">
            {isLoading ? (
              <LoadingSpinner size={12} />
            ) : isFile ? (
              <FolderOpen size={13} />
            ) : (
              <Database size={13} />
            )}
            {isLoading
              ? "Connecting…"
              : isFile
                ? `Browse ${provider.label} file…`
                : "Connect"}
          </Button>
        </div>
      </div>
    </div>
  );
}
