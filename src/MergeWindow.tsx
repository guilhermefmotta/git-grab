import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { MergeWorkspace } from "@/components/merge/MergeWorkspace";
import { git } from "@/lib/tauri";
import { Toaster, toast } from "sonner";
import type { RepoStatus } from "@/lib/mergeTypes";
import { Loader2 } from "lucide-react";

interface Props {
  repoPath: string;
}

export default function MergeWindow({ repoPath }: Props) {
  const [status, setStatus] = useState<RepoStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const s = await git.getRepoStatus(repoPath);
      const active = s.operation !== "Clean" || s.conflictedFiles.length > 0;
      setStatus(active ? s : null);
    } catch (e) {
      toast.error(String(e));
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [repoPath]);

  const handleDone = async () => {
    await refresh();
    // If no more conflicts / operation complete, close window
    const s = await git.getRepoStatus(repoPath).catch(() => null);
    if (!s || (s.operation === "Clean" && s.conflictedFiles.length === 0)) {
      await getCurrentWindow().close();
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-background">
      <Loader2 size={18} className="animate-spin text-muted-foreground" />
    </div>
  );

  if (!status || status.conflictedFiles.length === 0) return (
    <div className="flex items-center justify-center h-screen bg-background text-foreground">
      <p className="text-xs text-muted-foreground">No conflicts to resolve.</p>
    </div>
  );

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background text-foreground">
      <MergeWorkspace repoPath={repoPath} status={status} onDone={handleDone} />
      <Toaster position="bottom-right" theme="dark" toastOptions={{
        style: {
          background: "hsl(222 47% 13%)",
          border: "1px solid hsl(217 32% 17%)",
          color: "hsl(210 40% 98%)",
          fontSize: "12px",
        },
      }} />
    </div>
  );
}
