use crate::git::types::BranchInfo;
use git2::{BranchType, Repository, Signature};

#[tauri::command]
pub async fn get_branches(repo_path: String) -> Result<Vec<BranchInfo>, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let head_name = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()));

    let mut branches = Vec::new();

    for branch_type in [BranchType::Local, BranchType::Remote] {
        for branch in repo
            .branches(Some(branch_type))
            .map_err(|e| e.message().to_string())?
            .filter_map(|b| b.ok())
        {
            let (b, btype) = branch;
            let name = b
                .name()
                .map_err(|e| e.message().to_string())?
                .unwrap_or("")
                .to_string();

            let is_head = head_name.as_deref() == Some(&name) && btype == BranchType::Local;
            let is_remote = btype == BranchType::Remote;

            let last_commit_hash = b
                .get()
                .target()
                .map(|oid| oid.to_string());

            let (upstream, ahead, behind) = if !is_remote {
                let upstream_name = b
                    .upstream()
                    .ok()
                    .and_then(|u| u.name().ok().flatten().map(|s| s.to_string()));

                let (a, bh) = if let (Some(_), Some(local_oid)) =
                    (&upstream_name, b.get().target())
                {
                    b.upstream()
                        .ok()
                        .and_then(|u| u.get().target())
                        .and_then(|remote_oid| {
                            repo.graph_ahead_behind(local_oid, remote_oid).ok()
                        })
                        .unwrap_or((0, 0))
                } else {
                    (0, 0)
                };

                (upstream_name, a, bh)
            } else {
                (None, 0, 0)
            };

            let remote_name = if is_remote {
                Some(name.split('/').next().unwrap_or("").to_string())
            } else {
                None
            };
            branches.push(BranchInfo {
                name,
                is_head,
                is_remote,
                remote_name,
                upstream,
                ahead,
                behind,
                last_commit_hash,
            });
        }
    }

    Ok(branches)
}

#[tauri::command]
pub async fn create_branch(
    repo_path: String,
    name: String,
    from_hash: Option<String>,
    checkout: Option<bool>,
) -> Result<(), String> {
    // All git2 objects dropped before the .await below
    {
        let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
        let commit = if let Some(hash) = from_hash {
            let oid = git2::Oid::from_str(&hash).map_err(|e| e.message().to_string())?;
            repo.find_commit(oid).map_err(|e| e.message().to_string())?
        } else {
            repo.head()
                .map_err(|e| e.message().to_string())?
                .peel_to_commit()
                .map_err(|e| e.message().to_string())?
        };
        repo.branch(&name, &commit, false)
            .map_err(|e| e.message().to_string())?;
    }

    if checkout.unwrap_or(false) {
        checkout_branch(repo_path, name).await?;
    }

    Ok(())
}

#[tauri::command]
pub async fn checkout_branch(repo_path: String, name: String) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;

    let branch = repo
        .find_branch(&name, BranchType::Local)
        .map_err(|e| e.message().to_string())?;
    let ref_name = branch
        .get()
        .name()
        .ok_or("invalid branch ref")?
        .to_string();

    let obj = repo
        .revparse_single(&ref_name)
        .map_err(|e| e.message().to_string())?;

    repo.checkout_tree(&obj, None)
        .map_err(|e| e.message().to_string())?;

    repo.set_head(&ref_name)
        .map_err(|e| e.message().to_string())
}

#[tauri::command]
pub async fn delete_branch(
    repo_path: String,
    name: String,
    force: Option<bool>,
) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let mut branch = repo
        .find_branch(&name, BranchType::Local)
        .map_err(|e| e.message().to_string())?;
    branch
        .delete()
        .map_err(|e| e.message().to_string())?;
    let _ = force;
    Ok(())
}

#[tauri::command]
pub async fn rename_branch(
    repo_path: String,
    name: String,
    new_name: String,
) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let mut branch = repo
        .find_branch(&name, BranchType::Local)
        .map_err(|e| e.message().to_string())?;
    branch
        .rename(&new_name, false)
        .map_err(|e| e.message().to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn merge_branch(repo_path: String, branch_name: String) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;

    let branch = repo
        .find_branch(&branch_name, BranchType::Local)
        .map_err(|e| e.message().to_string())?;
    let annotated = repo
        .reference_to_annotated_commit(branch.get())
        .map_err(|e| e.message().to_string())?;

    let (analysis, _) = repo
        .merge_analysis(&[&annotated])
        .map_err(|e| e.message().to_string())?;

    if analysis.is_up_to_date() {
        return Ok(());
    }

    if analysis.is_fast_forward() {
        let target = branch.get().target().ok_or("no target")?;
        let target_commit = repo
            .find_commit(target)
            .map_err(|e| e.message().to_string())?;
        let mut head_ref = repo.head().map_err(|e| e.message().to_string())?;
        head_ref
            .set_target(target, "fast-forward merge")
            .map_err(|e| e.message().to_string())?;
        let mut checkout = git2::build::CheckoutBuilder::new();
        checkout.force();
        repo.checkout_tree(target_commit.as_object(), Some(&mut checkout))
            .map_err(|e| e.message().to_string())?;
        return Ok(());
    }

    repo.merge(&[&annotated], None, None)
        .map_err(|e| e.message().to_string())
}

#[tauri::command]
pub async fn rebase_branch(repo_path: String, branch_name: String) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;

    let config = repo.config().map_err(|e| e.message().to_string())?;
    let name = config.get_string("user.name").unwrap_or_else(|_| "Unknown".to_string());
    let email = config.get_string("user.email").unwrap_or_else(|_| "unknown@example.com".to_string());
    let sig = Signature::now(&name, &email).map_err(|e| e.message().to_string())?;

    let branch = repo
        .find_branch(&branch_name, BranchType::Local)
        .map_err(|e| e.message().to_string())?;
    let upstream = repo
        .reference_to_annotated_commit(branch.get())
        .map_err(|e| e.message().to_string())?;

    let mut rebase = repo
        .rebase(None, Some(&upstream), None, None)
        .map_err(|e| e.message().to_string())?;

    loop {
        match rebase.next() {
            None => break,
            Some(Err(e)) => {
                rebase.abort().ok();
                return Err(e.message().to_string());
            }
            Some(Ok(_op)) => {
                let index = repo.index().map_err(|e| e.message().to_string())?;
                if index.has_conflicts() {
                    rebase.abort().ok();
                    return Err("Rebase resulted in conflicts — aborting".to_string());
                }
                rebase.commit(None, &sig, None).map_err(|e| e.message().to_string())?;
            }
        }
    }

    rebase.finish(Some(&sig)).map_err(|e| e.message().to_string())
}
