use crate::git::types::RemoteInfo;
use git2::{build::RepoBuilder, FetchOptions, RemoteCallbacks, Repository};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize)]
pub struct RepoInfo {
    pub path: String,
    pub name: String,
    pub head_branch: Option<String>,
    pub remotes: Vec<RemoteInfo>,
}

fn config_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("git_crab")
        .join("recent.json")
}

#[tauri::command]
pub async fn open_repo(path: String) -> Result<RepoInfo, String> {
    let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;

    let head_branch = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()));

    let remotes: Vec<RemoteInfo> = repo
        .remotes()
        .map(|names| {
            names
                .iter()
                .flatten()
                .filter_map(|name| {
                    repo.find_remote(name).ok().map(|r| RemoteInfo {
                        name: name.to_string(),
                        url: r.url().unwrap_or("").to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let name = PathBuf::from(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("repo")
        .to_string();

    Ok(RepoInfo {
        path,
        name,
        head_branch,
        remotes,
    })
}

#[tauri::command]
pub async fn init_repo(path: String) -> Result<RepoInfo, String> {
    Repository::init(&path).map_err(|e| e.message().to_string())?;
    open_repo(path).await
}

#[tauri::command]
pub async fn clone_repo(url: String, path: String) -> Result<RepoInfo, String> {
    // All git2 objects dropped before the .await
    {
        let mut callbacks = RemoteCallbacks::new();
        callbacks.credentials(|_url, username, _allowed| {
            git2::Cred::ssh_key_from_agent(username.unwrap_or("git"))
        });

        let mut fetch_opts = FetchOptions::new();
        fetch_opts.remote_callbacks(callbacks);

        let mut builder = RepoBuilder::new();
        builder.fetch_options(fetch_opts);

        builder
            .clone(&url, std::path::Path::new(&path))
            .map_err(|e| e.message().to_string())?;
    }

    open_repo(path).await
}

#[tauri::command]
pub async fn get_recent_repos() -> Result<Vec<String>, String> {
    let path = config_path();
    if !path.exists() {
        return Ok(vec![]);
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let repos: Vec<String> = serde_json::from_str(&content).unwrap_or_default();
    // Filter out paths that no longer exist
    let valid: Vec<String> = repos
        .into_iter()
        .filter(|p| Repository::open(p).is_ok())
        .collect();
    Ok(valid)
}

#[tauri::command]
pub async fn add_recent_repo(path: String) -> Result<(), String> {
    let config = config_path();
    if let Some(parent) = config.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut repos = get_recent_repos().await.unwrap_or_default();
    repos.retain(|p| p != &path);
    repos.insert(0, path);
    repos.truncate(20);
    let content = serde_json::to_string(&repos).map_err(|e| e.to_string())?;
    std::fs::write(&config, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_recent_repo(path: String) -> Result<(), String> {
    let config = config_path();
    let mut repos = get_recent_repos().await.unwrap_or_default();
    repos.retain(|p| p != &path);
    let content = serde_json::to_string(&repos).map_err(|e| e.to_string())?;
    std::fs::write(&config, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_commit_window(
    app: tauri::AppHandle,
    hash: String,
    title: String,
) -> Result<(), String> {
    let label = format!("commit-{}", &hash[..hash.len().min(8)]);

    if let Some(win) = app.get_webview_window(&label) {
        win.set_focus().ok();
        return Ok(());
    }

    tauri::WebviewWindowBuilder::new(
        &app,
        &label,
        tauri::WebviewUrl::App(
            std::path::PathBuf::from(format!("index.html?view=commit&hash={}", hash)),
        ),
    )
    .title(title)
    .inner_size(1400.0, 900.0)
    .center()
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn open_file_diff_window(
    app: tauri::AppHandle,
    key: String,
    title: String,
) -> Result<(), String> {
    let label = format!("filediff-{}", key);

    if let Some(win) = app.get_webview_window(&label) {
        win.set_focus().ok();
        return Ok(());
    }

    tauri::WebviewWindowBuilder::new(
        &app,
        &label,
        tauri::WebviewUrl::App(
            std::path::PathBuf::from(format!("index.html?view=filediff&key={}", key)),
        ),
    )
    .title(title)
    .inner_size(1400.0, 900.0)
    .center()
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn open_conflict_window(
    app: tauri::AppHandle,
    key: String,
    title: String,
) -> Result<(), String> {
    let label = format!("conflict-{}", key);

    if let Some(win) = app.get_webview_window(&label) {
        win.set_focus().ok();
        return Ok(());
    }

    tauri::WebviewWindowBuilder::new(
        &app,
        &label,
        tauri::WebviewUrl::App(
            std::path::PathBuf::from(format!("index.html?view=conflict&key={}", key)),
        ),
    )
    .title(title)
    .inner_size(1600.0, 900.0)
    .center()
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_file_content(repo_path: String, file_path: String) -> Result<String, String> {
    let full = std::path::Path::new(&repo_path).join(&file_path);
    std::fs::read_to_string(&full).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn write_file_content(
    repo_path: String,
    file_path: String,
    content: String,
) -> Result<(), String> {
    let full = std::path::Path::new(&repo_path).join(&file_path);
    std::fs::write(&full, content).map_err(|e| e.to_string())
}
