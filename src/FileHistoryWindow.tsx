import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { History, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { git } from "@/lib/tauri";
import { DiffViewer } from "@/components/detail/DiffViewer";
import type { CommitInfo, FileDiff } from "@/lib/types";

const STORAGE_PREFIX = "git_rust_filehistory_";

interface FileHistoryMeta {
  repoPath: string;
  filePath: string;
}

interface Props {
  storageKey: string;
}

export default function FileHistoryWindow({ storageKey }: Props) {
  const [meta, setMeta] = useState<FileHistoryMeta | null>(null);
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [diff, setDiff] = useState<FileDiff[]>([]);
  const [loadingCommits, setLoadingCommits] = useState(false);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${storageKey}`);
      if (!raw) { setError("No file history data found"); return; }
      setMeta(JSON.parse(raw));
    } catch {
      setError("Failed to load file history data");
    }
  }, [storageKey]);

  useEffect(() => {
    if (!meta) return;
    setLoadingCommits(true);
    git.getFileHistory(meta.repoPath, meta.filePath)
      .then((cs) => {
        setCommits(cs);
        if (cs.length > 0) setSelectedHash(cs[0].hash);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingCommits(false));
  }, [meta]);

  useEffect(() => {
    if (!meta || !selectedHash) return;
    setLoadingDiff(true);
    git.getDiff(meta.repoPath, { commitHash: selectedHash, filePath: meta.filePath })
      .then(setDiff)
      .catch(() => setDiff([]))
      .finally(() => setLoadingDiff(false));
  }, [meta, selectedHash]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-border bg-card shrink-0">
        <History size={14} className="text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="font-mono text-sm text-foreground">{meta?.filePath ?? "…"}</span>
          {!loadingCommits && commits.length > 0 && (
            <span className="ml-2 text-xs text-muted-foreground">
              {commits.length} commit{commits.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Commit list */}
        <div className="w-72 border-r border-border flex flex-col overflow-hidden shrink-0">
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border shrink-0">
            History
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingCommits && (
              <div className="flex items-center justify-center h-16 gap-2">
                <Loader2 size={12} className="animate-spin text-muted-foreground" />
              </div>
            )}
            {!loadingCommits && commits.length === 0 && (
              <div className="px-3 py-4 text-xs text-muted-foreground">No history found</div>
            )}
            {commits.map((c) => (
              <button
                key={c.hash}
                onClick={() => setSelectedHash(c.hash)}
                className={cn(
                  "w-full text-left px-3 py-2 border-b border-border/40 transition-colors",
                  selectedHash === c.hash
                    ? "bg-primary/15"
                    : "hover:bg-accent"
                )}
              >
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="font-mono text-[10px] text-primary shrink-0">{c.short_hash}</span>
                  <span className="text-xs text-foreground truncate leading-tight">{c.message}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="truncate">{c.author_name}</span>
                  <span className="shrink-0">
                    {formatDistanceToNow(new Date(c.timestamp * 1000), { addSuffix: true })}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Diff panel */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {!selectedHash && !loadingDiff && (
            <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
              Select a commit to view changes
            </div>
          )}
          {selectedHash && <DiffViewer diff={diff} loading={loadingDiff} />}
        </div>
      </div>
    </div>
  );
}
