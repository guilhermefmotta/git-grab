use git2::Repository;
use serde::Serialize;

#[derive(Serialize)]
pub struct SubmoduleInfo {
    pub name: String,
    pub path: String,
    pub url: String,
    pub head_hash: Option<String>,
}

#[tauri::command]
pub async fn get_submodules(repo_path: String) -> Result<Vec<SubmoduleInfo>, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let workdir = repo
        .workdir()
        .ok_or_else(|| "Bare repository not supported".to_string())?;

    let submodules = repo.submodules().map_err(|e| e.message().to_string())?;
    let result = submodules
        .iter()
        .map(|sub| SubmoduleInfo {
            name: sub.name().unwrap_or("").to_string(),
            path: workdir.join(sub.path()).to_string_lossy().to_string(),
            url: sub.url().unwrap_or("").to_string(),
            head_hash: sub.head_id().map(|oid| oid.to_string()),
        })
        .collect();

    Ok(result)
}
