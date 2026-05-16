use git2::{BlameOptions, Repository};
use serde::Serialize;
use std::path::Path;

#[derive(Serialize)]
pub struct BlameLine {
    pub line_no: usize,
    pub hash: String,
    pub short_hash: String,
    pub author: String,
    pub timestamp: i64,
    pub content: String,
}

#[tauri::command]
pub async fn get_blame(
    repo_path: String,
    file_path: String,
    commit_hash: Option<String>,
) -> Result<Vec<BlameLine>, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;

    let mut opts = BlameOptions::new();
    if let Some(hash) = &commit_hash {
        let oid = git2::Oid::from_str(hash).map_err(|e| e.message().to_string())?;
        opts.newest_commit(oid);
    }

    let blame = repo
        .blame_file(Path::new(&file_path), Some(&mut opts))
        .map_err(|e| e.message().to_string())?;

    let workdir = repo
        .workdir()
        .ok_or_else(|| "Bare repository not supported".to_string())?;
    let full_path = workdir.join(&file_path);
    let raw = std::fs::read_to_string(&full_path)
        .map_err(|e| format!("Cannot read file: {}", e))?;
    let file_lines: Vec<&str> = raw.lines().collect();

    let mut result: Vec<BlameLine> = Vec::new();

    for hunk in blame.iter() {
        let commit_id = hunk.final_commit_id();
        let commit = repo
            .find_commit(commit_id)
            .map_err(|e| e.message().to_string())?;
        let hash_str = commit_id.to_string();
        let short_hash = hash_str[..7.min(hash_str.len())].to_string();
        let author = commit.author().name().unwrap_or("").to_string();
        let timestamp = commit.time().seconds();
        let start = hunk.final_start_line(); // 1-indexed
        let count = hunk.lines_in_hunk();

        for i in 0..count {
            let line_no = start + i;
            let content = file_lines
                .get(line_no - 1)
                .copied()
                .unwrap_or("")
                .to_string();
            result.push(BlameLine {
                line_no,
                hash: hash_str.clone(),
                short_hash: short_hash.clone(),
                author: author.clone(),
                timestamp,
                content,
            });
        }
    }

    result.sort_by_key(|l| l.line_no);
    Ok(result)
}
