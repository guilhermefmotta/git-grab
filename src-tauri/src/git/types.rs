use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author_name: String,
    pub author_email: String,
    pub timestamp: i64,
    pub parent_hashes: Vec<String>,
    pub refs: Vec<RefInfo>,
    pub graph_columns: Vec<GraphCell>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RefInfo {
    pub name: String,
    pub ref_type: RefType,
    pub is_head: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum RefType {
    Branch,
    RemoteBranch,
    Tag,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GraphCell {
    pub col: usize,
    pub cell_type: GraphCellType,
    pub color_idx: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum GraphCellType {
    Commit,
    PassThrough,
    MergeDown,
    MergeUp,
    BranchDown,
    BranchUp,
    Empty,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileStatus {
    pub path: String,
    pub status: FileStatusKind,
    pub old_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum FileStatusKind {
    Staged,
    Unstaged,
    Untracked,
    Conflicted,
    StagedAndUnstaged,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiffLine {
    pub content: String,
    pub line_type: DiffLineType,
    pub old_lineno: Option<u32>,
    pub new_lineno: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum DiffLineType {
    Add,
    Delete,
    Context,
    Header,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiffHunk {
    pub header: String,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileDiff {
    pub path: String,
    pub hunks: Vec<DiffHunk>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BranchInfo {
    pub name: String,
    pub is_head: bool,
    pub is_remote: bool,
    pub remote_name: Option<String>,
    pub upstream: Option<String>,
    pub ahead: usize,
    pub behind: usize,
    pub last_commit_hash: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteInfo {
    pub name: String,
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StashInfo {
    pub index: usize,
    pub message: String,
    pub hash: String,
    pub timestamp: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TagInfo {
    pub name: String,
    pub hash: String,
    pub is_annotated: bool,
    pub message: Option<String>,
    pub timestamp: Option<i64>,
}
