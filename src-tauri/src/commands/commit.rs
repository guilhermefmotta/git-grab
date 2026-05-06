use git2::{Repository, ResetType, Signature};

#[tauri::command]
pub async fn create_commit(
    repo_path: String,
    message: String,
) -> Result<String, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;

    let config = repo.config().map_err(|e| e.message().to_string())?;
    let name = config
        .get_string("user.name")
        .unwrap_or_else(|_| "Unknown".to_string());
    let email = config
        .get_string("user.email")
        .unwrap_or_else(|_| "unknown@example.com".to_string());

    let sig = Signature::now(&name, &email).map_err(|e| e.message().to_string())?;

    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    let tree_id = index.write_tree().map_err(|e| e.message().to_string())?;
    let tree = repo.find_tree(tree_id).map_err(|e| e.message().to_string())?;

    let parent_commit = repo
        .head()
        .ok()
        .and_then(|h| h.peel_to_commit().ok());

    let parents: Vec<&git2::Commit> = parent_commit.as_ref().map(|c| vec![c]).unwrap_or_default();

    let oid = repo
        .commit(Some("HEAD"), &sig, &sig, &message, &tree, &parents)
        .map_err(|e| e.message().to_string())?;

    Ok(oid.to_string())
}

#[tauri::command]
pub async fn amend_commit(
    repo_path: String,
    message: String,
) -> Result<String, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;

    let config = repo.config().map_err(|e| e.message().to_string())?;
    let name = config
        .get_string("user.name")
        .unwrap_or_else(|_| "Unknown".to_string());
    let email = config
        .get_string("user.email")
        .unwrap_or_else(|_| "unknown@example.com".to_string());

    let sig = Signature::now(&name, &email).map_err(|e| e.message().to_string())?;

    let head_commit = repo
        .head()
        .map_err(|e| e.message().to_string())?
        .peel_to_commit()
        .map_err(|e| e.message().to_string())?;

    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    let tree_id = index.write_tree().map_err(|e| e.message().to_string())?;
    let tree = repo.find_tree(tree_id).map_err(|e| e.message().to_string())?;

    let oid = head_commit
        .amend(Some("HEAD"), Some(&sig), Some(&sig), None, Some(&message), Some(&tree))
        .map_err(|e| e.message().to_string())?;

    Ok(oid.to_string())
}

#[tauri::command]
pub async fn undo_last_commit(repo_path: String) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let head = repo
        .head()
        .map_err(|e| e.message().to_string())?
        .peel_to_commit()
        .map_err(|e| e.message().to_string())?;
    let parent = head
        .parent(0)
        .map_err(|_| "No parent commit — this is the initial commit".to_string())?;
    repo.reset(parent.as_object(), ResetType::Soft, None)
        .map_err(|e| e.message().to_string())
}

#[tauri::command]
pub async fn cherry_pick(repo_path: String, commit_hash: String) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let oid = git2::Oid::from_str(&commit_hash).map_err(|e| e.message().to_string())?;
    let commit = repo.find_commit(oid).map_err(|e| e.message().to_string())?;

    repo.cherrypick(&commit, None)
        .map_err(|e| e.message().to_string())?;

    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    if index.has_conflicts() {
        repo.cleanup_state().ok();
        return Err("Cherry-pick resulted in conflicts — resolve them manually".to_string());
    }

    let config = repo.config().map_err(|e| e.message().to_string())?;
    let name = config.get_string("user.name").unwrap_or_else(|_| "Unknown".to_string());
    let email = config.get_string("user.email").unwrap_or_else(|_| "unknown@example.com".to_string());
    let sig = Signature::now(&name, &email).map_err(|e| e.message().to_string())?;

    let tree_id = index.write_tree().map_err(|e| e.message().to_string())?;
    let tree = repo.find_tree(tree_id).map_err(|e| e.message().to_string())?;
    let head_commit = repo
        .head()
        .map_err(|e| e.message().to_string())?
        .peel_to_commit()
        .map_err(|e| e.message().to_string())?;

    repo.commit(
        Some("HEAD"),
        &sig,
        &sig,
        commit.message().unwrap_or(""),
        &tree,
        &[&head_commit],
    )
    .map_err(|e| e.message().to_string())?;

    repo.cleanup_state().ok();
    Ok(())
}

#[tauri::command]
pub async fn revert_commit(repo_path: String, commit_hash: String) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let oid = git2::Oid::from_str(&commit_hash).map_err(|e| e.message().to_string())?;
    let commit = repo.find_commit(oid).map_err(|e| e.message().to_string())?;
    let original_msg = commit.message().unwrap_or("").to_string();
    let short = &commit_hash[..commit_hash.len().min(8)];

    repo.revert(&commit, None)
        .map_err(|e| e.message().to_string())?;

    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    if index.has_conflicts() {
        repo.cleanup_state().ok();
        return Err("Revert resulted in conflicts — resolve them manually".to_string());
    }

    let config = repo.config().map_err(|e| e.message().to_string())?;
    let name = config.get_string("user.name").unwrap_or_else(|_| "Unknown".to_string());
    let email = config.get_string("user.email").unwrap_or_else(|_| "unknown@example.com".to_string());
    let sig = Signature::now(&name, &email).map_err(|e| e.message().to_string())?;

    let tree_id = index.write_tree().map_err(|e| e.message().to_string())?;
    let tree = repo.find_tree(tree_id).map_err(|e| e.message().to_string())?;
    let head_commit = repo
        .head()
        .map_err(|e| e.message().to_string())?
        .peel_to_commit()
        .map_err(|e| e.message().to_string())?;

    let msg = format!("Revert \"{original_msg}\"\n\nThis reverts commit {short}.");
    repo.commit(Some("HEAD"), &sig, &sig, &msg, &tree, &[&head_commit])
        .map_err(|e| e.message().to_string())?;

    repo.cleanup_state().ok();
    Ok(())
}

#[tauri::command]
pub async fn reset_to_commit(repo_path: String, commit_hash: String, mode: String) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let oid = git2::Oid::from_str(&commit_hash).map_err(|e| e.message().to_string())?;
    let commit = repo.find_commit(oid).map_err(|e| e.message().to_string())?;
    let reset_type = match mode.as_str() {
        "soft" => ResetType::Soft,
        "hard" => ResetType::Hard,
        _ => ResetType::Mixed,
    };
    repo.reset(commit.as_object(), reset_type, None)
        .map_err(|e| e.message().to_string())
}
