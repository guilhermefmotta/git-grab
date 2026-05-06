import { invoke } from "@tauri-apps/api/core";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import type {
  RepoInfo,
  CommitInfo,
  FileStatus,
  FileDiff,
  BranchInfo,
  RemoteInfo,
  StashInfo,
  TagInfo,
} from "./types";

export { invoke };

export const git = {
  // Repo
  openRepo: (path: string) => invoke<RepoInfo>("open_repo", { path }),
  initRepo: (path: string) => invoke<RepoInfo>("init_repo", { path }),
  cloneRepo: (url: string, path: string) => invoke<RepoInfo>("clone_repo", { url, path }),
  getRecentRepos: () => invoke<string[]>("get_recent_repos"),
  addRecentRepo: (path: string) => invoke<void>("add_recent_repo", { path }),
  removeRecentRepo: (path: string) => invoke<void>("remove_recent_repo", { path }),

  // Status
  getStatus: (repoPath: string) => invoke<FileStatus[]>("get_status", { repoPath }),
  stageFile: (repoPath: string, filePath: string) =>
    invoke<void>("stage_file", { repoPath, filePath }),
  unstageFile: (repoPath: string, filePath: string) =>
    invoke<void>("unstage_file", { repoPath, filePath }),
  stageAll: (repoPath: string) => invoke<void>("stage_all", { repoPath }),
  unstageAll: (repoPath: string) => invoke<void>("unstage_all", { repoPath }),
  discardChanges: (repoPath: string, filePath: string) =>
    invoke<void>("discard_changes", { repoPath, filePath }),

  // Log
  getCommits: (repoPath: string, limit?: number, offset?: number, branch?: string) =>
    invoke<CommitInfo[]>("get_commits", { repoPath, limit, offset, branch }),

  // Diff
  getDiff: (
    repoPath: string,
    opts: { filePath?: string; commitHash?: string; staged?: boolean }
  ) => invoke<FileDiff[]>("get_diff", { repoPath, ...opts }),

  // Commit
  createCommit: (repoPath: string, message: string) =>
    invoke<string>("create_commit", { repoPath, message }),
  amendCommit: (repoPath: string, message: string) =>
    invoke<string>("amend_commit", { repoPath, message }),
  undoLastCommit: (repoPath: string) =>
    invoke<void>("undo_last_commit", { repoPath }),

  // Branches
  getBranches: (repoPath: string) => invoke<BranchInfo[]>("get_branches", { repoPath }),
  createBranch: (repoPath: string, name: string, fromHash?: string, checkout?: boolean) =>
    invoke<void>("create_branch", { repoPath, name, fromHash, checkout }),
  checkoutBranch: (repoPath: string, name: string) =>
    invoke<void>("checkout_branch", { repoPath, name }),
  deleteBranch: (repoPath: string, name: string, force?: boolean) =>
    invoke<void>("delete_branch", { repoPath, name, force }),
  renameBranch: (repoPath: string, name: string, newName: string) =>
    invoke<void>("rename_branch", { repoPath, name, newName }),
  mergeBranch: (repoPath: string, branchName: string) =>
    invoke<void>("merge_branch", { repoPath, branchName }),
  rebaseBranch: (repoPath: string, branchName: string) =>
    invoke<void>("rebase_branch", { repoPath, branchName }),

  // Commit operations
  cherryPick: (repoPath: string, commitHash: string) =>
    invoke<void>("cherry_pick", { repoPath, commitHash }),
  revertCommit: (repoPath: string, commitHash: string) =>
    invoke<void>("revert_commit", { repoPath, commitHash }),
  resetToCommit: (repoPath: string, commitHash: string, mode: string) =>
    invoke<void>("reset_to_commit", { repoPath, commitHash, mode }),

  // Remote
  getRemotes: (repoPath: string) => invoke<RemoteInfo[]>("get_remotes", { repoPath }),
  fetchAll: (repoPath: string) => invoke<void>("fetch_all", { repoPath }),
  pull: (repoPath: string, rebase?: boolean) =>
    invoke<void>("pull", { repoPath, rebase }),
  push: (repoPath: string, force?: boolean) =>
    invoke<void>("push", { repoPath, force }),

  // Stash
  getStashes: (repoPath: string) => invoke<StashInfo[]>("get_stashes", { repoPath }),
  createStash: (repoPath: string, message?: string) =>
    invoke<void>("create_stash", { repoPath, message }),
  applyStash: (repoPath: string, index: number) =>
    invoke<void>("apply_stash", { repoPath, index }),
  popStash: (repoPath: string, index: number) =>
    invoke<void>("pop_stash", { repoPath, index }),
  dropStash: (repoPath: string, index: number) =>
    invoke<void>("drop_stash", { repoPath, index }),

  // Tags
  getTags: (repoPath: string) => invoke<TagInfo[]>("get_tags", { repoPath }),
  createTag: (repoPath: string, name: string, commitHash?: string, message?: string) =>
    invoke<void>("create_tag", { repoPath, name, commitHash, message }),
  deleteTag: (repoPath: string, name: string) =>
    invoke<void>("delete_tag", { repoPath, name }),

  // Windows
  openCommitWindow: (hash: string, title: string) =>
    invoke<void>("open_commit_window", { hash, title }),
  openFileDiffWindow: (key: string, title: string) =>
    invoke<void>("open_file_diff_window", { key, title }),
  openConflictWindow: (key: string, title: string) =>
    invoke<void>("open_conflict_window", { key, title }),

  // File operations
  ignoreFile: (repoPath: string, filePath: string) =>
    invoke<void>("ignore_file", { repoPath, filePath }),
  getFileContent: (repoPath: string, filePath: string) =>
    invoke<string>("get_file_content", { repoPath, filePath }),
  writeFileContent: (repoPath: string, filePath: string, content: string) =>
    invoke<void>("write_file_content", { repoPath, filePath, content }),

  // Shell
  openInEditor: (filePath: string) => shellOpen(filePath),
};
