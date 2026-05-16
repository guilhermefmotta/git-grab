import { useEffect, useRef, useState } from "react";
import {
  GitBranch,
  GitMerge,
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
  GitPullRequest,
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
import { MergeDialog } from "@/components/dialogs/MergeDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";

interface RepoInfo { path: string; name: string }

function RepoDropdown({
  repos, activeRepoIndex, onSelect, onClose, onOpen,
}: {
  repos: RepoInfo[];
  activeRepoIndex: number;
  onSelect: (i: number) => void;
  onClose: (path: string) => void;
  onOpen: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const active = repos[activeRepoIndex];

  useEffect(() => {
    if (!open) { setQuery(""); return; }
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    setTimeout(() => searchRef.current?.focus(), 0);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = query.trim()
    ? repos.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()))
    : repos;

  return (
    <div ref={ref} className="relative flex items-center border-r border-border px-2 shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors max-w-[180px]"
      >
        <Folder size={12} className="shrink-0" />
        <span className="truncate">{active?.name ?? "No repo"}</span>
        <ChevronDown size={11} className="shrink-0 ml-0.5" />
      </button>
      <button
        onClick={onOpen}
        className="text-muted-foreground hover:text-foreground p-1.5 rounded hover:bg-accent transition-colors"
        title="Open repo"
      >
        <Plus size={13} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-popover border border-border rounded shadow-xl z-50 w-64 py-1 flex flex-col">
          {/* Search */}
          <div className="px-2 pb-1">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter repos…"
              className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
            />
          </div>
          <div className="border-t border-border mb-1" />
          {/* Repo list */}
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">No repos match</p>
            )}
            {filtered.map((repo) => {
              const i = repos.indexOf(repo);
              return (
                <div
                  key={repo.path}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer transition-colors group",
                    i === activeRepoIndex
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                  onClick={() => { onSelect(i); setOpen(false); }}
                >
                  <Folder size={11} className="shrink-0" />
                  <span className="flex-1 truncate" title={repo.path}>{repo.name}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onClose(repo.path); }}
                    className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity ml-1 shrink-0"
                    title="Close"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
          <div className="border-t border-border mt-1" />
          <button
            onClick={() => { setOpen(false); onOpen(); }}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Plus size={11} />
            Open another repo…
          </button>
        </div>
      )}
    </div>
  );
}

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
  const [mergeOpen, setMergeOpen] = useState(false);
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
      {/* Repo dropdown */}
      <RepoDropdown
        repos={repos}
        activeRepoIndex={activeRepoIndex}
        onSelect={setActiveRepoIndex}
        onClose={removeRepo}
        onOpen={openRepo}
      />

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

      {/* Branch / Merge / Stash / Pop */}
      <div className="flex items-center px-2 gap-1">
        <ToolbarButton
          icon={GitBranch}
          label="Branch"
          onClick={() => setBranchOpen(true)}
          disabled={disabled}
        />
        <ToolbarButton
          icon={GitMerge}
          label="Merge"
          onClick={() => setMergeOpen(true)}
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
        <ToolbarButton
          icon={GitPullRequest}
          label="Forge"
          onClick={() => activeRepo && git.openForgeWindow(activeRepo.path).catch(() => {})}
          disabled={!activeRepo}
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
      <MergeDialog open={mergeOpen} onClose={() => setMergeOpen(false)} onRefresh={refresh} />

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
