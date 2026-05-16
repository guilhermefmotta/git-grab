import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, GitBranch, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { git } from "@/lib/tauri";
import { useAppStore } from "@/store/appStore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CloneDialog({ open: isOpen, onClose }: Props) {
  const [url, setUrl] = useState("");
  const [dest, setDest] = useState("");
  const [cloning, setCloning] = useState(false);
  const { addRepo } = useAppStore();

  const browseDest = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === "string") {
      setDest(selected);
    }
  };

  const clone = async () => {
    if (!url.trim() || !dest.trim()) return;
    setCloning(true);
    try {
      const repo = await git.cloneRepo(url.trim(), dest.trim());
      await git.addRecentRepo(repo.path);
      addRepo(repo);
      toast.success(`Cloned to ${repo.path}`);
      onClose();
      setUrl("");
      setDest("");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setCloning(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch size={14} />
            Clone Repository
          </DialogTitle>
          <DialogDescription>Clone a remote git repository to your machine.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Repository URL</label>
            <input
              data-testid="clone-url-input"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/user/repo.git"
              className="w-full bg-secondary text-xs text-foreground placeholder:text-muted-foreground rounded px-2 py-2 outline-none focus:ring-1 focus:ring-ring"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && clone()}
            />
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">Destination</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={dest}
                onChange={(e) => setDest(e.target.value)}
                placeholder="Select destination folder..."
                className="flex-1 bg-secondary text-xs text-foreground placeholder:text-muted-foreground rounded px-2 py-2 outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                onClick={browseDest}
                className="flex items-center gap-1 px-2 py-1.5 bg-secondary text-xs text-muted-foreground rounded hover:text-foreground transition-colors"
              >
                <FolderOpen size={13} />
              </button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <button
            data-testid="clone-cancel-btn"
            onClick={onClose}
            disabled={cloning}
            className="px-3 py-1.5 text-xs bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={clone}
            disabled={!url.trim() || !dest.trim() || cloning}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {cloning && <Loader2 size={12} className="animate-spin" />}
            {cloning ? "Cloning..." : "Clone"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
