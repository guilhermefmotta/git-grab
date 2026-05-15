import { useState, useEffect } from "react";
import { ChevronRight, ChevronDown, GitBranch, Tag, Archive, Globe } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { git } from "@/lib/tauri";
import { useAppStore } from "@/store/appStore";
import { useBranches } from "@/hooks/useBranches";
import { useCommits } from "@/hooks/useCommits";
import { useStatus } from "@/hooks/useStatus";
import { BranchDialog } from "@/components/dialogs/BranchDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { RollbackDialog } from "@/components/dialogs/RollbackDialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuLabel,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { BranchInfo, StashInfo, TagInfo } from "@/lib/types";

function SectionHeader({
  label, count, open, onToggle,
}: {
  label: string; count: number; open: boolean; onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-1 w-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
    >
      {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      <span className="flex-1 text-left">{label}</span>
      <span className="text-[10px]">{count}</span>
    </button>
  );
}

function BranchItem({
  branch,
  onCheckout,
  onDelete,
  onRename,
  onMerge,
  onRebase,
  onCreateFrom,
  onPush,
  onRollback,
}: {
  branch: BranchInfo;
  onCheckout: (name: string) => void;
  onDelete: (branch: BranchInfo) => void;
  onRename: (branch: BranchInfo) => void;
  onMerge: (name: string) => void;
  onRebase: (name: string) => void;
  onCreateFrom: (branch: BranchInfo) => void;
  onPush: (name: string) => void;
  onRollback?: () => void;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          data-testid={branch.is_head ? "head-branch-item" : `branch-item-${branch.name}`}
          onDoubleClick={() => !branch.is_head && onCheckout(branch.name)}
          className={cn(
            "flex items-center gap-2 px-4 py-1 text-xs cursor-pointer rounded mx-1 transition-colors group",
            branch.is_head
              ? "text-primary bg-primary/10"
              : "text-foreground hover:bg-accent"
          )}
        >
          <GitBranch size={11} className="shrink-0" />
          <span className="flex-1 truncate">{branch.name}</span>
          {branch.is_head && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
          {branch.ahead > 0 && <span className="text-[10px] text-green-400">↑{branch.ahead}</span>}
          {branch.behind > 0 && <span className="text-[10px] text-yellow-400">↓{branch.behind}</span>}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>{branch.name}</ContextMenuLabel>
        <ContextMenuSeparator />
        {!branch.is_head && (
          <ContextMenuItem onClick={() => onCheckout(branch.name)}>Checkout</ContextMenuItem>
        )}
        <ContextMenuItem onClick={() => onCreateFrom(branch)}>Create branch from here</ContextMenuItem>
        {!branch.is_head && (
          <ContextMenuItem onClick={() => onMerge(branch.name)}>Merge into current</ContextMenuItem>
        )}
        {!branch.is_head && (
          <ContextMenuItem onClick={() => onRebase(branch.name)}>Rebase current onto this</ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onPush(branch.name)}>Push to remote</ContextMenuItem>
        {onRollback && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem destructive data-testid="branch-rollback-menuitem" onClick={onRollback}>Rollback files…</ContextMenuItem>
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onRename(branch)}>Rename</ContextMenuItem>
        <ContextMenuItem
          destructive
          disabled={branch.is_head}
          onClick={() => !branch.is_head && onDelete(branch)}
        >
          Delete{branch.is_head ? " (checkout another branch first)" : ""}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => {
          navigator.clipboard.writeText(branch.name);
          toast.success("Copied branch name");
        }}>
          Copy name
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function RemoteBranchItem({
  branch,
  selected,
  onFilter,
  onSwitch,
}: {
  branch: BranchInfo;
  selected: boolean;
  onFilter: () => void;
  onSwitch: () => void;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          onClick={onFilter}
          className={cn(
            "flex items-center gap-2 px-4 py-1 text-xs cursor-pointer rounded mx-1 transition-colors",
            selected
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          <Globe size={11} className="shrink-0" />
          <span className="flex-1 truncate">{branch.name}</span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>{branch.name}</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onFilter}>Filter commits to this branch</ContextMenuItem>
        <ContextMenuItem onClick={onSwitch}>Switch to this branch</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => {
          navigator.clipboard.writeText(branch.name);
          toast.success("Copied branch name");
        }}>
          Copy name
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function StashItem({
  stash,
  onApply,
  onPop,
  onDrop,
}: {
  stash: StashInfo;
  onApply: (index: number) => void;
  onPop: (index: number) => void;
  onDrop: (stash: StashInfo) => void;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="flex items-center gap-2 px-4 py-1 text-xs cursor-pointer rounded mx-1 hover:bg-accent transition-colors">
          <Archive size={11} className="shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate text-foreground">{stash.message}</span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>stash@{"{" + stash.index + "}"}</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onApply(stash.index)}>Apply</ContextMenuItem>
        <ContextMenuItem onClick={() => onPop(stash.index)}>Pop</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem destructive onClick={() => onDrop(stash)}>Drop</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function TagItem({
  tag,
  onDelete,
}: {
  tag: TagInfo;
  onDelete: (tag: TagInfo) => void;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="flex items-center gap-2 px-4 py-1 text-xs cursor-pointer rounded mx-1 hover:bg-accent transition-colors">
          <Tag size={11} className="shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate text-foreground">{tag.name}</span>
          {tag.is_annotated && <span className="text-[10px] text-muted-foreground">A</span>}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>{tag.name}</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => {
          navigator.clipboard.writeText(tag.name);
          toast.success("Copied tag name");
        }}>
          Copy name
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem destructive onClick={() => onDelete(tag)}>Delete tag</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function Sidebar({ onOperationComplete }: { onOperationComplete?: () => void }) {
  const { activeRepo, stashes, tags, setStashes, setTags, activeBranchFilter, setActiveBranchFilter } = useAppStore();
  const { local, remote, checkout, smartCheckout, mergeBranch, rebaseBranch, createBranch, deleteBranch, refresh: refreshBranches } = useBranches();
  const { loadCommits } = useCommits();
  const { refresh: refreshStatus } = useStatus();

  useEffect(() => {
    if (!activeRepo) return;
    git.getStashes(activeRepo.path).then(setStashes).catch(() => {});
    git.getTags(activeRepo.path).then(setTags).catch(() => {});
  }, [activeRepo?.path]);

  const [filter, setFilter] = useState("");
  const [remoteFilter, setRemoteFilter] = useState("");
  const [openLocal, setOpenLocal] = useState(true);
  const [openRemote, setOpenRemote] = useState(true);
  const [openTags, setOpenTags] = useState(false);
  const [openStashes, setOpenStashes] = useState(false);

  const [rollbackOpen, setRollbackOpen] = useState(false);

  const [branchDialog, setBranchDialog] = useState<{
    open: boolean; fromHash?: string; fromLabel?: string;
  }>({ open: false });

  const [renameDialog, setRenameDialog] = useState<{
    open: boolean; branch?: BranchInfo; newName: string;
  }>({ open: false, newName: "" });

  const [confirm, setConfirm] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    onConfirm: () => void;
    onCancel?: () => void;
    destructive?: boolean;
    extraAction?: { label: string; destructive?: boolean; action: () => void };
  }>({ open: false, title: "", description: "", onConfirm: () => {} });

  const closeConfirm = () => setConfirm((s) => ({ ...s, open: false }));

  const fullRefresh = () => {
    refreshBranches();
    loadCommits(0);
    refreshStatus();
    onOperationComplete?.();
  };

  const handleCheckout = async (name: string) => {
    const result = await checkout(name);
    if (result !== "conflict") { fullRefresh(); return; }

    // Detect existing index conflicts vs. working-tree-blocks-checkout
    if (activeRepo) {
      const status = await git.getRepoStatus(activeRepo.path);
      if (status.conflictedFiles.length > 0) {
        fullRefresh();
        git.openMergeWindow(activeRepo.path).catch(() => {});
        return;
      }
    }

    // Working-tree changes would be overwritten → offer Smart Checkout
    setConfirm({
      open: true,
      title: "Local Changes Block Checkout",
      description: `Switching to "${name}" will stash your local changes, switch branch, then restore them. Conflicts will open in the resolver.`,
      confirmLabel: "Smart Checkout",
      onConfirm: async () => {
        closeConfirm();
        const outcome = await smartCheckout(name);
        fullRefresh();
        if (outcome && outcome.conflictedFiles.length > 0) {
          git.openMergeWindow(activeRepo!.path).catch(() => {});
        } else if (outcome) {
          toast.success(`Switched to ${outcome.switchedTo}`);
        }
      },
      extraAction: {
        label: "Force Checkout",
        destructive: true,
        action: async () => {
          closeConfirm();
          if (!activeRepo) return;
          try {
            await git.checkoutBranch(activeRepo.path, name);
            fullRefresh();
            toast.success(`Switched to ${name} (changes discarded)`);
          } catch (e) {
            toast.error(String(e));
          }
        },
      },
    });
  };

  const handleDeleteBranch = (branch: BranchInfo) => {
    setConfirm({
      open: true,
      title: "Delete Branch",
      description: `Delete "${branch.name}"? This cannot be undone.`,
      destructive: true,
      onConfirm: async () => {
        closeConfirm();
        await deleteBranch(branch.name);
      },
    });
  };

  const handleMerge = (name: string) => {
    setConfirm({
      open: true,
      title: "Merge Branch",
      description: `Merge "${name}" into current branch?`,
      onConfirm: async () => {
        closeConfirm();
        const outcome = await mergeBranch(name);
        fullRefresh();
        if (!outcome) return;
        if (outcome.conflictedFiles.length > 0) {
          git.openMergeWindow(activeRepo!.path).catch(() => {});
        } else if (outcome.fastForward) {
          toast.success(`Fast-forwarded to ${name}`);
        } else {
          toast.success(`Merged ${name}`);
        }
      },
    });
  };

  const handleRebase = (name: string) => {
    setConfirm({
      open: true,
      title: "Rebase onto Branch",
      description: `Rebase current branch onto "${name}"? This rewrites history.`,
      onConfirm: async () => {
        closeConfirm();
        const outcome = await rebaseBranch(name);
        fullRefresh();
        if (!outcome) return;
        if (outcome.conflictedFiles.length > 0) {
          git.openMergeWindow(activeRepo!.path).catch(() => {});
        } else {
          toast.success(`Rebased onto ${name}`);
        }
      },
    });
  };

  const handleFilterRemote = (branchName: string) => {
    setActiveBranchFilter(activeBranchFilter === branchName ? null : branchName);
  };

  const handleSwitchRemote = async (branch: BranchInfo) => {
    const localName = branch.name.includes("/")
      ? branch.name.slice(branch.name.indexOf("/") + 1)
      : branch.name;
    await createBranch(localName, branch.last_commit_hash ?? undefined, true);
    fullRefresh();
  };

  const handlePush = async (name: string) => {
    if (!activeRepo) return;
    try {
      await git.push(activeRepo.path);
      toast.success(`Pushed ${name}`);
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleDeleteTag = (tag: TagInfo) => {
    setConfirm({
      open: true,
      title: "Delete Tag",
      description: `Delete tag "${tag.name}"? This cannot be undone.`,
      destructive: true,
      onConfirm: async () => {
        closeConfirm();
        if (!activeRepo) return;
        try {
          await git.deleteTag(activeRepo.path, tag.name);
          const updated = await git.getTags(activeRepo.path);
          setTags(updated);
          toast.success(`Deleted tag ${tag.name}`);
        } catch (e) {
          toast.error(String(e));
        }
      },
    });
  };

  const handleDropStash = (stash: StashInfo) => {
    setConfirm({
      open: true,
      title: "Drop Stash",
      description: `Drop "${stash.message}"? This cannot be undone.`,
      destructive: true,
      onConfirm: async () => {
        closeConfirm();
        if (!activeRepo) return;
        try {
          await git.dropStash(activeRepo.path, stash.index);
          const updated = await git.getStashes(activeRepo.path);
          setStashes(updated);
          toast.success("Stash dropped");
        } catch (e) {
          toast.error(String(e));
        }
      },
    });
  };

  const handleApplyStash = async (index: number) => {
    if (!activeRepo) return;
    try {
      await git.applyStash(activeRepo.path, index);
      refreshStatus();
      toast.success("Stash applied");
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handlePopStash = async (index: number) => {
    if (!activeRepo) return;
    try {
      await git.popStash(activeRepo.path, index);
      const updated = await git.getStashes(activeRepo.path);
      setStashes(updated);
      refreshStatus();
      toast.success("Stash popped");
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleRename = async () => {
    if (!activeRepo || !renameDialog.branch || !renameDialog.newName.trim()) return;
    try {
      await git.renameBranch(activeRepo.path, renameDialog.branch.name, renameDialog.newName.trim());
      refreshBranches();
      toast.success(`Renamed to ${renameDialog.newName}`);
      setRenameDialog({ open: false, newName: "" });
    } catch (e) {
      toast.error(String(e));
    }
  };

  if (!activeRepo) {
    return (
      <div className="w-full border-r border-border bg-card flex items-center justify-center">
        <p className="text-xs text-muted-foreground text-center px-4">Open a repository to get started</p>
      </div>
    );
  }

  const q = filter.toLowerCase();
  const rq = remoteFilter.toLowerCase();
  const filteredLocal = q ? local.filter((b) => b.name.toLowerCase().includes(q)) : local;
  const filteredRemote = remote.filter((b) => {
    const matchesGlobal = !q || b.name.toLowerCase().includes(q);
    const matchesRemote = !rq || b.name.toLowerCase().includes(rq);
    return matchesGlobal && matchesRemote;
  });
  const filteredTags = q ? tags.filter((t) => t.name.toLowerCase().includes(q)) : tags;

  return (
    <>
      <div className="w-full border-r border-border bg-card flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b border-border">
          <input
            type="text"
            placeholder="Search branches…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full bg-secondary text-xs text-foreground placeholder:text-muted-foreground rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {/* Local branches */}
          <SectionHeader
            label="Local"
            count={filteredLocal.length}
            open={openLocal}
            onToggle={() => setOpenLocal((v) => !v)}
          />
          {openLocal && filteredLocal.map((b) => (
            <BranchItem
              key={b.name}
              branch={b}
              onCheckout={handleCheckout}
              onDelete={handleDeleteBranch}
              onRename={(branch) => setRenameDialog({ open: true, branch, newName: branch.name })}
              onMerge={handleMerge}
              onRebase={handleRebase}
              onCreateFrom={(branch) =>
                setBranchDialog({
                  open: true,
                  fromHash: branch.last_commit_hash ?? undefined,
                  fromLabel: branch.name,
                })
              }
              onPush={handlePush}
              onRollback={b.is_head ? () => setRollbackOpen(true) : undefined}
            />
          ))}

          {/* Remote branches */}
          {(filteredRemote.length > 0 || !q) && (
            <>
              <SectionHeader
                label="Remote"
                count={filteredRemote.length}
                open={openRemote}
                onToggle={() => setOpenRemote((v) => !v)}
              />
              {openRemote && (
                <>
                  <div className="px-3 pb-1">
                    <input
                      type="text"
                      placeholder="Search remote…"
                      value={remoteFilter}
                      onChange={(e) => setRemoteFilter(e.target.value)}
                      className="w-full bg-secondary text-xs text-foreground placeholder:text-muted-foreground rounded px-2 py-1 outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  {filteredRemote.map((b) => (
                    <RemoteBranchItem
                      key={b.name}
                      branch={b}
                      selected={activeBranchFilter === b.name}
                      onFilter={() => handleFilterRemote(b.name)}
                      onSwitch={() => handleSwitchRemote(b)}
                    />
                  ))}
                </>
              )}
            </>
          )}

          {/* Tags */}
          <SectionHeader
            label="Tags"
            count={filteredTags.length}
            open={openTags}
            onToggle={() => setOpenTags((v) => !v)}
          />
          {openTags && filteredTags.map((t) => (
            <TagItem key={t.name} tag={t} onDelete={handleDeleteTag} />
          ))}

          {/* Stashes */}
          <SectionHeader
            label="Stashes"
            count={stashes.length}
            open={openStashes}
            onToggle={() => setOpenStashes((v) => !v)}
          />
          {openStashes && stashes.map((s) => (
            <StashItem
              key={s.index}
              stash={s}
              onApply={handleApplyStash}
              onPop={handlePopStash}
              onDrop={handleDropStash}
            />
          ))}
        </div>
      </div>

      <BranchDialog
        open={branchDialog.open}
        onClose={() => setBranchDialog({ open: false })}
        fromHash={branchDialog.fromHash}
        fromLabel={branchDialog.fromLabel}
      />

      <RollbackDialog
        repoPath={activeRepo.path}
        open={rollbackOpen}
        onClose={() => setRollbackOpen(false)}
        onDone={fullRefresh}
      />

      {/* Rename dialog */}
      {renameDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-card border border-border rounded-lg p-6 w-80 shadow-xl">
            <h3 className="text-sm font-semibold mb-3">Rename Branch</h3>
            <input
              type="text"
              value={renameDialog.newName}
              onChange={(e) => setRenameDialog((s) => ({ ...s, newName: e.target.value }))}
              className="w-full bg-secondary text-xs text-foreground rounded px-2 py-2 outline-none focus:ring-1 focus:ring-ring mb-4"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRenameDialog({ open: false, newName: "" })}
                className="px-3 py-1.5 text-xs bg-secondary text-secondary-foreground rounded hover:bg-secondary/80"
              >
                Cancel
              </button>
              <button
                onClick={handleRename}
                disabled={!renameDialog.newName.trim()}
                className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-40"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        description={confirm.description}
        confirmLabel={confirm.confirmLabel}
        destructive={confirm.destructive}
        onConfirm={confirm.onConfirm}
        onCancel={confirm.onCancel ?? closeConfirm}
        extraAction={confirm.extraAction}
      />
    </>
  );
}
