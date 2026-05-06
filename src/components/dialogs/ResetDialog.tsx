import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export type ResetMode = "soft" | "mixed" | "hard";

interface Props {
  open: boolean;
  onClose: () => void;
  commitHash: string;
  commitLabel: string;
  onReset: (mode: ResetMode) => Promise<void>;
}

const MODES: { value: ResetMode; label: string; description: string }[] = [
  { value: "soft", label: "Soft", description: "Keep changes staged" },
  { value: "mixed", label: "Mixed", description: "Keep changes unstaged (default)" },
  { value: "hard", label: "Hard", description: "Discard all changes — cannot be undone" },
];

export function ResetDialog({ open: isOpen, onClose, commitHash, commitLabel, onReset }: Props) {
  const [mode, setMode] = useState<ResetMode>("mixed");
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    setResetting(true);
    try {
      await onReset(mode);
      onClose();
    } finally {
      setResetting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset to Commit</DialogTitle>
          <DialogDescription className="font-mono text-[11px]">
            {commitHash.slice(0, 8)} — {commitLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {MODES.map(({ value, label, description }) => (
            <label
              key={value}
              className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors ${
                mode === value
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-accent"
              }`}
            >
              <input
                type="radio"
                name="reset-mode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
                className="mt-0.5 accent-primary"
              />
              <div>
                <p className="text-xs font-medium text-foreground">{label}</p>
                <p className="text-[10px] text-muted-foreground">{description}</p>
              </div>
            </label>
          ))}
        </div>

        {mode === "hard" && (
          <p className="text-xs text-destructive flex items-center gap-1.5">
            <AlertTriangle size={12} />
            Hard reset permanently discards all uncommitted changes.
          </p>
        )}

        <DialogFooter className="gap-2">
          <button
            onClick={onClose}
            disabled={resetting}
            className="px-3 py-1.5 text-xs bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleReset}
            disabled={resetting}
            className={`px-3 py-1.5 text-xs rounded transition-colors disabled:opacity-40 ${
              mode === "hard"
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {resetting ? "Resetting..." : `Reset (${mode})`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
