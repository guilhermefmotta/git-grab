import { useEffect, useRef, useState } from "react";
import { GitMerge, GitBranch, Globe, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { git } from "@/lib/tauri";
import { useAppStore } from "@/store/appStore";
import { useBranches } from "@/hooks/useBranches";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

export function MergeDialog({ open, onClose, onRefresh }: Props) {
  const { activeRepo, branches } = useAppStore();
  const { mergeBranch, refresh: refreshBranches } = useBranches();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [merging, setMerging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // All non-HEAD branches sorted: local first, then remote
  const allBranches = branches.filter(b => !b.is_head);
  const filtered = query.trim()
    ? allBranches.filter(b => b.name.toLowerCase().includes(query.toLowerCase()))
    : allBranches;
  const localFiltered  = filtered.filter(b => !b.is_remote);
  const remoteFiltered = filtered.filter(b => b.is_remote);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(null);
      setDropdownOpen(false);
      refreshBranches();
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const h = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [dropdownOpen]);

  const selectBranch = (name: string) => {
    setSelected(name);
    setQuery(name);
    setDropdownOpen(false);
  };

  const handleMerge = async () => {
    const branch = selected ?? query.trim();
    if (!branch || !activeRepo) return;

    setMerging(true);
    try {
      const outcome = await mergeBranch(branch);
      if (!outcome) return;

      onRefresh?.();

      if (outcome.conflictedFiles.length > 0) {
        toast.warning(`${outcome.conflictedFiles.length} conflict(s) — opening resolver`);
        onClose();
        await git.openMergeWindow(activeRepo.path);
      } else if (outcome.fastForward) {
        toast.success(`Fast-forwarded to ${branch}`);
        onClose();
      } else {
        toast.success(`Merged ${branch}`);
        onClose();
      }
    } finally {
      setMerging(false);
    }
  };

  const displayName = selected ?? (query.trim() || null);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge size={14} />
            Merge Branch
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Branch to merge into <span className="font-mono text-foreground/60">{activeRepo?.head_branch ?? "current"}</span>
            </label>

            {/* Combobox */}
            <div className="relative" ref={dropdownRef}>
              <div className="flex items-center gap-1 bg-secondary rounded px-2 py-1.5 focus-within:ring-1 focus-within:ring-ring">
                <GitBranch size={12} className="text-muted-foreground shrink-0" />
                <input
                  ref={inputRef}
                  data-testid="merge-branch-input"
                  type="text"
                  value={query}
                  onChange={e => {
                    setQuery(e.target.value);
                    setSelected(null);
                    setDropdownOpen(true);
                  }}
                  onFocus={() => setDropdownOpen(true)}
                  onKeyDown={e => {
                    if (e.key === "Escape") { setDropdownOpen(false); }
                    if (e.key === "Enter" && !dropdownOpen) handleMerge();
                    if (e.key === "ArrowDown" && filtered.length > 0) {
                      e.preventDefault();
                      setDropdownOpen(true);
                    }
                  }}
                  placeholder="Type branch name…"
                  className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none min-w-0"
                />
                <button
                  onClick={() => setDropdownOpen(v => !v)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronDown size={12} className={cn("transition-transform", dropdownOpen && "rotate-180")} />
                </button>
              </div>

              {dropdownOpen && filtered.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded shadow-lg max-h-60 overflow-y-auto">
                  {localFiltered.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider border-b border-border/30 sticky top-0 bg-popover">
                        Local
                      </div>
                      {localFiltered.map(b => (
                        <BranchOption
                          key={b.name}
                          name={b.name}
                          isRemote={false}
                          selected={selected === b.name}
                          onClick={() => selectBranch(b.name)}
                        />
                      ))}
                    </>
                  )}
                  {remoteFiltered.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider border-b border-border/30 sticky top-0 bg-popover">
                        Remote
                      </div>
                      {remoteFiltered.map(b => (
                        <BranchOption
                          key={b.name}
                          name={b.name}
                          isRemote={true}
                          selected={selected === b.name}
                          onClick={() => selectBranch(b.name)}
                        />
                      ))}
                    </>
                  )}
                </div>
              )}

              {dropdownOpen && filtered.length === 0 && query.trim() && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded shadow-lg px-3 py-2 text-xs text-muted-foreground">
                  No branches match "{query}"
                </div>
              )}
            </div>
          </div>

          {displayName && (
            <p className="text-[11px] text-muted-foreground">
              Will merge <span className="font-mono text-foreground/80">{displayName}</span> into{" "}
              <span className="font-mono text-foreground/80">{activeRepo?.head_branch ?? "HEAD"}</span>
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <button
            data-testid="merge-cancel-btn"
            onClick={onClose}
            disabled={merging}
            className="px-3 py-1.5 text-xs bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 transition-colors"
          >
            Cancel
          </button>
          <button
            data-testid="merge-btn"
            onClick={handleMerge}
            disabled={!displayName || merging}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <GitMerge size={11} />
            {merging ? "Merging…" : "Merge"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BranchOption({
  name, isRemote, selected, onClick,
}: {
  name: string;
  isRemote: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-accent transition-colors",
        selected && "bg-accent",
      )}
    >
      {isRemote
        ? <Globe size={11} className="text-muted-foreground/60 shrink-0" />
        : <GitBranch size={11} className="text-muted-foreground/60 shrink-0" />}
      <span className="font-mono truncate">{name}</span>
    </button>
  );
}
