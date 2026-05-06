mod commands;
mod git;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::repo::open_repo,
            commands::repo::init_repo,
            commands::repo::clone_repo,
            commands::repo::get_recent_repos,
            commands::repo::add_recent_repo,
            commands::repo::remove_recent_repo,
            commands::repo::get_file_content,
            commands::repo::write_file_content,
            commands::repo::open_commit_window,
            commands::repo::open_file_diff_window,
            commands::repo::open_conflict_window,
            commands::status::get_status,
            commands::status::stage_file,
            commands::status::unstage_file,
            commands::status::stage_all,
            commands::status::unstage_all,
            commands::status::discard_changes,
            commands::status::ignore_file,
            commands::log::get_commits,
            commands::diff::get_diff,
            commands::commit::create_commit,
            commands::commit::amend_commit,
            commands::commit::undo_last_commit,
            commands::commit::cherry_pick,
            commands::commit::revert_commit,
            commands::commit::reset_to_commit,
            commands::branch::get_branches,
            commands::branch::create_branch,
            commands::branch::checkout_branch,
            commands::branch::delete_branch,
            commands::branch::rename_branch,
            commands::branch::merge_branch,
            commands::branch::rebase_branch,
            commands::remote::fetch_all,
            commands::remote::pull,
            commands::remote::push,
            commands::remote::get_remotes,
            commands::stash::get_stashes,
            commands::stash::create_stash,
            commands::stash::apply_stash,
            commands::stash::pop_stash,
            commands::stash::drop_stash,
            commands::tag::get_tags,
            commands::tag::create_tag,
            commands::tag::delete_tag,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
