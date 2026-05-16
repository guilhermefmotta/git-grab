import { useEffect, useState } from "react";
import { FileCode, AlertTriangle } from "lucide-react";
import { git } from "@/lib/tauri";
import { DiffViewer } from "@/components/detail/DiffViewer";
import type { FileDiff, DiffLine } from "@/lib/types";

interface FileDiffMeta {
  repoPath: string;
  filePath: string;
  staged: boolean;
  commitHash?: string;
  shortHash?: string;
  conflicted?: boolean;
}

interface Props {
  storageKey: string;
}

function parseConflictContent(filePath: string, content: string): FileDiff {
  const rawLines = content.split("\n");
  const lines: DiffLine[] = [];
  let inOurs = false;
  let inTheirs = false;
  let lineNo = 1;

  for (const raw of rawLines) {
    let type: DiffLine["line_type"] = "context";
    if (raw.startsWith("<<<<<<<")) {
      type = "header"; inOurs = true; inTheirs = false;
    } else if (raw.startsWith("=======")) {
      type = "header"; inOurs = false; inTheirs = true;
    } else if (raw.startsWith(">>>>>>>")) {
      type = "header"; inOurs = false; inTheirs = false;
    } else if (inOurs) {
      type = "delete";
    } else if (inTheirs) {
      type = "add";
    }
    lines.push({ content: raw, line_type: type, old_lineno: lineNo, new_lineno: lineNo });
    lineNo++;
  }

  return { path: filePath, hunks: [{ header: `Conflict — ${filePath}`, lines }] };
}

export default function FileDiffWindow({ storageKey }: Props) {
  const [meta, setMeta] = useState<FileDiffMeta | null>(null);
  const [diff, setDiff] = useState<FileDiff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`git_rust_filediff_${storageKey}`);
      if (!raw) { setError("No diff data found"); setLoading(false); return; }
      setMeta(JSON.parse(raw));
    } catch {
      setError("Failed to load diff data");
      setLoading(false);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!meta) return;
    setLoading(true);

    if (meta.conflicted) {
      git.getFileContent(meta.repoPath, meta.filePath)
        .then((content) => setDiff([parseConflictContent(meta.filePath, content)]))
        .catch((e) => setError(String(e)))
        .finally(() => setLoading(false));
    } else {
      git.getDiff(meta.repoPath, { filePath: meta.filePath, staged: meta.staged, commitHash: meta.commitHash })
        .then(setDiff)
        .catch((e) => setError(String(e)))
        .finally(() => setLoading(false));
    }
  }, [meta]);

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
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
        {meta?.conflicted
          ? <AlertTriangle size={15} className="text-yellow-400 shrink-0" />
          : <FileCode size={15} className="text-muted-foreground shrink-0" />
        }
        <span className="text-sm font-medium text-foreground truncate flex-1">
          {meta?.filePath ?? "…"}
        </span>
        <span className="text-[11px] shrink-0 px-2 py-0.5 rounded font-mono bg-secondary text-muted-foreground">
          {meta?.conflicted
            ? "Conflict (read-only)"
            : meta?.commitHash
              ? (meta.shortHash ?? meta.commitHash.slice(0, 7))
              : meta?.staged ? "Staged" : "Unstaged"
          }
        </span>
      </div>

      {/* Diff */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <DiffViewer diff={diff} loading={loading} />
      </div>
    </div>
  );
}
