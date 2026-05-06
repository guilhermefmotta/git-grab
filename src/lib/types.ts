export interface RepoInfo {
  path: string;
  name: string;
  head_branch: string | null;
  remotes: RemoteInfo[];
}

export interface CommitInfo {
  hash: string;
  short_hash: string;
  message: string;
  author_name: string;
  author_email: string;
  timestamp: number;
  parent_hashes: string[];
  refs: RefInfo[];
  graph_columns: GraphCell[];
}

export interface RefInfo {
  name: string;
  ref_type: "branch" | "remote_branch" | "tag";
  is_head: boolean;
}

export interface GraphCell {
  col: number;
  cell_type:
    | "commit"
    | "pass_through"
    | "merge_down"
    | "merge_up"
    | "branch_down"
    | "branch_up"
    | "empty";
  color_idx: number;
}

export interface FileStatus {
  path: string;
  status: "staged" | "unstaged" | "untracked" | "conflicted" | "staged_and_unstaged";
  old_path: string | null;
}

export interface DiffLine {
  content: string;
  line_type: "add" | "delete" | "context" | "header";
  old_lineno: number | null;
  new_lineno: number | null;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  hunks: DiffHunk[];
}

export interface BranchInfo {
  name: string;
  is_head: boolean;
  is_remote: boolean;
  remote_name: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  last_commit_hash: string | null;
}

export interface RemoteInfo {
  name: string;
  url: string;
}

export interface StashInfo {
  index: number;
  message: string;
  hash: string;
  timestamp: number;
}

export interface TagInfo {
  name: string;
  hash: string;
  is_annotated: boolean;
  message: string | null;
  timestamp: number | null;
}
