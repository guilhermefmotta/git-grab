use crate::git::types::RemoteInfo;
use git2::{AutotagOption, FetchOptions, PushOptions, RemoteCallbacks, Repository};

#[tauri::command]
pub async fn get_remotes(repo_path: String) -> Result<Vec<RemoteInfo>, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let names = repo.remotes().map_err(|e| e.message().to_string())?;
    let remotes = names
        .iter()
        .flatten()
        .filter_map(|name| {
            repo.find_remote(name).ok().map(|r| RemoteInfo {
                name: name.to_string(),
                url: r.url().unwrap_or("").to_string(),
            })
        })
        .collect();
    Ok(remotes)
}

#[tauri::command]
pub async fn fetch_all(repo_path: String) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let remote_names: Vec<String> = repo
        .remotes()
        .map_err(|e| e.message().to_string())?
        .iter()
        .flatten()
        .map(|s| s.to_string())
        .collect();

    for name in remote_names {
        let mut remote = repo
            .find_remote(&name)
            .map_err(|e| e.message().to_string())?;

        let mut callbacks = RemoteCallbacks::new();
        callbacks.credentials(|_url, username, _allowed| {
            git2::Cred::ssh_key_from_agent(username.unwrap_or("git"))
        });

        let mut opts = FetchOptions::new();
        opts.remote_callbacks(callbacks);
        opts.download_tags(AutotagOption::All);

        remote
            .fetch(&[] as &[&str], Some(&mut opts), None)
            .map_err(|e| e.message().to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn pull(repo_path: String, rebase: Option<bool>) -> Result<(), String> {
    fetch_all(repo_path.clone()).await?;

    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let head = repo.head().map_err(|e| e.message().to_string())?;
    let branch_name = head
        .shorthand()
        .ok_or("not on a branch")?
        .to_string();

    let upstream_ref = format!("refs/remotes/origin/{}", branch_name);
    let upstream_oid = repo
        .find_reference(&upstream_ref)
        .map_err(|e| e.message().to_string())?
        .target()
        .ok_or("upstream has no target")?;

    let upstream_commit = repo
        .find_commit(upstream_oid)
        .map_err(|e| e.message().to_string())?;
    let annotated = repo
        .find_annotated_commit(upstream_oid)
        .map_err(|e| e.message().to_string())?;

    let _ = rebase;

    let (analysis, _) = repo
        .merge_analysis(&[&annotated])
        .map_err(|e| e.message().to_string())?;

    if analysis.is_up_to_date() {
        return Ok(());
    }

    if analysis.is_fast_forward() {
        let mut head_ref = repo.head().map_err(|e| e.message().to_string())?;
        head_ref
            .set_target(upstream_oid, "pull fast-forward")
            .map_err(|e| e.message().to_string())?;
        let mut checkout = git2::build::CheckoutBuilder::new();
        checkout.force();
        repo.checkout_tree(upstream_commit.as_object(), Some(&mut checkout))
            .map_err(|e| e.message().to_string())?;
        return Ok(());
    }

    repo.merge(&[&annotated], None, None)
        .map_err(|e| e.message().to_string())
}

#[tauri::command]
pub async fn push(repo_path: String, force: Option<bool>) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let head = repo.head().map_err(|e| e.message().to_string())?;
    let branch_name = head
        .shorthand()
        .ok_or("not on a branch")?
        .to_string();

    let mut remote = repo
        .find_remote("origin")
        .map_err(|e| e.message().to_string())?;

    let refspec = if force.unwrap_or(false) {
        format!("+refs/heads/{0}:refs/heads/{0}", branch_name)
    } else {
        format!("refs/heads/{0}:refs/heads/{0}", branch_name)
    };

    let mut callbacks = RemoteCallbacks::new();
    callbacks.credentials(|_url, username, _allowed| {
        git2::Cred::ssh_key_from_agent(username.unwrap_or("git"))
    });

    let mut opts = PushOptions::new();
    opts.remote_callbacks(callbacks);

    remote
        .push(&[&refspec], Some(&mut opts))
        .map_err(|e| e.message().to_string())
}
