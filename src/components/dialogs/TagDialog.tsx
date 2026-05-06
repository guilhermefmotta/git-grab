import { useState } from "react";
import { Tag } from "lucide-react";
import { toast } from "sonner";
import { git } from "@/lib/tauri";
import { useAppStore } from "@/store/appStore";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onClose: () => void;
  commitHash?: string;
  commitLabel?: string;
}

export function TagDialog({ open: isOpen, onClose, commitHash, commitLabel }: Props) {
  const { activeRepo, setTags } = useAppStore();
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [annotated, setAnnotated] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!activeRepo || !name.trim()) return;
    setCreating(true);
    try {
      await git.createTag(
        activeRepo.path,
        name.trim(),
        commitHash,
        annotated && message.trim() ? message.trim() : undefined,
      );
      const updated = await git.getTags(activeRepo.path);
      setTags(updated);
      toast.success(`Tag ${name.trim()} created`);
      onClose();
      setName("");
      setMessage("");
      setAnnotated(false);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag size={14} />
            Create Tag
          </DialogTitle>
          {commitLabel && <DialogDescription>At: {commitLabel}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Tag name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="v1.0.0"
              className="w-full bg-secondary text-xs text-foreground placeholder:text-muted-foreground rounded px-2 py-2 outline-none focus:ring-1 focus:ring-ring"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && !annotated && handleCreate()}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-xs text-foreground">
            <input
              type="checkbox"
              checked={annotated}
              onChange={(e) => setAnnotated(e.target.checked)}
              className="rounded"
            />
            Annotated tag (with message)
          </label>

          {annotated && (
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tag message..."
                rows={3}
                className="w-full bg-secondary text-xs text-foreground placeholder:text-muted-foreground rounded px-2 py-2 outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <button
            onClick={onClose}
            disabled={creating}
            className="px-3 py-1.5 text-xs bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || creating || (annotated && !message.trim())}
            className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {creating ? "Creating..." : "Create Tag"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
