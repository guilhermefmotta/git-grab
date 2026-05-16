import { useState } from "react";
import { GitBranch } from "lucide-react";
import { useBranches } from "@/hooks/useBranches";
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
  fromHash?: string;
  fromLabel?: string;
}

export function BranchDialog({ open: isOpen, onClose, fromHash, fromLabel }: Props) {
  const [name, setName] = useState("");
  const [checkoutAfter, setCheckoutAfter] = useState(true);
  const [creating, setCreating] = useState(false);
  const { createBranch } = useBranches();

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await createBranch(name.trim(), fromHash, checkoutAfter);
      onClose();
      setName("");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch size={14} />
            Create Branch
          </DialogTitle>
          {fromLabel && (
            <DialogDescription>From: {fromLabel}</DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Branch name</label>
            <input
              data-testid="branch-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="feature/my-feature"
              className="w-full bg-secondary text-xs text-foreground placeholder:text-muted-foreground rounded px-2 py-2 outline-none focus:ring-1 focus:ring-ring"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={checkoutAfter}
              onChange={(e) => setCheckoutAfter(e.target.checked)}
              className="rounded"
            />
            <span className="text-xs text-foreground">Checkout after create</span>
          </label>
        </div>

        <DialogFooter className="gap-2">
          <button
            data-testid="branch-cancel-btn"
            onClick={onClose}
            disabled={creating}
            className="px-3 py-1.5 text-xs bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 transition-colors"
          >
            Cancel
          </button>
          <button
            data-testid="branch-create-btn"
            onClick={handleCreate}
            disabled={!name.trim() || creating}
            className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {creating ? "Creating..." : "Create Branch"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
