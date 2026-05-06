import { useEffect, useState } from "react";
import { FileCode } from "lucide-react";
import { git } from "@/lib/tauri";
import { DiffViewer } from "@/components/detail/DiffViewer";
import type { FileDiff } from "@/lib/types";

interface FileDiffMeta {
  repoPath: string;
  filePath: string;
  staged: boolean;
}

interface Props {
  storageKey: string;
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
    git
      .getDiff(meta.repoPath, { filePath: meta.filePath, staged: meta.staged })
      .then(setDiff)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
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
        <FileCode size={15} className="text-muted-foreground shrink-0" />
        <span className="text-sm font-medium text-foreground truncate flex-1">
          {meta?.filePath ?? "…"}
        </span>
        {meta && (
          <span className="text-[11px] text-muted-foreground shrink-0 px-2 py-0.5 bg-secondary rounded">
            {meta.staged ? "Staged" : "Unstaged"}
          </span>
        )}
      </div>

      {/* Diff */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <DiffViewer diff={diff} loading={loading} />
      </div>
    </div>
  );
}
