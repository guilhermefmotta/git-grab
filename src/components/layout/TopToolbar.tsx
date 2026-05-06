import { useEffect, useRef, useState } from "react";
import {
  GitBranch,
  Download,
  Upload,
  RefreshCw,
  Archive,
  ArchiveRestore,
  Plus,
  Undo2,
  Redo2,
  Folder,
  GitFork,
  Settings,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { git } from "@/lib/tauri";
import { useAppStore } from "@/store/appStore";
import { useBranches } from "@/hooks/useBranches";
import { useCommits } from "@/hooks/useCommits";
import { useStatus } from "@/hooks/useStatus";
import { useRepo } from "@/hooks/useRepo";
import { CloneDialog } from "@/components/dialogs/CloneDialog";
import { BranchDialog } from "@/components/dialogs/BranchDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  busy,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className={cn(
        "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded text-xs transition-colors",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        "text-muted-foreground hover:text-foreground hover:bg-accent"
      )}
    >
      <Icon size={16} className={busy ? "animate-spin" : ""} />
      <span>{label}</span>
    </button>
  );
}

function SplitButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  busy,
  items,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  items: { label: string; onClick: () => void; danger?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative flex">
      <button
        onClick={onClick}
        disabled={disabled || busy}
        className={cn(
          "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-l text-xs transition-colors",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          "text-muted-foreground hover:text-foreground hover:bg-accent"
        )}
      >
        <Icon size={16} className={busy ? "animate-spin" : ""} />
        <span>{label}</span>
      </button>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className={cn(
          "flex items-end pb-1.5 pr-1 pl-0.5 rounded-r text-xs transition-colors",
          "border-l border-border/30",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          "text-muted-foreground hover:text-foreground hover:bg-accent"
        )}
      >
        <ChevronDown size={9} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-popover border border-border rounded shadow-xl z-50 min-w-[160px] py-1">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={cn(
                "w-full text-left px-3 py-1.5 text-xs transition-colors",
                item.danger
                  ? "text-destructive hover:bg-destructive/10"
                  : "text-foreground hover:bg-accent"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  onOpenSettings: () => void;
}

export function TopToolbar({ onOpenSettings }: Props) {
  const {
    activeRepo,
    operationInProgress,
    repos,
    activeRepoIndex,
    setActiveRepoIndex,
    removeRepo,
    stashes,
    setStashes,
  } = useAppStore();
  const { refresh: refreshBranches } = useBranches();
  const { loadCommits } = useCommits();
  const { refresh: refreshStatus } = useStatus();
  const { openRepo } = useRepo();

  const [fetching, setFetching] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [forcePushConfirm, setForcePushConfirm] = useState(false);
  const [undoConfirm, setUndoConfirm] = useState(false);

  const refresh = () => {
    if (!activeRepo) return;
    refreshBranches();
    loadCommits(0);
    refreshStatus();
  };

  const fetchAll = async () => {
    if (!activeRepo) return;
    setFetching(true);
    try {
      await git.fetchAll(activeRepo.path);
      refresh();
      toast.success("Fetched all remotes");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setFetching(false);
    }
  };

  const pull = async (rebase = false) => {
    if (!activeRepo) return;
    setPulling(true);
    try {
      await git.pull(activeRepo.path, rebase);
      refresh();
      toast.success(`Pull (${rebase ? "rebase" : "merge"}) complete`);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setPulling(false);
    }
  };

  const push = async (force = false) => {
    if (!activeRepo) return;
    setPushing(true);
    try {
      await git.push(activeRepo.path, force);
      toast.success(force ? "Force push complete" : "Push complete");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setPushing(false);
    }
  };

  const stashChanges = async () => {
    if (!activeRepo) return;
    try {
      await git.createStash(activeRepo.path);
      const updated = await git.getStashes(activeRepo.path);
      setStashes(updated);
      refreshStatus();
      toast.success("Changes stashed");
    } catch (e) {
      toast.error(String(e));
    }
  };

  const popStash = async () => {
    if (!activeRepo || stashes.length === 0) return;
    try {
      await git.popStash(activeRepo.path, 0);
      const updated = await git.getStashes(activeRepo.path);
      setStashes(updated);
      refreshStatus();
      toast.success("Stash popped");
    } catch (e) {
      toast.error(String(e));
    }
  };

  const undoLastCommit = async () => {
    if (!activeRepo) return;
    try {
      await git.undoLastCommit(activeRepo.path);
      refresh();
      toast.success("Undid last commit (changes kept staged)");
    } catch (e) {
      toast.error(String(e));
    }
  };

  const disabled = !activeRepo || operationInProgress;

  return (
    <div className="flex items-stretch border-b border-border bg-card h-14 shrink-0">
      {/* Repo tabs */}
      <div className="flex items-end px-2 gap-1 border-r border-border min-w-0 max-w-xs overflow-x-auto">
        {repos.map((repo, i) => (
          <div
            key={repo.path}
            onClick={() => setActiveRepoIndex(i)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-t text-xs cursor-pointer transition-colors shrink-0",
              i === activeRepoIndex
                ? "bg-background text-foreground border border-b-0 border-border"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Folder size={12} />
            <span className="max-w-[100px] truncate">{repo.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeRepo(repo.path);
              }}
              className="ml-1 hover:text-destructive"
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={openRepo}
          className="text-muted-foreground hover:text-foreground px-2 py-1 text-xs"
          title="Open repo"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Undo / Redo */}
      <div className="flex items-center px-2 gap-1 border-r border-border">
        <ToolbarButton
          icon={Undo2}
          label="Undo"
          onClick={() => setUndoConfirm(true)}
          disabled={disabled}
        />
        <ToolbarButton
          icon={Redo2}
          label="Redo"
          onClick={() => toast.info("Redo not yet available")}
          disabled={disabled}
        />
      </div>

      {/* Fetch / Pull / Push */}
      <div className="flex items-center px-2 gap-1 border-r border-border">
        <ToolbarButton
          icon={fetching ? RefreshCw : Download}
          label="Fetch"
          onClick={fetchAll}
          disabled={disabled}
          busy={fetching}
        />
        <SplitButton
          icon={pulling ? RefreshCw : Download}
          label="Pull"
          onClick={() => pull(false)}
          disabled={disabled}
          busy={pulling}
          items={[
            { label: "Pull (merge)", onClick: () => pull(false) },
            { label: "Pull (rebase)", onClick: () => pull(true) },
          ]}
        />
        <SplitButton
          icon={pushing ? RefreshCw : Upload}
          label="Push"
          onClick={() => push(false)}
          disabled={disabled}
          busy={pushing}
          items={[
            { label: "Push", onClick: () => push(false) },
            { label: "Force Push…", onClick: () => setForcePushConfirm(true), danger: true },
          ]}
        />
      </div>

      {/* Clone */}
      <div className="flex items-center px-2 gap-1 border-r border-border">
        <ToolbarButton
          icon={GitFork}
          label="Clone"
          onClick={() => setCloneOpen(true)}
          disabled={false}
        />
      </div>

      {/* Branch / Stash / Pop */}
      <div className="flex items-center px-2 gap-1">
        <ToolbarButton
          icon={GitBranch}
          label="Branch"
          onClick={() => setBranchOpen(true)}
          disabled={disabled}
        />
        <ToolbarButton
          icon={Archive}
          label="Stash"
          onClick={stashChanges}
          disabled={disabled}
        />
        <ToolbarButton
          icon={ArchiveRestore}
          label="Pop"
          onClick={popStash}
          disabled={disabled || stashes.length === 0}
        />
      </div>

      {/* Right side: branch name + settings */}
      <div className="ml-auto flex items-center px-3 gap-3">
        {activeRepo && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <GitBranch size={12} />
            {activeRepo.head_branch ?? "detached HEAD"}
          </span>
        )}
        <button
          onClick={onOpenSettings}
          className="text-muted-foreground hover:text-foreground p-1.5 rounded hover:bg-accent transition-colors"
          title="Settings (⌘,)"
        >
          <Settings size={14} />
        </button>
      </div>

      <CloneDialog open={cloneOpen} onClose={() => setCloneOpen(false)} />
      <BranchDialog open={branchOpen} onClose={() => setBranchOpen(false)} />

      <ConfirmDialog
        open={forcePushConfirm}
        title="Force Push"
        description={`Force push will overwrite "${activeRepo?.head_branch ?? "current branch"}" on the remote. Collaborators with local copies will be affected. This cannot be undone.`}
        confirmLabel="Force Push"
        destructive
        onConfirm={async () => {
          setForcePushConfirm(false);
          await push(true);
        }}
        onCancel={() => setForcePushConfirm(false)}
      />

      <ConfirmDialog
        open={undoConfirm}
        title="Undo Last Commit"
        description="Undo the last commit and keep its changes staged (soft reset to HEAD~1)?"
        confirmLabel="Undo"
        onConfirm={async () => {
          setUndoConfirm(false);
          await undoLastCommit();
        }}
        onCancel={() => setUndoConfirm(false)}
      />
    </div>
  );
}
