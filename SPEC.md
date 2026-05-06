# git_rust — Product Spec

## Overview

Desktop git GUI client built with Tauri 2 (Rust backend + React frontend).
Target: replace GitKraken/SourceTree for daily git workflows.
Stack: Tauri 2 + React + TypeScript + Tailwind + shadcn/ui + git2 + tokio.

---

## Architecture

### Data Flow
```
User Action (React UI)
  → invoke() via Tauri IPC
    → Rust command handler
      → git2 operation
        → Result<T, String>
          → React state update
            → UI re-render
```

### Tauri Commands Pattern
```rust
#[tauri::command]
async fn command_name(args: Type) -> Result<ReturnType, String>
```
All git errors mapped to `String` and shown in UI as toast notifications.

### State Management (React)
- Global app state via `zustand` store
- Repo state: current repo path, active branch, HEAD commit
- UI state: selected commit, selected file, active panel
- No Redux — zustand is simpler and sufficient

---

## Layout

### Top Level (3-column)
```
┌─────────────────────────────────────────────────────────────┐
│                        TOP TOOLBAR                          │
├──────────┬──────────────────────────────┬───────────────────┤
│          │                              │                   │
│ SIDEBAR  │      COMMIT GRAPH            │   DETAIL PANEL    │
│  240px   │       flex-grow              │      320px        │
│          │                              │                   │
│          │                              │                   │
└──────────┴──────────────────────────────┴───────────────────┘
```

### Top Toolbar
```
[RepoTabs]  |  [Undo] [Redo]  |  [Fetch] [Pull▼] [Push]  |  [Branch+] [Stash] [PopStash]
```
- Repo tabs: open multiple repos, click to switch
- Pull dropdown: pull (merge) vs pull (rebase)
- All buttons trigger Tauri commands
- Spinner on button during async op

### Left Sidebar (240px fixed)
```
┌─────────────────────────┐
│ 🔍 Search branches...   │
├─────────────────────────┤
│ ▼ LOCAL                 │
│   ├─ main (current) ●   │
│   ├─ feature/auth        │
│   └─ fix/login-bug       │
├─────────────────────────┤
│ ▼ REMOTE (origin)       │
│   ├─ main               │
│   └─ feature/auth        │
├─────────────────────────┤
│ ▼ TAGS                  │
│   ├─ v1.0.0             │
│   └─ v0.9.0             │
├─────────────────────────┤
│ ▼ STASHES               │
│   └─ stash@{0}: WIP...  │
└─────────────────────────┘
```
- Collapsible sections (shadcn Collapsible)
- Current branch highlighted + bullet indicator
- Right-click context menu on each item
- Double-click branch → checkout

### Center — Commit Graph
```
┌──────────────────────────────────────────────────┐
│ [Search commits...]                    [Filter▼] │
├──────────────────────────────────────────────────┤
│ ●─────────── Merge PR #178  John  2h ago  [main] │
│ │ ●─────── Add auth tokens  Jane  3h ago          │
│ │ │ ●─── Fix login redirect  John  5h ago         │
│ │ ●─────── Update deps       Jane  1d ago          │
│ ●─────────── Release v1.2.0  John  2d ago  [v1.2] │
└──────────────────────────────────────────────────┘
```
- SVG rendered branch lines (color per branch, max 8 colors cycling)
- Each row = one commit
- Columns: graph | message | author avatar+name | time | labels
- Click row → load commit detail in right panel
- Virtualized list (only render visible rows) for perf
- Labels: branch badges (shadcn Badge), tag badges different color

### Right — Detail Panel (320px fixed)
Two modes depending on selection:

**Mode A: Commit selected**
```
┌──────────────────────────┐
│ Commit abc1234           │
│ "Fix login redirect bug" │
│ John Doe · 5 hours ago   │
│ main ← feature/auth      │
├──────────────────────────┤
│ CHANGED FILES (3)        │
│  M  src/auth/login.rs    │
│  M  src/routes.rs        │
│  A  tests/auth_test.rs   │
├──────────────────────────┤
│ [Click file → diff below]│
│                          │
│ @@ -10,6 +10,8 @@        │
│ - old line               │
│ + new line               │
└──────────────────────────┘
```

**Mode B: Working tree (no commit selected)**
```
┌──────────────────────────┐
│ STAGED (2)               │
│  ✓ src/auth/login.rs     │
│  ✓ src/routes.rs         │
├──────────────────────────┤
│ UNSTAGED (1)             │
│  ~ README.md             │
├──────────────────────────┤
│ UNTRACKED (1)            │
│  ? temp.txt              │
├──────────────────────────┤
│ Commit message:          │
│ ┌────────────────────┐   │
│ │                    │   │
│ └────────────────────┘   │
│ [Commit to main]         │
└──────────────────────────┘
```

---

## Feature Specs

### Repository Management

**Open Repo**
- File picker dialog (Tauri dialog API)
- Validate it's a git repo (check `.git` dir via git2)
- Add to recent repos list (stored in app config JSON)
- Open in new tab

**Clone Repo**
- Dialog: URL input + destination folder picker
- Progress bar via Tauri event stream (git2 RemoteCallbacks)
- Open cloned repo on complete

**Init Repo**
- Folder picker → `git init`
- Option: add initial commit (README)

**Recent Repos**
- Stored in `~/.config/git_rust/config.json`
- Show on empty state / welcome screen
- Remove from list if path no longer exists

---

### Commit Graph

**Data**
- Rust: `git2::Repository::revwalk()` → walk all refs
- Return: `Vec<CommitInfo>` (hash, message, author, time, parent hashes, branch refs)
- Pagination: load 200 at a time, load more on scroll

**Graph Layout Algorithm**
- Assign each branch a column index
- Draw SVG lines between parent-child commits
- Merge commits: line converges, branch commits: line diverges
- Max columns before color reuse: 8

**Performance**
- Virtual list: only render commits in viewport
- Graph SVG columns pre-computed in Rust, returned with commit data
- Debounce search/filter 300ms

---

### File Status & Staging

**Data**
- Rust: `git2::Repository::statuses()` → list of `StatusEntry`
- Map to: `{ path, status: Staged | Unstaged | Untracked | Conflicted }`

**Stage/Unstage**
- Click checkbox on file → invoke stage/unstage command
- Stage all button → stage all unstaged
- Unstage all button

**Discard Changes**
- Right-click file → "Discard changes"
- Confirmation dialog (shadcn AlertDialog) — destructive action

---

### Diff View

**Data**
- Rust: `git2::Diff` → parse hunks → `Vec<DiffLine>`
- Each line: `{ content, line_type: Add | Remove | Context, old_lineno, new_lineno }`

**Rendering**
- Unified diff (default)
- Side-by-side toggle (later)
- Syntax highlight: `highlight.js` or `shiki` on frontend
- Green background = added, red = removed, gray = context

---

### Commits

**Create Commit**
- Textarea for message (required, validated)
- Shows staged files count
- `[Commit to {branch}]` button
- Rust: `git2::Repository::commit()`

**Amend**
- Right-click last commit → "Amend"
- Pre-fill message with last commit message
- Warning if already pushed

---

### Branches

**Checkout**
- Double-click branch in sidebar OR right-click → checkout
- If dirty working tree: dialog asking stash/discard/cancel

**Create**
- Toolbar button OR right-click commit/branch → "Create branch here"
- Dialog: name input + base (current HEAD or selected commit)
- Option: checkout immediately after create

**Merge**
- Right-click branch → "Merge into current branch"
- Confirmation dialog showing what will merge
- On conflict: show conflict UI in detail panel

**Rebase**
- Right-click branch → "Rebase current onto this"
- Warning dialog
- On conflict: show conflict UI

---

### Remote Operations

**Fetch**
- Toolbar button
- Fetch all remotes
- Progress shown in toolbar spinner + status text

**Pull**
- Dropdown: merge or rebase strategy
- Auto-fetch then merge/rebase
- Conflict UI if needed

**Push**
- Push current branch to upstream
- If no upstream: dialog to set remote + branch name
- Force push: available via right-click → "Force push" with warning dialog

---

### Stash

**Create Stash**
- Toolbar button OR right-click working tree
- Optional message input
- `git stash push -m "message"`

**Apply / Pop / Drop**
- Right-click stash in sidebar
- Apply: apply without removing
- Pop: apply and remove
- Drop: remove without applying (confirmation dialog)

---

### Tags

**Create**
- Right-click commit → "Create tag here"
- Dialog: name + optional message (annotated vs lightweight)

**Delete**
- Right-click tag in sidebar → delete
- Confirmation dialog

---

### Conflict Resolution

**Detection**
- After merge/rebase, check for CONFLICTED status files
- Banner in detail panel: "X files have conflicts"

**UI**
- Click conflicted file → show conflict markers in diff view
- Highlight `<<<<<<<`, `=======`, `>>>>>>>` sections
- Buttons: "Use ours" / "Use theirs" / "Open in editor"
- After resolving all: "Mark as resolved" → stage file

---

### Context Menus (Right-click)

**On branch (sidebar):**
- Checkout
- Create branch from here
- Rename
- Delete
- Merge into current
- Rebase current onto this
- Push / Set upstream
- Copy name

**On commit (graph):**
- Create branch here
- Create tag here
- Cherry-pick
- Revert commit
- Reset to here (soft/mixed/hard — hard shows warning)
- Copy hash

**On file (detail panel):**
- Open in default editor
- Copy path
- Discard changes (unstaged only)
- Ignore file (add to .gitignore)

---

### Settings

Stored in `~/.config/git_rust/config.json`

- **Identity:** name, email (override per repo)
- **SSH:** path to SSH key, passphrase (stored in OS keychain)
- **GPG:** signing key, auto-sign commits toggle
- **Editor:** default editor command for conflict resolution
- **Theme:** dark (default) / light
- **Font size:** 12–18px

---

## Error Handling

- All Rust errors return `Err(String)` with human-readable message
- Frontend shows errors as toast notifications (shadcn Sonner)
- Destructive operations always show confirmation dialog before executing
- Network errors (push/pull/fetch) show retry option

---

## Performance Targets

- Open repo + show graph: < 500ms for repos up to 10k commits
- Stage/unstage file: < 100ms
- Diff render: < 200ms for files up to 1000 lines
- Branch switch: < 300ms

---

## File Structure

```
git_rust/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   ├── commands/
│   │   │   ├── mod.rs
│   │   │   ├── repo.rs       # open, init, clone, recent
│   │   │   ├── status.rs     # file status, stage, unstage
│   │   │   ├── log.rs        # commit history, graph layout
│   │   │   ├── diff.rs       # file diffs
│   │   │   ├── commit.rs     # create commit, amend
│   │   │   ├── branch.rs     # list, create, delete, checkout, merge, rebase
│   │   │   ├── remote.rs     # fetch, pull, push
│   │   │   ├── stash.rs      # stash ops
│   │   │   └── tag.rs        # tag ops
│   │   └── git/
│   │       ├── mod.rs
│   │       ├── graph.rs      # commit graph layout algorithm
│   │       └── types.rs      # shared types (CommitInfo, FileStatus, etc.)
│   └── Cargo.toml
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── TopToolbar.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── CommitGraph.tsx
│   │   │   └── DetailPanel.tsx
│   │   ├── sidebar/
│   │   │   ├── BranchList.tsx
│   │   │   ├── RemoteList.tsx
│   │   │   ├── TagList.tsx
│   │   │   └── StashList.tsx
│   │   ├── graph/
│   │   │   ├── CommitRow.tsx
│   │   │   ├── GraphLines.tsx    # SVG branch lines
│   │   │   └── CommitLabel.tsx   # branch/tag badges
│   │   ├── detail/
│   │   │   ├── CommitDetail.tsx
│   │   │   ├── WorkingTree.tsx
│   │   │   ├── DiffViewer.tsx
│   │   │   └── CommitForm.tsx
│   │   └── dialogs/
│   │       ├── CloneDialog.tsx
│   │       ├── BranchDialog.tsx
│   │       ├── CommitDialog.tsx
│   │       └── ConfirmDialog.tsx
│   ├── hooks/
│   │   ├── useRepo.ts         # repo state + tauri invokes
│   │   ├── useCommits.ts      # commit graph data
│   │   ├── useStatus.ts       # working tree status
│   │   └── useBranches.ts     # branch list
│   ├── store/
│   │   └── appStore.ts        # zustand global state
│   ├── lib/
│   │   └── tauri.ts           # typed invoke wrappers
│   ├── App.tsx
│   └── main.tsx
├── SPEC.md
├── TODOS.md
├── layout.png
├── package.json
└── index.html
```
