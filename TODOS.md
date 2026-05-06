# git_rust — Feature TODOs

## Project Setup
- [x] Scaffold Tauri 2 + React + TypeScript
- [x] Add Tailwind CSS
- [ ] Add shadcn/ui components (Radix installed, need shadcn CLI init)
- [x] Add git2 + tokio to Cargo.toml
- [x] Basic app layout (sidebar / graph / detail)

---

## UI Layout
- [x] Top toolbar (actions bar)
- [x] Left sidebar (repo/branch nav)
- [x] Center commit graph panel
- [x] Right detail panel
- [x] Repo tabs (multiple repos open)

---

## Repository
- [x] Open existing repo
- [x] Init new repo
- [ ] Clone repo (URL + destination)
- [x] Recent repos list
- [x] Multiple repos (tabs)

---

## Commit Graph
- [x] Fetch commit history (git2)
- [x] Render branch lines (SVG)
- [ ] Commit nodes with author avatar
- [x] Branch/tag labels on commits
- [x] Click commit → show detail
- [ ] Search/filter commits

---

## File Status (Working Tree)
- [x] Show staged files
- [x] Show unstaged files
- [x] Show untracked files
- [x] Stage file
- [x] Unstage file
- [x] Discard changes (file)
- [x] Stage all / unstage all

---

## Diff View
- [x] Show file diff (unstaged)
- [x] Show file diff (staged)
- [x] Show file diff for commit
- [ ] Syntax highlight in diff
- [ ] Side-by-side vs unified toggle

---

## Commits
- [x] Commit (message + staged files)
- [x] Amend last commit
- [ ] Commit with co-author
- [ ] Sign commit (GPG)

---

## Branches
- [x] List local branches
- [x] List remote branches
- [x] Create branch
- [x] Switch branch (checkout)
- [x] Rename branch
- [x] Delete branch (local)
- [ ] Delete branch (remote)
- [ ] Set upstream

---

## Merge / Rebase
- [x] Merge branch into current
- [ ] Rebase current onto branch
- [ ] Abort merge/rebase
- [ ] Conflict resolution UI

---

## Remote Operations
- [ ] Add remote
- [ ] Remove remote
- [x] Fetch
- [x] Pull (merge)
- [ ] Pull (rebase)
- [x] Push
- [ ] Force push (with warning dialog)

---

## Stash
- [x] Stash changes
- [x] List stashes
- [x] Apply stash
- [x] Pop stash
- [x] Drop stash

---

## Tags
- [x] List tags
- [x] Create tag (lightweight)
- [x] Create tag (annotated)
- [x] Delete tag
- [ ] Push tag to remote

---

## Sidebar
- [x] Local branches tree (collapsible)
- [x] Remote branches tree (collapsible)
- [x] Tags list (collapsible)
- [x] Stashes list (collapsible)
- [ ] Right-click context menus

---

## Top Toolbar
- [ ] Undo last action
- [ ] Redo
- [x] Fetch button
- [x] Pull button
- [x] Push button
- [ ] Branch create dialog (button exists, dialog missing)
- [x] Stash button
- [ ] Pop stash button

---

## UX / Polish
- [ ] Right-click context menus (branch, commit, file)
- [ ] Clone repo dialog
- [ ] Create branch dialog
- [ ] Confirm dialogs for destructive ops (discard, delete branch, force push)
- [ ] Author avatars in commit graph (gravatar)
- [ ] Syntax highlighting in diff (shiki/highlight.js)
- [ ] Search/filter commits
- [ ] Keyboard shortcuts
- [ ] Error state UI (not just toasts)

---

## Settings
- [ ] User name / email config
- [ ] SSH key management
- [ ] GPG key config
- [ ] Theme (dark/light)
- [ ] Font size

---

## Nice to Have (Later)
- [ ] GitHub/GitLab/Gitea integration (PRs, issues)
- [ ] Interactive rebase UI
- [ ] Blame view
- [ ] File history
- [ ] Cherry-pick commit
- [ ] Submodule support
- [ ] LFS support
