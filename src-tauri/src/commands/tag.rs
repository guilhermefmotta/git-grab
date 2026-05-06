use crate::git::types::TagInfo;
use git2::{Repository, Signature};

#[tauri::command]
pub async fn get_tags(repo_path: String) -> Result<Vec<TagInfo>, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let mut tags = Vec::new();

    repo.tag_foreach(|oid, name| {
        let name_str = std::str::from_utf8(name)
            .unwrap_or("")
            .trim_start_matches("refs/tags/")
            .to_string();

        let (is_annotated, message, timestamp) =
            if let Ok(tag) = repo.find_tag(oid) {
                (
                    true,
                    tag.message().map(|m| m.to_string()),
                    Some(tag.tagger().map(|t| t.when().seconds()).unwrap_or(0)),
                )
            } else {
                (false, None, None)
            };

        tags.push(TagInfo {
            name: name_str,
            hash: oid.to_string(),
            is_annotated,
            message,
            timestamp,
        });

        true
    })
    .map_err(|e| e.message().to_string())?;

    Ok(tags)
}

#[tauri::command]
pub async fn create_tag(
    repo_path: String,
    name: String,
    commit_hash: Option<String>,
    message: Option<String>,
) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;

    let commit = if let Some(hash) = commit_hash {
        let oid = git2::Oid::from_str(&hash).map_err(|e| e.message().to_string())?;
        repo.find_commit(oid).map_err(|e| e.message().to_string())?
    } else {
        repo.head()
            .map_err(|e| e.message().to_string())?
            .peel_to_commit()
            .map_err(|e| e.message().to_string())?
    };

    if let Some(msg) = message {
        let config = repo.config().map_err(|e| e.message().to_string())?;
        let tagger_name = config
            .get_string("user.name")
            .unwrap_or_else(|_| "Unknown".to_string());
        let tagger_email = config
            .get_string("user.email")
            .unwrap_or_else(|_| "unknown@example.com".to_string());
        let sig = Signature::now(&tagger_name, &tagger_email)
            .map_err(|e| e.message().to_string())?;
        repo.tag(&name, commit.as_object(), &sig, &msg, false)
            .map_err(|e| e.message().to_string())?;
    } else {
        repo.tag_lightweight(&name, commit.as_object(), false)
            .map_err(|e| e.message().to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn delete_tag(repo_path: String, name: String) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    repo.tag_delete(&name)
        .map_err(|e| e.message().to_string())
}
