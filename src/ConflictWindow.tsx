import { useEffect, useState } from "react";
import { AlertTriangle, GitMerge, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ConflictViewer } from "@/components/detail/ConflictViewer";
import { git } from "@/lib/tauri";
import { toast } from "sonner";

interface ConflictMeta {
  repoPath: string;
  filePath: string;
}

interface Props {
  storageKey: string;
}

export default function ConflictWindow({ storageKey }: Props) {
  const [meta, setMeta] = useState<ConflictMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  const [confirmAbort, setConfirmAbort] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`git_crab_conflict_${storageKey}`);
      if (!raw) { setError("No conflict data found"); return; }
      setMeta(JSON.parse(raw));
    } catch {
      setError("Failed to load conflict data");
    }
  }, [storageKey]);

  // Intercept window close: if not resolved, ask to abort or stay
  useEffect(() => {
    if (resolved) return;
    const win = getCurrentWindow();
    const unlisten = win.onCloseRequested(async (event) => {
      if (!resolved) {
        event.preventDefault();
        setConfirmAbort(true);
      }
    });
    return () => { unlisten.then(f => f()); };
  }, [resolved]);

  const handleAbort = async () => {
    if (!meta) return;
    try {
      await git.abortConflicts(meta.repoPath);
      toast.success("Conflicts aborted — files restored to HEAD");
    } catch (e) {
      toast.error(String(e));
    }
    await getCurrentWindow().close();
  };

  const handleStay = () => setConfirmAbort(false);

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-foreground">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (resolved) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground gap-3">
        <GitMerge size={32} className="text-green-400" />
        <p className="text-sm font-medium text-foreground">Conflict resolved and staged.</p>
        <p className="text-xs text-muted-foreground">You can close this window.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
        <GitMerge size={15} className="text-yellow-400 shrink-0" />
        <span className="text-sm font-medium text-foreground truncate flex-1">
          Resolve Conflict — {meta?.filePath ?? "…"}
        </span>
      </div>

      {/* Viewer */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {meta && (
          <ConflictViewer
            repoPath={meta.repoPath}
            filePath={meta.filePath}
            onResolved={() => setResolved(true)}
          />
        )}
      </div>

      {/* Abort confirmation overlay */}
      {confirmAbort && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-card border border-border rounded-lg p-6 w-96 shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} className="text-yellow-400 shrink-0" />
              <h3 className="text-sm font-semibold">Conflict Not Resolved</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-5">
              <strong className="text-foreground">{meta?.filePath}</strong> still has unresolved
              conflicts. Aborting will run <code className="text-yellow-300">git reset --merge</code> and
              restore the file to HEAD — your local changes brought by Smart Checkout will be lost.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={handleStay}
                className="px-3 py-1.5 text-xs bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 transition-colors"
              >
                Keep Resolving
              </button>
              <button
                onClick={handleAbort}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 transition-colors"
              >
                <X size={11} />
                Abort &amp; Restore HEAD
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
