use crate::git::types::StashInfo;
use git2::{Repository, Signature, StashApplyOptions};

#[tauri::command]
pub async fn get_stashes(repo_path: String) -> Result<Vec<StashInfo>, String> {
    let mut repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let mut stashes = Vec::new();

    repo.stash_foreach(|index, message, oid| {
        stashes.push(StashInfo {
            index,
            message: message.to_string(),
            hash: oid.to_string(),
            timestamp: 0,
        });
        true
    })
    .map_err(|e| e.message().to_string())?;

    Ok(stashes)
}

#[tauri::command]
pub async fn create_stash(repo_path: String, message: Option<String>) -> Result<(), String> {
    let mut repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;

    let config = repo.config().map_err(|e| e.message().to_string())?;
    let name = config
        .get_string("user.name")
        .unwrap_or_else(|_| "Unknown".to_string());
    let email = config
        .get_string("user.email")
        .unwrap_or_else(|_| "unknown@example.com".to_string());

    let sig = Signature::now(&name, &email).map_err(|e| e.message().to_string())?;
    let msg = message.as_deref().unwrap_or("WIP");

    repo.stash_save(&sig, msg, None)
        .map_err(|e| e.message().to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn apply_stash(repo_path: String, index: usize) -> Result<(), String> {
    let mut repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let mut opts = StashApplyOptions::new();
    repo.stash_apply(index, Some(&mut opts))
        .map_err(|e| e.message().to_string())
}

#[tauri::command]
pub async fn pop_stash(repo_path: String, index: usize) -> Result<(), String> {
    let mut repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let mut opts = StashApplyOptions::new();
    repo.stash_pop(index, Some(&mut opts))
        .map_err(|e| e.message().to_string())
}

#[tauri::command]
pub async fn drop_stash(repo_path: String, index: usize) -> Result<(), String> {
    let mut repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    repo.stash_drop(index)
        .map_err(|e| e.message().to_string())
}
