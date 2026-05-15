import { useState, useEffect } from "react";
import { AlertTriangle, Loader2, Minus, Plus, FileQuestion } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { git } from "@/lib/tauri";
import type { FileStatus } from "@/lib/types";

interface Props {
  repoPath: string;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

function fileIcon(status: string) {
  if (status === "staged")     return <Plus size={11} className="text-green-400 shrink-0" />;
  if (status === "untracked")  return <FileQuestion size={11} className="text-muted-foreground shrink-0" />;
  if (status === "conflicted") return <AlertTriangle size={11} className="text-destructive shrink-0" />;
  return <Minus size={11} className="text-yellow-400 shrink-0" />;
}

export function RollbackDialog({ repoPath, open, onClose, onDone }: Props) {
  const [files, setFiles]     = useState<FileStatus[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    git.getStatus(repoPath)
      .then(all => {
        setFiles(all);
        setSelected(new Set(all.filter(f => f.status !== "untracked").map(f => f.path)));
      })
      .catch(e => toast.error(String(e)))
      .finally(() => setLoading(false));
  }, [open, repoPath]);

  const toggle = (path: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });

  const allSelected = files.length > 0 && files.every(f => selected.has(f.path));
  const toggleAll   = () =>
    setSelected(allSelected ? new Set() : new Set(files.map(f => f.path)));

  const handleRollback = async () => {
    setRunning(true);
    let failed = 0;
    for (const path of selected) {
      try { await git.discardChanges(repoPath, path); }
      catch { failed++; }
    }
    setRunning(false);
    if (failed > 0) toast.error(`${failed} file(s) failed to rollback`);
    else toast.success(`Rolled back ${selected.size} file(s)`);
    onDone();
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div data-testid="rollback-dialog" className="bg-card border border-border rounded-lg w-[500px] max-h-[70vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <AlertTriangle size={15} className="text-destructive shrink-0" />
          <h3 className="text-sm font-semibold">Rollback Files</h3>
        </div>

        {/* Warning */}
        <div className="px-5 py-3 bg-destructive/5 border-b border-border">
          <p className="text-xs text-muted-foreground">
            Selected files will revert to their last committed state.{" "}
            <span className="text-destructive font-medium">This cannot be undone.</span>{" "}
            Untracked files will be deleted.
          </p>
        </div>

        {/* Select all row */}
        {!loading && files.length > 0 && (
          <label className="flex items-center gap-3 px-5 py-2 border-b border-border cursor-pointer hover:bg-accent/20">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="rounded"
            />
            <span className="text-xs text-muted-foreground">Select all ({files.length} files)</span>
          </label>
        )}

        {/* File list */}
        <div className="flex-1 overflow-y-auto py-2 px-5">
          {loading && (
            <p className="text-xs text-muted-foreground text-center py-6">Loading…</p>
          )}
          {!loading && files.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">No modified files</p>
          )}
          {files.map(f => (
            <label
              key={f.path}
              className={cn(
                "flex items-center gap-3 py-1.5 px-2 rounded cursor-pointer hover:bg-accent/40 transition-colors",
                selected.has(f.path) && "bg-destructive/5",
              )}
            >
              <input
                type="checkbox"
                checked={selected.has(f.path)}
                onChange={() => toggle(f.path)}
                className="rounded shrink-0"
              />
              {fileIcon(f.status)}
              <span className="text-xs font-mono flex-1 truncate">{f.path}</span>
              <span className="text-[10px] text-muted-foreground">{f.status}</span>
            </label>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <button
            data-testid="rollback-cancel"
            onClick={onClose}
            disabled={running}
            className="px-3 py-1.5 text-xs bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            data-testid="rollback-confirm"
            onClick={handleRollback}
            disabled={selected.size === 0 || running}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 disabled:opacity-40"
          >
            {running && <Loader2 size={10} className="animate-spin" />}
            Rollback {selected.size > 0 ? `${selected.size} file(s)` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
