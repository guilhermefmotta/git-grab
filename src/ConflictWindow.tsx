import { useEffect, useState } from "react";
import { GitMerge } from "lucide-react";
import { ConflictViewer } from "@/components/detail/ConflictViewer";

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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`git_crab_conflict_${storageKey}`);
      if (!raw) { setError("No conflict data found"); return; }
      setMeta(JSON.parse(raw));
    } catch {
      setError("Failed to load conflict data");
    }
  }, [storageKey]);

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
    </div>
  );
}
