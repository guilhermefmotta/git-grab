import { useCallback, useMemo, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { formatDistanceToNow } from "date-fns";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { git } from "@/lib/tauri";
import { useAppStore } from "@/store/appStore";
import { useCommits } from "@/hooks/useCommits";
import { useBranches } from "@/hooks/useBranches";
import { useStatus } from "@/hooks/useStatus";
import { BranchDialog } from "@/components/dialogs/BranchDialog";
import { TagDialog } from "@/components/dialogs/TagDialog";
import { ResetDialog } from "@/components/dialogs/ResetDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuLabel,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { CommitInfo, GraphCell } from "@/lib/types";
import type { ResetMode } from "@/components/dialogs/ResetDialog";

const BRANCH_COLORS = [
  "#4f8ef7",
  "#a259ff",
  "#f97316",
  "#22c55e",
  "#ec4899",
  "#06b6d4",
  "#eab308",
  "#ef4444",
];

const COL_WIDTH = 16;
const ROW_HEIGHT = 28;

function Avatar({ name }: { name: string }) {
  const hash = Array.from(name).reduce((a, c) => a + c.charCodeAt(0), 0);
  const bg = BRANCH_COLORS[hash % BRANCH_COLORS.length];
  const initials =
    name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
  return (
    <div
      style={{ backgroundColor: bg }}
      className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white shrink-0 select-none"
    >
      {initials}
    </div>
  );
}

function GraphSvg({ cells, maxCol }: { cells: GraphCell[]; maxCol: number }) {
  const width = (maxCol + 1) * COL_WIDTH + 8;
  const cy = ROW_HEIGHT / 2;
  const commitCell = cells.find((c) => c.cell_type === "commit");

  return (
    <svg width={width} height={ROW_HEIGHT} className="shrink-0">
      {cells
        .filter((c) => c.cell_type === "pass_through")
        .map((c, i) => (
          <line
            key={i}
            x1={c.col * COL_WIDTH + COL_WIDTH / 2}
            y1={0}
            x2={c.col * COL_WIDTH + COL_WIDTH / 2}
            y2={ROW_HEIGHT}
            stroke={BRANCH_COLORS[c.color_idx % BRANCH_COLORS.length]}
            strokeWidth={2}
          />
        ))}
      {commitCell && (
        <>
          <line
            x1={commitCell.col * COL_WIDTH + COL_WIDTH / 2}
            y1={0}
            x2={commitCell.col * COL_WIDTH + COL_WIDTH / 2}
            y2={cy}
            stroke={BRANCH_COLORS[commitCell.color_idx % BRANCH_COLORS.length]}
            strokeWidth={2}
          />
          <line
            x1={commitCell.col * COL_WIDTH + COL_WIDTH / 2}
            y1={cy}
            x2={commitCell.col * COL_WIDTH + COL_WIDTH / 2}
            y2={ROW_HEIGHT}
            stroke={BRANCH_COLORS[commitCell.color_idx % BRANCH_COLORS.length]}
            strokeWidth={2}
          />
          <circle
            cx={commitCell.col * COL_WIDTH + COL_WIDTH / 2}
            cy={cy}
            r={4}
            fill={BRANCH_COLORS[commitCell.color_idx % BRANCH_COLORS.length]}
            stroke="hsl(222 47% 11%)"
            strokeWidth={1.5}
          />
        </>
      )}
    </svg>
  );
}

function CommitRow({
  commit,
  selected,
  maxCol,
  onClick,
  onDoubleClick,
  onCreateBranch,
  onCreateTag,
  onCopyHash,
  onCherryPick,
  onRevert,
  onReset,
}: {
  commit: CommitInfo;
  selected: boolean;
  maxCol: number;
  onClick: () => void;
  onDoubleClick: () => void;
  onCreateBranch: (commit: CommitInfo) => void;
  onCreateTag: (commit: CommitInfo) => void;
  onCopyHash: (hash: string) => void;
  onCherryPick: (commit: CommitInfo) => void;
  onRevert: (commit: CommitInfo) => void;
  onReset: (commit: CommitInfo) => void;
}) {
  const age = formatDistanceToNow(new Date(commit.timestamp * 1000), { addSuffix: true });

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          className={cn(
            "flex items-center gap-2 px-2 cursor-pointer transition-colors",
            "hover:bg-accent/50",
            selected && "bg-primary/15 hover:bg-primary/20"
          )}
          style={{ height: ROW_HEIGHT }}
        >
          <GraphSvg cells={commit.graph_columns} maxCol={maxCol} />

          <span className="flex-1 truncate text-xs text-foreground min-w-0">
            {commit.message}
          </span>

          {commit.refs.length > 0 && (
            <div className="flex gap-1 shrink-0">
              {commit.refs.slice(0, 3).map((ref) => (
                <span
                  key={ref.name}
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded font-medium",
                    ref.is_head
                      ? "bg-primary/30 text-primary"
                      : ref.ref_type === "tag"
                      ? "bg-yellow-500/20 text-yellow-400"
                      : ref.ref_type === "remote_branch"
                      ? "bg-purple-500/20 text-purple-400"
                      : "bg-green-500/20 text-green-400"
                  )}
                >
                  {ref.name}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1.5 shrink-0 w-28 justify-end">
            <Avatar name={commit.author_name} />
            <span className="text-[11px] text-muted-foreground truncate">
              {commit.author_name}
            </span>
          </div>

          <span className="text-[11px] text-muted-foreground shrink-0 w-20 text-right">
            {age}
          </span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel className="font-mono">{commit.short_hash}</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onCreateBranch(commit)}>
          Create branch here
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onCreateTag(commit)}>
          Create tag here
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onCherryPick(commit)}>
          Cherry-pick
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onRevert(commit)}>
          Revert commit
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onReset(commit)}>
          Reset to here…
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onCopyHash(commit.hash)}>
          Copy full hash
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onCopyHash(commit.short_hash)}>
          Copy short hash
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function CommitGraph() {
  const { selectedCommitHash, setSelectedCommitHash, activeRepo, activeBranchFilter, setActiveBranchFilter } = useAppStore();
  const { commits, loadMore, loadingCommits } = useCommits();
  const { refresh: refreshBranches } = useBranches();
  const { refresh: refreshStatus } = useStatus();

  const [searchQuery, setSearchQuery] = useState("");

  const [branchDialog, setBranchDialog] = useState<{
    open: boolean; fromHash?: string; fromLabel?: string;
  }>({ open: false });

  const [tagDialog, setTagDialog] = useState<{
    open: boolean; commit?: CommitInfo;
  }>({ open: false });

  const [resetDialog, setResetDialog] = useState<{
    open: boolean; commit?: CommitInfo;
  }>({ open: false });

  const [revertConfirm, setRevertConfirm] = useState<CommitInfo | null>(null);
  const [cherryPickConfirm, setCherryPickConfirm] = useState<CommitInfo | null>(null);

  const filteredCommits = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return commits;
    return commits.filter(
      (c) =>
        c.message.toLowerCase().includes(q) ||
        c.author_name.toLowerCase().includes(q) ||
        c.hash.startsWith(q) ||
        c.short_hash.startsWith(q)
    );
  }, [commits, searchQuery]);

  const maxCol = commits.reduce((max, c) => {
    const m = c.graph_columns.reduce((cm, cell) => Math.max(cm, cell.col), 0);
    return Math.max(max, m);
  }, 0);

  const fullRefresh = useCallback(() => {
    if (!activeRepo) return;
    refreshBranches();
    refreshStatus();
  }, [activeRepo, refreshBranches, refreshStatus]);

  const handleSelect = useCallback(
    (hash: string) => {
      setSelectedCommitHash(hash === selectedCommitHash ? null : hash);
    },
    [selectedCommitHash, setSelectedCommitHash]
  );

  const handleCreateBranch = useCallback((commit: CommitInfo) => {
    setBranchDialog({
      open: true,
      fromHash: commit.hash,
      fromLabel: `${commit.short_hash} — ${commit.message.slice(0, 40)}`,
    });
  }, []);

  const handleCreateTag = useCallback((commit: CommitInfo) => {
    setTagDialog({ open: true, commit });
  }, []);

  const handleCopyHash = useCallback((hash: string) => {
    navigator.clipboard.writeText(hash);
    toast.success("Copied to clipboard");
  }, []);

  const handleCherryPick = useCallback((commit: CommitInfo) => {
    setCherryPickConfirm(commit);
  }, []);

  const handleRevert = useCallback((commit: CommitInfo) => {
    setRevertConfirm(commit);
  }, []);

  const handleReset = useCallback((commit: CommitInfo) => {
    setResetDialog({ open: true, commit });
  }, []);

  const handleDoubleClick = useCallback(
    (commit: CommitInfo) => {
      if (!activeRepo) return;
      const meta = {
        repoPath: activeRepo.path,
        hash: commit.hash,
        shortHash: commit.short_hash,
        message: commit.message,
        authorName: commit.author_name,
        authorEmail: commit.author_email,
        timestamp: commit.timestamp,
        parentHashes: commit.parent_hashes,
      };
      localStorage.setItem("git_rust_commit_window", JSON.stringify(meta));
      git
        .openCommitWindow(commit.hash, `${commit.short_hash} — ${commit.message.slice(0, 60)}`)
        .catch((e) => toast.error(String(e)));
    },
    [activeRepo]
  );

  const doReset = async (mode: ResetMode) => {
    if (!activeRepo || !resetDialog.commit) return;
    try {
      await git.resetToCommit(activeRepo.path, resetDialog.commit.hash, mode);
      fullRefresh();
      toast.success(`Reset to ${resetDialog.commit.short_hash} (${mode})`);
    } catch (e) {
      toast.error(String(e));
    }
  };

  if (!activeRepo) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p className="text-sm mb-2">No repository open</p>
          <p className="text-xs">Open a repo from the toolbar</p>
        </div>
      </div>
    );
  }

  if (commits.length === 0 && loadingCommits) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs text-muted-foreground">Loading commits…</p>
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs text-muted-foreground">No commits yet</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Branch filter pill */}
      {activeBranchFilter && (
        <div className="flex items-center gap-2 px-2 py-1 bg-primary/10 border-b border-primary/20 shrink-0">
          <span className="text-[10px] text-primary flex-1 truncate">
            Filtered: {activeBranchFilter}
          </span>
          <button
            onClick={() => setActiveBranchFilter(null)}
            className="text-primary hover:text-primary/70 transition-colors"
          >
            <X size={11} />
          </button>
        </div>
      )}

      {/* Search bar */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border bg-card/50 shrink-0">
        <Search size={12} className="text-muted-foreground shrink-0" />
        <input
          id="commit-search"
          type="text"
          placeholder="Search commits…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={12} />
          </button>
        )}
        {searchQuery && (
          <span className="text-[10px] text-muted-foreground shrink-0">
            {filteredCommits.length} of {commits.length}
          </span>
        )}
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-2 px-2 py-1 border-b border-border bg-card/50 text-[10px] text-muted-foreground uppercase tracking-wider shrink-0">
        <span className="flex-1">Graph / Message</span>
        <span className="w-28 text-right">Author</span>
        <span className="w-20 text-right">Date</span>
      </div>

      {filteredCommits.length === 0 && searchQuery ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-muted-foreground">No commits match "{searchQuery}"</p>
        </div>
      ) : (
        <Virtuoso
          style={{ flex: 1 }}
          data={filteredCommits}
          endReached={searchQuery ? undefined : loadMore}
          itemContent={(_, commit) => (
            <CommitRow
              key={commit.hash}
              commit={commit}
              selected={commit.hash === selectedCommitHash}
              maxCol={maxCol}
              onClick={() => handleSelect(commit.hash)}
              onDoubleClick={() => handleDoubleClick(commit)}
              onCreateBranch={handleCreateBranch}
              onCreateTag={handleCreateTag}
              onCopyHash={handleCopyHash}
              onCherryPick={handleCherryPick}
              onRevert={handleRevert}
              onReset={handleReset}
            />
          )}
          components={{
            Footer: () =>
              loadingCommits && !searchQuery ? (
                <div className="text-center py-2 text-xs text-muted-foreground">
                  Loading more…
                </div>
              ) : null,
          }}
        />
      )}

      <BranchDialog
        open={branchDialog.open}
        onClose={() => setBranchDialog({ open: false })}
        fromHash={branchDialog.fromHash}
        fromLabel={branchDialog.fromLabel}
      />

      <TagDialog
        open={tagDialog.open}
        onClose={() => setTagDialog({ open: false })}
        commitHash={tagDialog.commit?.hash}
        commitLabel={
          tagDialog.commit
            ? `${tagDialog.commit.short_hash} — ${tagDialog.commit.message.slice(0, 40)}`
            : undefined
        }
      />

      {resetDialog.commit && (
        <ResetDialog
          open={resetDialog.open}
          onClose={() => setResetDialog({ open: false })}
          commitHash={resetDialog.commit.hash}
          commitLabel={resetDialog.commit.message.slice(0, 60)}
          onReset={doReset}
        />
      )}

      <ConfirmDialog
        open={cherryPickConfirm !== null}
        title="Cherry-pick Commit"
        description={`Apply "${cherryPickConfirm?.message.slice(0, 60)}" to the current branch?`}
        confirmLabel="Cherry-pick"
        onConfirm={async () => {
          if (!activeRepo || !cherryPickConfirm) return;
          setCherryPickConfirm(null);
          try {
            await git.cherryPick(activeRepo.path, cherryPickConfirm.hash);
            fullRefresh();
            toast.success(`Cherry-picked ${cherryPickConfirm.short_hash}`);
          } catch (e) {
            toast.error(String(e));
          }
        }}
        onCancel={() => setCherryPickConfirm(null)}
      />

      <ConfirmDialog
        open={revertConfirm !== null}
        title="Revert Commit"
        description={`Create a new commit that undoes "${revertConfirm?.message.slice(0, 60)}"?`}
        confirmLabel="Revert"
        onConfirm={async () => {
          if (!activeRepo || !revertConfirm) return;
          setRevertConfirm(null);
          try {
            await git.revertCommit(activeRepo.path, revertConfirm.hash);
            fullRefresh();
            toast.success(`Reverted ${revertConfirm.short_hash}`);
          } catch (e) {
            toast.error(String(e));
          }
        }}
        onCancel={() => setRevertConfirm(null)}
      />
    </div>
  );
}
