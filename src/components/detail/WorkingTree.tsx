import { useState } from "react";
import { Plus, Minus, FileQuestion, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { git } from "@/lib/tauri";
import { useAppStore } from "@/store/appStore";
import { useStatus } from "@/hooks/useStatus";
import { useCommits } from "@/hooks/useCommits";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { DiffViewer } from "./DiffViewer";
import type { FileStatus } from "@/lib/types";

function FileRow({
  file,
  icon: Icon,
  iconClass,
  onClick,
  onDoubleClick,
  selected,
  action,
  onAction,
  onStage,
  onUnstage,
  onDiscard,
  onOpenEditor,
  onShowInFolder,
  onIgnore,
  testId,
}: {
  file: FileStatus;
  icon: React.ElementType;
  iconClass: string;
  onClick: () => void;
  onDoubleClick?: () => void;
  selected: boolean;
  action?: string;
  onAction?: () => void;
  onStage?: () => void;
  onUnstage?: () => void;
  onDiscard?: () => void;
  onOpenEditor?: () => void;
  onShowInFolder?: () => void;
  onIgnore?: () => void;
  testId?: string;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          data-testid={testId}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          className={cn(
            "flex items-center gap-2 px-3 py-1 text-xs cursor-pointer rounded transition-colors group",
            selected ? "bg-primary/15" : "hover:bg-accent",
          )}
        >
          <Icon size={11} className={cn("shrink-0", iconClass)} />
          <span className="flex-1 truncate text-foreground">{file.path}</span>
          {action && onAction && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAction();
              }}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground text-[10px] px-1.5 py-0.5 rounded hover:bg-accent transition-all"
            >
              {action}
            </button>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {onStage && <ContextMenuItem data-testid="file-stage-menuitem" onClick={onStage}>Stage file</ContextMenuItem>}
        {onUnstage && <ContextMenuItem data-testid="file-unstage-menuitem" onClick={onUnstage}>Unstage file</ContextMenuItem>}
        {(onStage || onUnstage) && <ContextMenuSeparator />}
        {onOpenEditor && (
          <ContextMenuItem data-testid="file-open-editor-menuitem" onClick={onOpenEditor}>View diff</ContextMenuItem>
        )}
        {onShowInFolder && (
          <ContextMenuItem data-testid="file-show-folder-menuitem" onClick={onShowInFolder}>Show in folder</ContextMenuItem>
        )}
        <ContextMenuItem
          onClick={() => {
            navigator.clipboard.writeText(file.path);
            toast.success("Copied path");
          }}
        >
          Copy path
        </ContextMenuItem>
        {onIgnore && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onIgnore}>Add to .gitignore</ContextMenuItem>
          </>
        )}
        {onDiscard && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem destructive onClick={onDiscard}>
              Discard changes
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function SectionLabel({
  label,
  count,
  onAll,
  allLabel,
  btnTestId,
}: {
  label: string;
  count: number;
  onAll?: () => void;
  allLabel?: string;
  btnTestId?: string;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label} ({count})
      </span>
      {onAll && count > 0 && (
        <button
          onClick={onAll}
          data-testid={btnTestId}
          className="text-[10px] text-primary hover:text-primary/80 transition-colors"
        >
          {allLabel}
        </button>
      )}
    </div>
  );
}

export function WorkingTree() {
  const {
    activeRepo,
    diff,
    setDiff,
    loadingDiff,
    setLoadingDiff,
    selectedFilePath,
    setSelectedFilePath,
  } = useAppStore();
  const {
    staged,
    unstaged,
    untracked,
    conflicted,
    stageFile,
    unstageFile,
    stageAll,
    unstageAll,
    discardChanges,
    refresh,
  } = useStatus();
  const { loadCommits } = useCommits();

  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);

  const selectFile = async (path: string, isStaged: boolean) => {
    if (!activeRepo) return;
    setSelectedFilePath(path);
    setLoadingDiff(true);
    try {
      const result = await git.getDiff(activeRepo.path, { filePath: path, staged: isStaged });
      setDiff(result);
    } catch {
      setDiff([]);
    } finally {
      setLoadingDiff(false);
    }
  };

  const selectConflictFile = async (path: string) => {
    if (!activeRepo) return;
    setSelectedFilePath(path);
    setLoadingDiff(true);
    try {
      const content = await git.getFileContent(activeRepo.path, path);
      const lines = content.split("\n");
      let inOurs = false, inTheirs = false;
      const diffLines = lines.map((raw, i) => {
        let line_type: "add" | "delete" | "context" | "header" = "context";
        if (raw.startsWith("<<<<<<<")) { line_type = "header"; inOurs = true; inTheirs = false; }
        else if (raw.startsWith("=======")) { line_type = "header"; inOurs = false; inTheirs = true; }
        else if (raw.startsWith(">>>>>>>")) { line_type = "header"; inOurs = false; inTheirs = false; }
        else if (inOurs) { line_type = "delete"; }
        else if (inTheirs) { line_type = "add"; }
        return { content: raw, line_type, old_lineno: i + 1, new_lineno: i + 1 };
      });
      setDiff([{ path, hunks: [{ header: `Conflict — ${path}`, lines: diffLines }] }]);
    } catch {
      setDiff([]);
    } finally {
      setLoadingDiff(false);
    }
  };

  const commit = async () => {
    if (!activeRepo || !commitMsg.trim() || staged.length === 0) return;
    setCommitting(true);
    try {
      await git.createCommit(activeRepo.path, commitMsg);
      setCommitMsg("");
      await loadCommits(0);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setCommitting(false);
    }
  };

  const handleOpenDiff = (filePath: string, staged: boolean, conflicted = false) => {
    if (!activeRepo) return;
    const prefix = conflicted ? "conflict" : staged ? "staged" : "unstaged";
    const key = `wt_${prefix}_${filePath.replace(/[^a-zA-Z0-9_\-]/g, "_")}`;
    localStorage.setItem(`git_rust_filediff_${key}`, JSON.stringify({
      repoPath: activeRepo.path,
      filePath,
      staged,
      conflicted,
    }));
    git.openFileDiffWindow(key, filePath).catch(() => {});
  };

  const handleShowInFolder = async (filePath: string) => {
    if (!activeRepo) return;
    try {
      const full = `${activeRepo.path}/${filePath}`;
      const dir = full.includes("/") ? full.substring(0, full.lastIndexOf("/")) : full;
      await git.showInFolder(dir);
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleIgnoreFile = async (filePath: string) => {
    if (!activeRepo) return;
    try {
      await git.ignoreFile(activeRepo.path, filePath);
      toast.success(`Added ${filePath} to .gitignore`);
    } catch (e) {
      toast.error(String(e));
    }
  };

  const hasConflicts = conflicted.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Conflict banner */}
      {hasConflicts && (
        <button
          onClick={() => activeRepo && git.openMergeWindow(activeRepo.path).catch(() => {})}
          className="flex items-center gap-2 px-3 py-2 bg-destructive/10 border-b border-destructive/20 shrink-0 w-full text-left hover:bg-destructive/20 transition-colors"
        >
          <AlertTriangle size={13} className="text-destructive shrink-0" />
          <span className="text-xs text-destructive font-medium">
            {conflicted.length} file{conflicted.length !== 1 ? "s" : ""} with conflicts — click to resolve
          </span>
        </button>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Working Tree
        </span>
        <button
          onClick={refresh}
          title="Refresh"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* File lists */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Conflicted */}
        {hasConflicts && (
          <>
            <SectionLabel label="Conflicts" count={conflicted.length} />
            {conflicted.map((f) => (
              <FileRow
                key={f.path}
                file={f}
                icon={AlertTriangle}
                iconClass="text-destructive"
                selected={selectedFilePath === f.path}
                onClick={() => selectConflictFile(f.path)}
                onDoubleClick={() => handleOpenDiff(f.path, false, true)}
                onOpenEditor={() => handleOpenDiff(f.path, false, true)}
                onShowInFolder={() => handleShowInFolder(f.path)}
                testId={`worktree-file-${f.path.replace(/\//g, "-")}`}
              />
            ))}
          </>
        )}

        {/* Staged */}
        <SectionLabel
          label="Staged"
          count={staged.length}
          onAll={unstageAll}
          allLabel="Unstage all"
          btnTestId="unstage-all-btn"
        />
        {staged.map((f) => (
          <FileRow
            key={f.path}
            file={f}
            icon={Plus}
            iconClass="text-green-400"
            selected={selectedFilePath === f.path}
            onClick={() => selectFile(f.path, true)}
            onDoubleClick={() => handleOpenDiff(f.path, true)}
            action="−"
            onAction={() => unstageFile(f.path)}
            onUnstage={() => unstageFile(f.path)}
            onOpenEditor={() => handleOpenDiff(f.path, true)}
            onShowInFolder={() => handleShowInFolder(f.path)}
            testId={`worktree-file-${f.path.replace(/\//g, "-")}`}
          />
        ))}

        {/* Unstaged */}
        <SectionLabel
          label="Unstaged"
          count={unstaged.length}
          onAll={stageAll}
          allLabel="Stage all"
          btnTestId="stage-all-btn"
        />
        {unstaged.map((f) => (
          <FileRow
            key={f.path}
            file={f}
            icon={Minus}
            iconClass="text-yellow-400"
            selected={selectedFilePath === f.path}
            onClick={() => selectFile(f.path, false)}
            onDoubleClick={() => handleOpenDiff(f.path, false)}
            action="+"
            onAction={() => stageFile(f.path)}
            onStage={() => stageFile(f.path)}
            onDiscard={() => setConfirmDiscard(f.path)}
            onOpenEditor={() => handleOpenDiff(f.path, false)}
            onShowInFolder={() => handleShowInFolder(f.path)}
            testId={`worktree-file-${f.path.replace(/\//g, "-")}`}
          />
        ))}

        {/* Untracked */}
        {untracked.length > 0 && (
          <>
            <SectionLabel label="Untracked" count={untracked.length} />
            {untracked.map((f) => (
              <FileRow
                key={f.path}
                file={f}
                icon={FileQuestion}
                iconClass="text-muted-foreground"
                selected={selectedFilePath === f.path}
                onClick={() => selectFile(f.path, false)}
                onDoubleClick={() => handleOpenDiff(f.path, false)}
                action="+"
                onAction={() => stageFile(f.path)}
                onStage={() => stageFile(f.path)}
                onOpenEditor={() => handleOpenDiff(f.path, false)}
                onShowInFolder={() => handleShowInFolder(f.path)}
                onIgnore={() => handleIgnoreFile(f.path)}
                testId={`worktree-file-${f.path.replace(/\//g, "-")}`}
              />
            ))}
          </>
        )}
      </div>

      {/* Diff preview */}
      <div className="h-52 border-t border-border overflow-hidden">
        <DiffViewer diff={diff} loading={loadingDiff} />
      </div>

      {/* Commit form */}
      <div className="border-t border-border p-3 shrink-0">
        <textarea
          data-testid="commit-message-textarea"
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          placeholder="Commit message…"
          rows={3}
          className="w-full bg-secondary text-xs text-foreground placeholder:text-muted-foreground rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-ring resize-none mb-2"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
          }}
        />
        <button
          data-testid="commit-btn"
          onClick={commit}
          disabled={!commitMsg.trim() || staged.length === 0 || committing}
          className="w-full bg-primary text-primary-foreground text-xs py-1.5 rounded font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
        >
          {committing ? "Committing…" : `Commit to ${activeRepo?.head_branch ?? "HEAD"}`}
        </button>
      </div>

      <ConfirmDialog
        open={confirmDiscard !== null}
        title="Discard Changes"
        description={`Discard all changes to "${confirmDiscard}"? This cannot be undone.`}
        confirmLabel="Discard"
        destructive
        onConfirm={async () => {
          if (confirmDiscard) await discardChanges(confirmDiscard);
          setConfirmDiscard(null);
        }}
        onCancel={() => setConfirmDiscard(null)}
      />
    </div>
  );
}
