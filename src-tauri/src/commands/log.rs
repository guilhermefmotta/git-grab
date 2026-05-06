use crate::git::{
    graph::compute_graph_columns,
    types::{CommitInfo, RefInfo, RefType},
};
use git2::{Repository, Sort};

#[tauri::command]
pub async fn get_commits(
    repo_path: String,
    limit: Option<usize>,
    offset: Option<usize>,
    branch: Option<String>,
) -> Result<Vec<CommitInfo>, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let limit = limit.unwrap_or(200);
    let offset = offset.unwrap_or(0);

    // Build ref map: hash → Vec<RefInfo>
    let mut ref_map: std::collections::HashMap<String, Vec<RefInfo>> =
        std::collections::HashMap::new();

    let head_hash = repo
        .head()
        .ok()
        .and_then(|h| h.target().map(|oid| oid.to_string()));

    repo.references()
        .map_err(|e| e.message().to_string())?
        .filter_map(|r| r.ok())
        .for_each(|r| {
            let Some(target) = r.target() else { return };
            let hash = target.to_string();
            let Some(name) = r.shorthand() else { return };

            let is_remote = r.is_remote();
            let is_tag = r.is_tag();
            let ref_type = if is_tag {
                RefType::Tag
            } else if is_remote {
                RefType::RemoteBranch
            } else {
                RefType::Branch
            };

            let is_head = head_hash.as_deref() == Some(&hash)
                && !is_remote
                && !is_tag;

            ref_map.entry(hash).or_default().push(RefInfo {
                name: name.to_string(),
                ref_type,
                is_head,
            });
        });

    let mut walk = repo.revwalk().map_err(|e| e.message().to_string())?;
    if let Some(ref branch_ref) = branch {
        let obj = repo
            .revparse_single(branch_ref)
            .map_err(|e| e.message().to_string())?;
        walk.push(obj.id()).map_err(|e| e.message().to_string())?;
    } else {
        walk.push_glob("*").map_err(|e| e.message().to_string())?;
    }
    walk.set_sorting(Sort::TIME | Sort::TOPOLOGICAL)
        .map_err(|e| e.message().to_string())?;

    let mut commits: Vec<CommitInfo> = walk
        .skip(offset)
        .take(limit)
        .filter_map(|oid| oid.ok())
        .filter_map(|oid| repo.find_commit(oid).ok())
        .map(|c| {
            let hash = c.id().to_string();
            let short_hash = hash[..7].to_string();
            let message = c
                .summary()
                .unwrap_or("")
                .to_string();
            let author = c.author();
            let refs = ref_map.remove(&hash).unwrap_or_default();
            let parent_hashes = (0..c.parent_count())
                .filter_map(|i| c.parent_id(i).ok().map(|id| id.to_string()))
                .collect();

            CommitInfo {
                hash,
                short_hash,
                message,
                author_name: author.name().unwrap_or("").to_string(),
                author_email: author.email().unwrap_or("").to_string(),
                timestamp: c.time().seconds(),
                parent_hashes,
                refs,
                graph_columns: Vec::new(),
            }
        })
        .collect();

    compute_graph_columns(&mut commits);

    Ok(commits)
}
