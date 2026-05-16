use serde::{Deserialize, Serialize};
use tauri::Manager;

// ── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ForgePlatform {
    GitHub,
    GitLab,
    Unknown,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ForgeInfo {
    pub platform: ForgePlatform,
    pub owner: String,
    pub repo: String,
    pub base_url: String,
    pub has_token: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PullRequest {
    pub number: u64,
    pub title: String,
    pub state: String,
    pub url: String,
    pub author: String,
    pub created_at: String,
    pub source_branch: String,
    pub target_branch: String,
    pub draft: bool,
    pub body: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Pipeline {
    pub id: u64,
    pub name: String,
    pub status: String,
    pub branch: String,
    pub url: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PipelineJob {
    pub id: u64,
    pub name: String,
    pub status: String,
    pub stage: Option<String>,
    pub url: Option<String>,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub duration_seconds: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PrComment {
    pub id: u64,
    pub author: String,
    pub body: String,
    pub created_at: String,
    pub url: String,
}

// ── Detection helpers ─────────────────────────────────────────────────────────

fn parse_remote_url(url: &str) -> (ForgePlatform, String, String, String) {
    let url = url.trim();

    let (platform, base_url, raw_path) = if url.contains("github.com") {
        let path = if url.starts_with("git@") {
            url.splitn(2, ':').nth(1).unwrap_or("").to_string()
        } else {
            url.trim_start_matches("https://github.com/").to_string()
        };
        (ForgePlatform::GitHub, "https://api.github.com".to_string(), path)
    } else if url.contains("gitlab") {
        let path = if url.starts_with("git@") {
            url.splitn(2, ':').nth(1).unwrap_or("").to_string()
        } else {
            let without_scheme = url
                .trim_start_matches("https://")
                .trim_start_matches("http://");
            without_scheme.splitn(2, '/').nth(1).unwrap_or("").to_string()
        };
        let base = if url.contains("gitlab.com") {
            "https://gitlab.com".to_string()
        } else {
            let without_scheme = url
                .trim_start_matches("https://")
                .trim_start_matches("http://");
            format!(
                "https://{}",
                without_scheme.splitn(2, '/').next().unwrap_or("gitlab.com")
            )
        };
        (ForgePlatform::GitLab, base, path)
    } else {
        return (ForgePlatform::Unknown, String::new(), String::new(), String::new());
    };

    let path = raw_path.trim_end_matches(".git");
    let mut parts = path.splitn(2, '/');
    let owner = parts.next().unwrap_or("").to_string();
    let repo = parts.next().unwrap_or("").to_string();

    (platform, base_url, owner, repo)
}

fn get_remote_url(repo_path: &str) -> Option<String> {
    let repo = git2::Repository::open(repo_path).ok()?;
    let remote = repo.find_remote("origin").ok()?;
    remote.url().map(|s| s.to_string())
}

fn read_github_token() -> Option<String> {
    // 1. env vars (CI / manual export)
    if let Ok(t) = std::env::var("GH_TOKEN").or_else(|_| std::env::var("GITHUB_TOKEN")) {
        if !t.is_empty() { return Some(t); }
    }
    // 2. `gh auth token` — works with keyring-backed tokens (gh ≥ 2.x)
    if let Ok(out) = std::process::Command::new("gh").args(["auth", "token"]).output() {
        let t = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !t.is_empty() && out.status.success() { return Some(t); }
    }
    // 3. legacy hosts.yml (older gh versions stored token in plain text)
    let path = dirs::config_dir()?.join("gh").join("hosts.yml");
    let content = std::fs::read_to_string(path).ok()?;
    for line in content.lines() {
        let t = line.trim();
        if t.starts_with("oauth_token:") {
            return Some(t.trim_start_matches("oauth_token:").trim().to_string());
        }
    }
    None
}

fn read_gitlab_token(base_url: &str) -> Option<String> {
    // 1. env vars
    if let Ok(t) = std::env::var("GITLAB_TOKEN")
        .or_else(|_| std::env::var("GL_TOKEN"))
        .or_else(|_| std::env::var("CI_JOB_TOKEN"))
    {
        if !t.is_empty() { return Some(t); }
    }
    // 2. `glab auth token`
    if let Ok(out) = std::process::Command::new("glab").args(["auth", "token"]).output() {
        let t = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !t.is_empty() && out.status.success() { return Some(t); }
    }
    // 3. glab config file
    let path = dirs::config_dir()?.join("glab-cli").join("config.yml");
    let content = std::fs::read_to_string(path).ok()?;
    let host = base_url
        .trim_start_matches("https://")
        .trim_start_matches("http://");
    let mut in_host = false;
    for line in content.lines() {
        if line.contains(host) {
            in_host = true;
        } else if in_host {
            let t = line.trim();
            if t.starts_with("token:") {
                return Some(t.trim_start_matches("token:").trim().to_string());
            }
            if !t.is_empty() && !t.starts_with('#') && !line.starts_with(' ') && !line.starts_with('\t') {
                in_host = false;
            }
        }
    }
    None
}

fn app_token_path() -> Option<std::path::PathBuf> {
    Some(dirs::config_dir()?.join("git-crab").join("tokens.json"))
}

fn load_app_token(platform: &str) -> Option<String> {
    let content = std::fs::read_to_string(app_token_path()?).ok()?;
    let v: serde_json::Value = serde_json::from_str(&content).ok()?;
    v.get(platform)?.as_str().map(|s| s.to_string())
}

fn get_token(platform: &ForgePlatform, base_url: &str) -> Option<String> {
    match platform {
        ForgePlatform::GitHub => read_github_token().or_else(|| load_app_token("github")),
        ForgePlatform::GitLab => read_gitlab_token(base_url).or_else(|| load_app_token("gitlab")),
        ForgePlatform::Unknown => None,
    }
}

fn make_client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent("git-crab/1.0")
        .build()
        .unwrap()
}

// ── API helpers ───────────────────────────────────────────────────────────────

async fn gh_get(client: &reqwest::Client, token: &Option<String>, url: &str) -> Result<serde_json::Value, String> {
    let mut req = client
        .get(url)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28");
    if let Some(t) = token {
        req = req.bearer_auth(t);
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("GitHub {}: {}", status, body));
    }
    resp.json().await.map_err(|e| e.to_string())
}

async fn gl_get(client: &reqwest::Client, token: &Option<String>, url: &str) -> Result<serde_json::Value, String> {
    let mut req = client.get(url);
    if let Some(t) = token {
        req = req.header("PRIVATE-TOKEN", t);
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("GitLab {}: {}", status, body));
    }
    resp.json().await.map_err(|e| e.to_string())
}

async fn gh_post(client: &reqwest::Client, token: &str, url: &str, body: serde_json::Value) -> Result<(), String> {
    let resp = client
        .post(url)
        .bearer_auth(token)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .json(&body)
        .send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("GitHub {}", resp.status()));
    }
    Ok(())
}

async fn gl_post(client: &reqwest::Client, token: &str, url: &str, body: serde_json::Value) -> Result<(), String> {
    let resp = client
        .post(url)
        .header("PRIVATE-TOKEN", token)
        .json(&body)
        .send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("GitLab {}", resp.status()));
    }
    Ok(())
}

fn gl_encode(owner: &str, repo: &str) -> String {
    format!("{}/{}", owner, repo).replace('/', "%2F")
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn open_forge_window(app: tauri::AppHandle, repo_path: String) -> Result<(), String> {
    let label = "forge-panel";
    if let Some(win) = app.get_webview_window(label) {
        win.set_focus().ok();
        return Ok(());
    }
    let encoded = repo_path.chars().flat_map(|c| {
        if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '/') {
            vec![c]
        } else {
            format!("%{:02X}", c as u32).chars().collect()
        }
    }).collect::<String>();
    tauri::WebviewWindowBuilder::new(
        &app,
        label,
        tauri::WebviewUrl::App(
            std::path::PathBuf::from(format!("index.html?view=forge&repoPath={}", encoded)),
        ),
    )
    .title("Forge — GitHub / GitLab")
    .inner_size(900.0, 700.0)
    .center()
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn detect_forge(repo_path: String) -> Result<ForgeInfo, String> {
    let remote_url = get_remote_url(&repo_path)
        .ok_or_else(|| "No remote 'origin' found".to_string())?;
    let (platform, base_url, owner, repo) = parse_remote_url(&remote_url);
    if matches!(platform, ForgePlatform::Unknown) {
        return Ok(ForgeInfo { platform, owner: String::new(), repo: String::new(), base_url: String::new(), has_token: false });
    }
    let has_token = get_token(&platform, &base_url).is_some();
    Ok(ForgeInfo { platform, owner, repo, base_url, has_token })
}

#[tauri::command]
pub async fn save_forge_token(platform: String, token: String) -> Result<(), String> {
    let path = app_token_path().ok_or("No config dir")?;
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let mut tokens: serde_json::Value = if path.exists() {
        serde_json::from_str(&std::fs::read_to_string(&path).unwrap_or_default())
            .unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    tokens[platform] = serde_json::Value::String(token);
    std::fs::write(&path, serde_json::to_string_pretty(&tokens).unwrap()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_pull_requests(repo_path: String) -> Result<Vec<PullRequest>, String> {
    let remote_url = get_remote_url(&repo_path).ok_or("No remote")?;
    let (platform, base_url, owner, repo) = parse_remote_url(&remote_url);
    let token = get_token(&platform, &base_url);
    let client = make_client();

    match platform {
        ForgePlatform::GitHub => {
            let url = format!("https://api.github.com/repos/{}/{}/pulls?state=open&per_page=30", owner, repo);
            let data = gh_get(&client, &token, &url).await?;
            Ok(data.as_array().ok_or("Expected array")?
                .iter()
                .map(|pr| PullRequest {
                    number: pr["number"].as_u64().unwrap_or(0),
                    title: pr["title"].as_str().unwrap_or("").to_string(),
                    state: pr["state"].as_str().unwrap_or("open").to_string(),
                    url: pr["html_url"].as_str().unwrap_or("").to_string(),
                    author: pr["user"]["login"].as_str().unwrap_or("").to_string(),
                    created_at: pr["created_at"].as_str().unwrap_or("").to_string(),
                    source_branch: pr["head"]["ref"].as_str().unwrap_or("").to_string(),
                    target_branch: pr["base"]["ref"].as_str().unwrap_or("").to_string(),
                    draft: pr["draft"].as_bool().unwrap_or(false),
                    body: pr["body"].as_str().map(|s| s.to_string()),
                })
                .collect())
        }
        ForgePlatform::GitLab => {
            let url = format!("{}/api/v4/projects/{}/merge_requests?state=opened&per_page=30", base_url, gl_encode(&owner, &repo));
            let data = gl_get(&client, &token, &url).await?;
            Ok(data.as_array().ok_or("Expected array")?
                .iter()
                .map(|mr| PullRequest {
                    number: mr["iid"].as_u64().unwrap_or(0),
                    title: mr["title"].as_str().unwrap_or("").to_string(),
                    state: match mr["state"].as_str().unwrap_or("opened") {
                        "opened" => "open", "merged" => "merged", s => s,
                    }.to_string(),
                    url: mr["web_url"].as_str().unwrap_or("").to_string(),
                    author: mr["author"]["username"].as_str().unwrap_or("").to_string(),
                    created_at: mr["created_at"].as_str().unwrap_or("").to_string(),
                    source_branch: mr["source_branch"].as_str().unwrap_or("").to_string(),
                    target_branch: mr["target_branch"].as_str().unwrap_or("").to_string(),
                    draft: mr["draft"].as_bool().unwrap_or(false),
                    body: mr["description"].as_str().map(|s| s.to_string()),
                })
                .collect())
        }
        ForgePlatform::Unknown => Err("Unknown platform".to_string()),
    }
}

#[tauri::command]
pub async fn get_pipelines(repo_path: String) -> Result<Vec<Pipeline>, String> {
    let remote_url = get_remote_url(&repo_path).ok_or("No remote")?;
    let (platform, base_url, owner, repo) = parse_remote_url(&remote_url);
    let token = get_token(&platform, &base_url);
    let client = make_client();

    match platform {
        ForgePlatform::GitHub => {
            let url = format!("https://api.github.com/repos/{}/{}/actions/runs?per_page=20", owner, repo);
            let data = gh_get(&client, &token, &url).await?;
            Ok(data["workflow_runs"].as_array().ok_or("Expected array")?
                .iter()
                .map(|r| {
                    let status = match (r["status"].as_str().unwrap_or(""), r["conclusion"].as_str().unwrap_or("")) {
                        ("completed", "success") => "success",
                        ("completed", "failure") => "failure",
                        ("completed", "cancelled") => "cancelled",
                        ("completed", "skipped") => "skipped",
                        ("in_progress", _) => "running",
                        _ => "pending",
                    };
                    Pipeline {
                        id: r["id"].as_u64().unwrap_or(0),
                        name: r["name"].as_str().unwrap_or("").to_string(),
                        status: status.to_string(),
                        branch: r["head_branch"].as_str().unwrap_or("").to_string(),
                        url: r["html_url"].as_str().unwrap_or("").to_string(),
                        created_at: r["created_at"].as_str().unwrap_or("").to_string(),
                    }
                })
                .collect())
        }
        ForgePlatform::GitLab => {
            let url = format!("{}/api/v4/projects/{}/pipelines?per_page=20", base_url, gl_encode(&owner, &repo));
            let data = gl_get(&client, &token, &url).await?;
            Ok(data.as_array().ok_or("Expected array")?
                .iter()
                .map(|p| Pipeline {
                    id: p["id"].as_u64().unwrap_or(0),
                    name: format!("Pipeline #{}", p["id"].as_u64().unwrap_or(0)),
                    status: p["status"].as_str().unwrap_or("unknown").to_string(),
                    branch: p["ref"].as_str().unwrap_or("").to_string(),
                    url: p["web_url"].as_str().unwrap_or("").to_string(),
                    created_at: p["created_at"].as_str().unwrap_or("").to_string(),
                })
                .collect())
        }
        ForgePlatform::Unknown => Err("Unknown platform".to_string()),
    }
}

#[tauri::command]
pub async fn get_pr_comments(repo_path: String, pr_number: u64) -> Result<Vec<PrComment>, String> {
    let remote_url = get_remote_url(&repo_path).ok_or("No remote")?;
    let (platform, base_url, owner, repo) = parse_remote_url(&remote_url);
    let token = get_token(&platform, &base_url);
    let client = make_client();

    match platform {
        ForgePlatform::GitHub => {
            let url = format!("https://api.github.com/repos/{}/{}/issues/{}/comments?per_page=50", owner, repo, pr_number);
            let data = gh_get(&client, &token, &url).await?;
            Ok(data.as_array().ok_or("Expected array")?
                .iter()
                .map(|c| PrComment {
                    id: c["id"].as_u64().unwrap_or(0),
                    author: c["user"]["login"].as_str().unwrap_or("").to_string(),
                    body: c["body"].as_str().unwrap_or("").to_string(),
                    created_at: c["created_at"].as_str().unwrap_or("").to_string(),
                    url: c["html_url"].as_str().unwrap_or("").to_string(),
                })
                .collect())
        }
        ForgePlatform::GitLab => {
            let url = format!("{}/api/v4/projects/{}/merge_requests/{}/notes?per_page=50", base_url, gl_encode(&owner, &repo), pr_number);
            let data = gl_get(&client, &token, &url).await?;
            Ok(data.as_array().ok_or("Expected array")?
                .iter()
                .filter(|n| !n["system"].as_bool().unwrap_or(false))
                .map(|n| PrComment {
                    id: n["id"].as_u64().unwrap_or(0),
                    author: n["author"]["username"].as_str().unwrap_or("").to_string(),
                    body: n["body"].as_str().unwrap_or("").to_string(),
                    created_at: n["created_at"].as_str().unwrap_or("").to_string(),
                    url: String::new(),
                })
                .collect())
        }
        ForgePlatform::Unknown => Err("Unknown platform".to_string()),
    }
}

#[tauri::command]
pub async fn post_pr_comment(repo_path: String, pr_number: u64, body: String) -> Result<(), String> {
    let remote_url = get_remote_url(&repo_path).ok_or("No remote")?;
    let (platform, base_url, owner, repo) = parse_remote_url(&remote_url);
    let token = get_token(&platform, &base_url).ok_or("No token — set one in Settings > Integrations")?;
    let client = make_client();

    match platform {
        ForgePlatform::GitHub => {
            let url = format!("https://api.github.com/repos/{}/{}/issues/{}/comments", owner, repo, pr_number);
            gh_post(&client, &token, &url, serde_json::json!({ "body": body })).await
        }
        ForgePlatform::GitLab => {
            let url = format!("{}/api/v4/projects/{}/merge_requests/{}/notes", base_url, gl_encode(&owner, &repo), pr_number);
            gl_post(&client, &token, &url, serde_json::json!({ "body": body })).await
        }
        ForgePlatform::Unknown => Err("Unknown platform".to_string()),
    }
}

#[tauri::command]
pub async fn trigger_pipeline(repo_path: String, ref_name: String) -> Result<(), String> {
    let remote_url = get_remote_url(&repo_path).ok_or("No remote")?;
    let (platform, base_url, owner, repo) = parse_remote_url(&remote_url);
    let token = get_token(&platform, &base_url).ok_or("No token — set one in Settings > Integrations")?;
    let client = make_client();

    match platform {
        ForgePlatform::GitLab => {
            let url = format!("{}/api/v4/projects/{}/pipeline", base_url, gl_encode(&owner, &repo));
            gl_post(&client, &token, &url, serde_json::json!({ "ref": ref_name })).await
        }
        ForgePlatform::GitHub => {
            // Re-run the latest workflow run on this branch
            let url = format!("https://api.github.com/repos/{}/{}/actions/runs?branch={}&per_page=1", owner, repo, ref_name);
            let data = gh_get(&client, &Some(token.clone()), &url).await?;
            let run_id = data["workflow_runs"]
                .as_array()
                .and_then(|a| a.first())
                .and_then(|r| r["id"].as_u64())
                .ok_or("No workflow runs found for this branch")?;
            let rerun_url = format!("https://api.github.com/repos/{}/{}/actions/runs/{}/rerun", owner, repo, run_id);
            let resp = client.post(&rerun_url)
                .bearer_auth(&token)
                .header("Accept", "application/vnd.github+json")
                .header("X-GitHub-Api-Version", "2022-11-28")
                .header("Content-Length", "0")
                .send().await.map_err(|e| e.to_string())?;
            if !resp.status().is_success() {
                return Err(format!("GitHub {}", resp.status()));
            }
            Ok(())
        }
        ForgePlatform::Unknown => Err("Unknown platform".to_string()),
    }
}

fn gh_job_status(status: &str, conclusion: &str) -> String {
    match (status, conclusion) {
        ("completed", "success") => "success".to_string(),
        ("completed", "failure") => "failure".to_string(),
        ("completed", "cancelled") => "cancelled".to_string(),
        ("completed", "skipped") => "skipped".to_string(),
        ("completed", c) if !c.is_empty() => c.to_string(),
        ("in_progress", _) => "running".to_string(),
        _ => "pending".to_string(),
    }
}

#[tauri::command]
pub async fn get_pipeline_jobs(repo_path: String, pipeline_id: u64) -> Result<Vec<PipelineJob>, String> {
    let remote_url = get_remote_url(&repo_path).ok_or("No remote")?;
    let (platform, base_url, owner, repo) = parse_remote_url(&remote_url);
    let token = get_token(&platform, &base_url);
    let client = make_client();

    match platform {
        ForgePlatform::GitHub => {
            let url = format!("https://api.github.com/repos/{}/{}/actions/runs/{}/jobs?per_page=100", owner, repo, pipeline_id);
            let data = gh_get(&client, &token, &url).await?;
            Ok(data["jobs"].as_array().ok_or("Expected array")?
                .iter()
                .map(|j| {
                    let status = gh_job_status(
                        j["status"].as_str().unwrap_or(""),
                        j["conclusion"].as_str().unwrap_or(""),
                    );
                    PipelineJob {
                        id: j["id"].as_u64().unwrap_or(0),
                        name: j["name"].as_str().unwrap_or("").to_string(),
                        status,
                        stage: None,
                        url: j["html_url"].as_str().map(|s| s.to_string()),
                        started_at: j["started_at"].as_str().map(|s| s.to_string()),
                        finished_at: j["completed_at"].as_str().map(|s| s.to_string()),
                        duration_seconds: None,
                    }
                })
                .collect())
        }
        ForgePlatform::GitLab => {
            let url = format!("{}/api/v4/projects/{}/pipelines/{}/jobs?per_page=100", base_url, gl_encode(&owner, &repo), pipeline_id);
            let data = gl_get(&client, &token, &url).await?;
            Ok(data.as_array().ok_or("Expected array")?
                .iter()
                .map(|j| PipelineJob {
                    id: j["id"].as_u64().unwrap_or(0),
                    name: j["name"].as_str().unwrap_or("").to_string(),
                    status: j["status"].as_str().unwrap_or("unknown").to_string(),
                    stage: j["stage"].as_str().map(|s| s.to_string()),
                    url: j["web_url"].as_str().map(|s| s.to_string()),
                    started_at: j["started_at"].as_str().map(|s| s.to_string()),
                    finished_at: j["finished_at"].as_str().map(|s| s.to_string()),
                    duration_seconds: j["duration"].as_f64(),
                })
                .collect())
        }
        ForgePlatform::Unknown => Err("Unknown platform".to_string()),
    }
}

#[tauri::command]
pub async fn retry_pipeline_job(repo_path: String, job_id: u64) -> Result<(), String> {
    let remote_url = get_remote_url(&repo_path).ok_or("No remote")?;
    let (platform, base_url, owner, repo) = parse_remote_url(&remote_url);
    let token = get_token(&platform, &base_url).ok_or("No token")?;
    let client = make_client();

    match platform {
        ForgePlatform::GitHub => {
            let url = format!("https://api.github.com/repos/{}/{}/actions/jobs/{}/rerun", owner, repo, job_id);
            let resp = client.post(&url)
                .bearer_auth(&token)
                .header("Accept", "application/vnd.github+json")
                .header("X-GitHub-Api-Version", "2022-11-28")
                .header("Content-Length", "0")
                .send().await.map_err(|e| e.to_string())?;
            if !resp.status().is_success() {
                return Err(format!("GitHub {}", resp.status()));
            }
            Ok(())
        }
        ForgePlatform::GitLab => {
            let url = format!("{}/api/v4/projects/{}/jobs/{}/retry", base_url, gl_encode(&owner, &repo), job_id);
            gl_post(&client, &token, &url, serde_json::json!({})).await
        }
        ForgePlatform::Unknown => Err("Unknown platform".to_string()),
    }
}
