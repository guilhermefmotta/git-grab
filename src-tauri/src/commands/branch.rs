use crate::git::types::BranchInfo;
use git2::{BranchType, Repository, Signature, StashApplyOptions, StashFlags};

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

struct ConflictEntry {
    path: String,
    ancestor_oid: Option<git2::Oid>,
    our_oid: Option<git2::Oid>,
    their_oid: Option<git2::Oid>,
}

/// Read blob content by OID; return empty string if missing or binary.
fn read_blob(repo: &Repository, oid: git2::Oid) -> String {
    repo.find_blob(oid)
        .ok()
        .and_then(|b| std::str::from_utf8(b.content()).ok().map(String::from))
        .unwrap_or_default()
}

/// Collect conflicted file paths and write proper partial <<<<<<< markers
/// using diffy's 3-way line diff so ONLY the differing lines get conflict
/// blocks; all context lines remain plain and appear in all three viewer
/// panels. Falls back to whole-blob wrapping for binary files or when all
/// three stages are absent on one side.
fn collect_index_conflicts(repo: &Repository) -> Result<Vec<String>, String> {
    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    index.read(true).ok();

    let our_label = repo
        .head().ok()
        .and_then(|h| h.shorthand().map(String::from))
        .unwrap_or_else(|| "HEAD".to_string());

    let mut entries: Vec<ConflictEntry> = Vec::new();
    {
        let conflicts = index.conflicts().map_err(|e| e.message().to_string())?;
        for c in conflicts {
            let c = match c { Ok(c) => c, Err(_) => continue };
            let path = c.our.as_ref()
                .or(c.their.as_ref())
                .or(c.ancestor.as_ref())
                .and_then(|e| std::str::from_utf8(&e.path).ok().map(String::from));
            if let Some(p) = path {
                entries.push(ConflictEntry {
                    path: p,
                    ancestor_oid: c.ancestor.as_ref().map(|e| e.id),
                    our_oid: c.our.as_ref().map(|e| e.id),
                    their_oid: c.their.as_ref().map(|e| e.id),
                });
            }
        }
    }

    if entries.is_empty() {
        return Ok(vec![]);
    }

    let workdir = repo.workdir().map(|p| p.to_path_buf());

    for entry in &entries {
        let fp = workdir.as_ref().map(|wd| wd.join(&entry.path));

        let ancestor = entry.ancestor_oid.map(|oid| read_blob(repo, oid)).unwrap_or_default();
        let ours = entry.our_oid
            .map(|oid| read_blob(repo, oid))
            .or_else(|| {
                // Workdir fallback ONLY when ancestor is also absent (file added only by
                // theirs). When ancestor exists but our_oid is absent, we deleted the file
                // → represent as "" so diffy sees the deletion as a conflict.
                if entry.ancestor_oid.is_none() {
                    fp.as_ref().and_then(|p| std::fs::read_to_string(p).ok())
                } else {
                    None
                }
            })
            .unwrap_or_default();
        let theirs = entry.their_oid.map(|oid| read_blob(repo, oid)).unwrap_or_default();

        // Use whole-blob format when:
        // - either side already has conflict markers (diffy would produce nested markers), OR
        // - one side is empty (delete/modify conflict) — diffy on ("full", "", "full+1") produces
        //   many tiny conflict blocks which are hard to present; whole-blob is cleaner.
        let has_nested = ours.contains("<<<<<<<") || theirs.contains("<<<<<<<");
        let is_delete = ours.is_empty() || theirs.is_empty();

        let content = if has_nested || is_delete {
            // Whole-blob: show full ours vs full theirs so the parser sees exactly
            // one clean conflict block. User picks Accept Ours (HEAD) or Accept Theirs.
            let ours_nl = if ours.ends_with('\n') { "" } else { "\n" };
            let theirs_nl = if theirs.ends_with('\n') { "" } else { "\n" };
            format!("<<<<<<< {our_label}\n{ours}{ours_nl}=======\n{theirs}{theirs_nl}>>>>>>> incoming\n")
        } else {
            // diffy 3-way merge: partial markers — only DIFFERING lines get <<<<<<< blocks;
            // unchanged context stays plain text and appears in all three panels.
            let mut merge_opts = diffy::MergeOptions::new();
            merge_opts.set_conflict_style(diffy::ConflictStyle::Merge);
            match merge_opts.merge(&ancestor, &ours, &theirs) {
                Ok(clean) => clean,
                Err(conflict_text) => conflict_text,
            }
        };

        if let Some(ref p) = fp {
            let _ = std::fs::write(p, &content);
        }
    }

    Ok(entries.into_iter().map(|e| e.path).collect())
}

#[tauri::command]
pub async fn get_index_conflicts(repo_path: String) -> Result<Vec<String>, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    collect_index_conflicts(&repo)
}

/// Smart checkout:
/// - If index already has conflicts → open those first (don't switch branch).
/// - Otherwise: stash → checkout → pop stash → ensure markers.
/// Returns conflicted file paths for the viewer.
#[tauri::command]
pub async fn smart_checkout(repo_path: String, name: String) -> Result<Vec<String>, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;

    // If the index already has unresolved conflicts, surface them now.
    let existing = collect_index_conflicts(&repo)?;
    if !existing.is_empty() {
        return Ok(existing);
    }

    // Stash local changes
    {
        let mut repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
        let config = repo.config().map_err(|e| e.message().to_string())?;
        let user_name = config.get_string("user.name").unwrap_or_else(|_| "Unknown".to_string());
        let email = config.get_string("user.email").unwrap_or_else(|_| "unknown@example.com".to_string());
        let sig = Signature::now(&user_name, &email).map_err(|e| e.message().to_string())?;
        let msg = format!("smart-checkout: before {}", name);
        repo.stash_save(&sig, &msg, Some(StashFlags::INCLUDE_UNTRACKED))
            .map_err(|e| e.message().to_string())?;
    }

    // Checkout target branch; restore stash on failure
    if let Err(e) = checkout_branch(repo_path.clone(), name).await {
        if let Ok(mut repo) = Repository::open(&repo_path) {
            let mut opts = StashApplyOptions::new();
            let _ = repo.stash_pop(0, Some(&mut opts));
        }
        return Err(e);
    }

    // Pop stash — may create conflicts
    let mut repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let mut opts = StashApplyOptions::new();
    let _ = repo.stash_pop(0, Some(&mut opts));

    collect_index_conflicts(&repo)
}

/// Abort the current conflict state: reset index to HEAD and restore conflicted
/// working-tree files to HEAD's version. Equivalent to `git reset --merge`.
/// Keeps unstaged changes in non-conflicted files.
#[tauri::command]
pub async fn abort_conflicts(repo_path: String) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let workdir = repo.workdir()
        .ok_or_else(|| "not a working repository".to_string())?
        .to_path_buf();

    let status = std::process::Command::new("git")
        .arg("reset")
        .arg("--merge")
        .current_dir(&workdir)
        .status()
        .map_err(|e| e.to_string())?;

    if !status.success() {
        return Err("git reset --merge failed".to_string());
    }
    Ok(())
}
