import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Loader2, GitCommit } from "lucide-react";
import { cn } from "@/lib/utils";
import { git } from "@/lib/tauri";
import { DiffViewer } from "@/components/detail/DiffViewer";
import type { FileDiff } from "@/lib/types";

const STORAGE_KEY = "git_rust_commit_window";

interface CommitMeta {
  repoPath: string;
  hash: string;
  shortHash: string;
  message: string;
  authorName: string;
  authorEmail: string;
  timestamp: number;
  parentHashes: string[];
}

interface Props {
  hash: string;
}

export default function CommitDiffWindow({ hash }: Props) {
  const [meta, setMeta] = useState<CommitMeta | null>(null);
  const [diff, setDiff] = useState<FileDiff[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { setError("No commit data found"); return; }
      const stored = JSON.parse(raw);
      if (stored.hash !== hash) { setError("Commit data mismatch"); return; }
      setMeta(stored);
    } catch {
      setError("Failed to load commit data");
    }
  }, [hash]);

  useEffect(() => {
    if (!meta) return;
    setLoadingDiff(true);
    git
      .getDiff(meta.repoPath, { commitHash: meta.hash })
      .then((d) => {
        setDiff(d);
        if (d.length > 0) setSelectedFile(d[0].path);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingDiff(false));
  }, [meta]);

  const fileDiff = selectedFile ? diff.filter((d) => d.path === selectedFile) : diff;

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="flex items-center justify-center h-screen gap-2">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading…</span>
      </div>
    );
  }

  const age = formatDistanceToNow(new Date(meta.timestamp * 1000), { addSuffix: true });

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground">
      {/* Header */}
      <div className="flex items-start gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
        <GitCommit size={16} className="text-muted-foreground mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-snug">{meta.message}</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="font-mono text-[11px] text-muted-foreground">{meta.shortHash}</span>
            <span className="text-[11px] text-muted-foreground">{meta.authorName}</span>
            <span className="text-[11px] text-muted-foreground">&lt;{meta.authorEmail}&gt;</span>
            <span className="text-[11px] text-muted-foreground">{age}</span>
          </div>
          {meta.parentHashes.length > 0 && (
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[10px] text-muted-foreground/60">parents:</span>
              {meta.parentHashes.map((p) => (
                <span key={p} className="font-mono text-[10px] text-muted-foreground/60">
                  {p.slice(0, 7)}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground shrink-0 mt-0.5">
          {diff.length} file{diff.length !== 1 ? "s" : ""} changed
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* File list sidebar */}
        <div className="w-56 border-r border-border flex flex-col overflow-hidden shrink-0">
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
            Changed Files
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingDiff && (
              <div className="flex items-center justify-center h-16 gap-2">
                <Loader2 size={12} className="animate-spin text-muted-foreground" />
              </div>
            )}
            {diff.map((f) => (
              <button
                key={f.path}
                onClick={() => setSelectedFile(f.path)}
                onDoubleClick={() => {
                  if (!meta) return;
                  const key = `commit_${meta.hash}_${f.path.replace(/[^a-zA-Z0-9_\-]/g, "_")}`;
                  localStorage.setItem(`git_rust_filediff_${key}`, JSON.stringify({
                    repoPath: meta.repoPath,
                    filePath: f.path,
                    staged: false,
                    commitHash: meta.hash,
                    shortHash: meta.shortHash,
                  }));
                  git.openFileDiffWindow(key, `${meta.shortHash} — ${f.path}`).catch(() => {});
                }}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-xs truncate transition-colors",
                  selectedFile === f.path
                    ? "bg-primary/15 text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {f.path}
              </button>
            ))}
          </div>
        </div>

        {/* Diff panel */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <DiffViewer diff={fileDiff} loading={loadingDiff} />
        </div>
      </div>
    </div>
  );
}
