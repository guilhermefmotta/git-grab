use crate::git::types::{FileStatus, FileStatusKind};
use git2::{IndexAddOption, Repository, ResetType, Status};

fn map_status(s: Status, path: &str) -> Option<FileStatus> {
    let staged = s.intersects(
        Status::INDEX_NEW
            | Status::INDEX_MODIFIED
            | Status::INDEX_DELETED
            | Status::INDEX_RENAMED
            | Status::INDEX_TYPECHANGE,
    );
    let unstaged = s.intersects(
        Status::WT_MODIFIED | Status::WT_DELETED | Status::WT_TYPECHANGE | Status::WT_RENAMED,
    );
    let untracked = s.contains(Status::WT_NEW);
    let conflicted = s.contains(Status::CONFLICTED);

    let kind = match (conflicted, staged, unstaged, untracked) {
        (true, _, _, _) => FileStatusKind::Conflicted,
        (_, true, true, _) => FileStatusKind::StagedAndUnstaged,
        (_, true, false, _) => FileStatusKind::Staged,
        (_, false, true, _) => FileStatusKind::Unstaged,
        (_, false, false, true) => FileStatusKind::Untracked,
        _ => return None,
    };

    Some(FileStatus {
        path: path.to_string(),
        status: kind,
        old_path: None,
    })
}

#[tauri::command]
pub async fn get_status(repo_path: String) -> Result<Vec<FileStatus>, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let statuses = repo
        .statuses(None)
        .map_err(|e| e.message().to_string())?;

    let result = statuses
        .iter()
        .filter_map(|entry| {
            let path = entry.path().unwrap_or("");
            map_status(entry.status(), path)
        })
        .collect();

    Ok(result)
}

#[tauri::command]
pub async fn stage_file(repo_path: String, file_path: String) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    index
        .add_path(std::path::Path::new(&file_path))
        .map_err(|e| e.message().to_string())?;
    index.write().map_err(|e| e.message().to_string())
}

#[tauri::command]
pub async fn unstage_file(repo_path: String, file_path: String) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let head = repo.head().map_err(|e| e.message().to_string())?;
    let head_commit = head
        .peel_to_commit()
        .map_err(|e| e.message().to_string())?;
    let head_tree = head_commit
        .tree()
        .map_err(|e| e.message().to_string())?;

    repo.reset_default(
        Some(head_tree.as_object()),
        [file_path].iter(),
    )
    .map_err(|e| e.message().to_string())
}

#[tauri::command]
pub async fn stage_all(repo_path: String) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    index
        .add_all(["*"].iter(), IndexAddOption::DEFAULT, None)
        .map_err(|e| e.message().to_string())?;
    index.write().map_err(|e| e.message().to_string())
}

#[tauri::command]
pub async fn unstage_all(repo_path: String) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let head = repo
        .head()
        .ok()
        .and_then(|h| h.peel_to_commit().ok());

    if let Some(commit) = head {
        let obj = commit.as_object();
        repo.reset(obj, ResetType::Mixed, None)
            .map_err(|e| e.message().to_string())
    } else {
        // No commits yet — just clear the index
        let mut index = repo.index().map_err(|e| e.message().to_string())?;
        index.clear().map_err(|e| e.message().to_string())?;
        index.write().map_err(|e| e.message().to_string())
    }
}

#[tauri::command]
pub async fn discard_changes(repo_path: String, file_path: String) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let mut checkout = git2::build::CheckoutBuilder::new();
    checkout.path(&file_path).force();
    repo.checkout_head(Some(&mut checkout))
        .map_err(|e| e.message().to_string())
}

#[tauri::command]
pub async fn ignore_file(repo_path: String, file_path: String) -> Result<(), String> {
    let gitignore = std::path::Path::new(&repo_path).join(".gitignore");
    let existing = if gitignore.exists() {
        std::fs::read_to_string(&gitignore).map_err(|e| e.to_string())?
    } else {
        String::new()
    };
    let entry = if existing.ends_with('\n') || existing.is_empty() {
        format!("{file_path}\n")
    } else {
        format!("\n{file_path}\n")
    };
    std::fs::write(&gitignore, existing + &entry).map_err(|e| e.to_string())
}
