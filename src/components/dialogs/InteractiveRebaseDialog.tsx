import { useEffect, useRef, useState } from "react";
import { Loader2, GripVertical } from "lucide-react";
import { git } from "@/lib/tauri";
import type { CommitInfo } from "@/lib/types";

type RebaseAction = "pick" | "squash" | "fixup" | "drop";

interface RebaseStep {
  action: RebaseAction;
  hash: string;
  shortHash: string;
  message: string;
}

interface Props {
  open: boolean;
  baseCommit: CommitInfo | null;
  repoPath: string;
  onClose: () => void;
  onDone: () => void;
}

const ACTION_COLORS: Record<RebaseAction, string> = {
  pick:   "text-foreground",
  squash: "text-blue-400",
  fixup:  "text-purple-400",
  drop:   "text-destructive line-through opacity-60",
};

const ACTION_OPTIONS: { value: RebaseAction; label: string }[] = [
  { value: "pick",   label: "pick — use commit" },
  { value: "squash", label: "squash — meld into previous" },
  { value: "fixup",  label: "fixup — meld, discard message" },
  { value: "drop",   label: "drop — remove commit" },
];

export function InteractiveRebaseDialog({ open, baseCommit, repoPath, onClose, onDone }: Props) {
  const [steps, setSteps] = useState<RebaseStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragIdx = useRef<number | null>(null);

  useEffect(() => {
    if (!open || !baseCommit) { setSteps([]); setError(null); return; }
    setLoading(true);
    setError(null);
    git.getRebaseCommits(repoPath, baseCommit.hash)
      .then((commits) => {
        setSteps(commits.map((c) => ({
          action: "pick",
          hash: c.hash,
          shortHash: c.short_hash,
          message: c.message,
        })));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [open, baseCommit?.hash]);

  const setAction = (idx: number, action: RebaseAction) => {
    setSteps((prev) => prev.map((s, i) => i === idx ? { ...s, action } : s));
  };

  // Drag-and-drop reorder
  const onDragStart = (e: React.DragEvent, idx: number) => {
    dragIdx.current = idx;
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === idx) return;
    setSteps((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx.current!, 1);
      next.splice(idx, 0, moved);
      dragIdx.current = idx;
      return next;
    });
  };
  const onDragEnd = () => { dragIdx.current = null; };

  const handleStart = async () => {
    if (!baseCommit || steps.length === 0) return;
    setRunning(true);
    setError(null);
    try {
      await git.startInteractiveRebase(repoPath, baseCommit.hash, steps);
      onDone();
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  };

  if (!open) return null;

  return (
    <div data-testid="interactive-rebase-dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-lg shadow-2xl w-[680px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-foreground">Interactive Rebase</h2>
          {baseCommit && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Base:{" "}
              <span className="font-mono text-primary">{baseCommit.short_hash}</span>
              {" — "}
              <span>{baseCommit.message.slice(0, 60)}</span>
            </p>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading && (
            <div className="flex items-center justify-center h-24 gap-2">
              <Loader2 size={14} className="animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Loading commits…</span>
            </div>
          )}

          {!loading && steps.length === 0 && !error && (
            <div className="flex items-center justify-center h-16">
              <p className="text-xs text-muted-foreground">No commits to rebase</p>
            </div>
          )}

          {!loading && steps.length > 0 && (
            <div className="py-1">
              {/* Column header */}
              <div className="flex items-center gap-2 px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/40">
                <span className="w-4" />
                <span className="w-32 shrink-0">Action</span>
                <span className="w-14 shrink-0">Hash</span>
                <span className="flex-1">Message</span>
              </div>
              {steps.map((step, idx) => (
                <div
                  key={step.hash}
                  draggable
                  onDragStart={(e) => onDragStart(e, idx)}
                  onDragOver={(e) => onDragOver(e, idx)}
                  onDragEnd={onDragEnd}
                  className="flex items-center gap-2 px-4 py-1.5 hover:bg-accent/30 cursor-default border-b border-border/20 group"
                >
                  <GripVertical
                    size={13}
                    className="text-muted-foreground/40 group-hover:text-muted-foreground cursor-grab shrink-0"
                  />
                  <select
                    value={step.action}
                    onChange={(e) => setAction(idx, e.target.value as RebaseAction)}
                    className="w-32 shrink-0 bg-secondary border border-border/40 rounded px-1.5 py-0.5 text-[11px] text-foreground outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                  >
                    {ACTION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.value}</option>
                    ))}
                  </select>
                  <span className="w-14 shrink-0 font-mono text-[11px] text-primary">
                    {step.shortHash}
                  </span>
                  <span className={`flex-1 truncate text-xs ${ACTION_COLORS[step.action]}`}>
                    {step.message}
                  </span>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="mx-4 mt-3 mb-1 p-3 bg-destructive/10 border border-destructive/30 rounded text-xs text-destructive font-mono whitespace-pre-wrap">
              {error}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="px-5 py-2 border-t border-border/40 shrink-0">
          <p className="text-[10px] text-muted-foreground">
            Drag rows to reorder · Squash/fixup merges into the commit above ·{" "}
            <span className="text-blue-400">squash</span> keeps messages ·{" "}
            <span className="text-purple-400">fixup</span> discards them ·{" "}
            <span className="text-destructive">drop</span> removes commit
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border shrink-0">
          <button
            data-testid="interactive-rebase-cancel"
            onClick={onClose}
            disabled={running}
            className="px-3 py-1.5 text-xs border border-border/40 rounded text-muted-foreground hover:text-foreground hover:bg-accent/20 transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={running || loading || steps.length === 0}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-40"
          >
            {running && <Loader2 size={11} className="animate-spin" />}
            Start Rebase
          </button>
        </div>
      </div>
    </div>
  );
}
