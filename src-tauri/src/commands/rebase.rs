use crate::git::types::CommitInfo;
use git2::{Repository, RepositoryState, Sort};
use serde::Deserialize;

#[derive(Deserialize)]
pub struct RebaseStep {
    pub action: String,
    pub hash: String,
    pub message: String,
}

#[tauri::command]
pub async fn get_rebase_commits(
    repo_path: String,
    base_hash: String,
) -> Result<Vec<CommitInfo>, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let base_oid = git2::Oid::from_str(&base_hash).map_err(|e| e.message().to_string())?;

    let mut walk = repo.revwalk().map_err(|e| e.message().to_string())?;
    walk.push_head().map_err(|e| e.message().to_string())?;
    walk.hide(base_oid).map_err(|e| e.message().to_string())?;
    walk.set_sorting(Sort::TOPOLOGICAL | Sort::REVERSE)
        .map_err(|e| e.message().to_string())?;

    let commits = walk
        .filter_map(|oid| oid.ok())
        .filter_map(|oid| repo.find_commit(oid).ok())
        .map(|c| {
            let hash = c.id().to_string();
            let short_hash = hash[..7].to_string();
            CommitInfo {
                hash,
                short_hash,
                message: c.summary().unwrap_or("").to_string(),
                author_name: c.author().name().unwrap_or("").to_string(),
                author_email: c.author().email().unwrap_or("").to_string(),
                timestamp: c.time().seconds(),
                parent_hashes: vec![],
                refs: vec![],
                graph_columns: vec![],
            }
        })
        .collect();

    Ok(commits)
}

#[tauri::command]
pub async fn start_interactive_rebase(
    repo_path: String,
    base_hash: String,
    steps: Vec<RebaseStep>,
) -> Result<(), String> {
    use std::io::Write;

    if steps.is_empty() {
        return Err("No steps provided".into());
    }

    let todo_content = steps
        .iter()
        .map(|s| {
            let short = &s.hash[..s.hash.len().min(7)];
            format!("{} {} {}", s.action, short, s.message)
        })
        .collect::<Vec<_>>()
        .join("\n")
        + "\n";

    let pid = std::process::id();
    let todo_path = std::env::temp_dir().join(format!("git_rebase_todo_{}.txt", pid));
    let script_path = std::env::temp_dir().join(format!("git_rebase_editor_{}.sh", pid));

    std::fs::write(&todo_path, &todo_content).map_err(|e| e.to_string())?;

    let script = format!("#!/bin/sh\ncp '{}' \"$1\"\n", todo_path.display());
    std::fs::write(&script_path, &script).map_err(|e| e.to_string())?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&script_path)
            .map_err(|e| e.to_string())?
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&script_path, perms).map_err(|e| e.to_string())?;
    }

    let output = std::process::Command::new("git")
        .args(["rebase", "-i", &base_hash])
        .env("GIT_SEQUENCE_EDITOR", &script_path)
        .env("GIT_EDITOR", "true")
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("git not found: {}", e))?;

    let _ = std::fs::remove_file(&todo_path);
    let _ = std::fs::remove_file(&script_path);

    if output.status.success() {
        return Ok(());
    }

    // Non-zero exit: check if it stopped for conflicts (rebasing state) vs fatal error
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let stopped_for_conflicts = matches!(
        repo.state(),
        RepositoryState::Rebase | RepositoryState::RebaseInteractive | RepositoryState::RebaseMerge
    );

    if stopped_for_conflicts {
        return Ok(()); // frontend will detect conflict state via getRepoStatus
    }

    Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
}
