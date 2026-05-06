# 🦀 Git Crab

A fast, native Git GUI client built with Tauri, Rust, and React.

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![Tauri](https://img.shields.io/badge/Tauri-2-orange)
![Rust](https://img.shields.io/badge/Rust-git2-brown)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

### Commit Graph
- Visual branch graph with color-coded lanes
- Commit search by message, author, or hash
- Author avatars (initials-based, color-coded)
- Branch/tag/remote ref badges on commits
- Filter graph to a single remote branch
- **Double-click** any commit → opens a full-screen diff viewer in a new window

### Working Tree
- Staged / Unstaged / Untracked / Conflicted file sections
- One-click stage, unstage, discard per file
- Stage all / Unstage all
- **Double-click** any file → full-screen side-by-side diff in a new window
- Manual refresh button (no polling)
- Add files to `.gitignore` from context menu
- Open files in system editor

### Diff Viewer
- **Side-by-side layout** — deletions left, additions right
- Line numbers on both sides
- Hunk headers, color-coded backgrounds
- Shown inline (preview strip) or in a dedicated full-screen window

### Conflict Resolution
- Visual 3-way conflict editor — **Ours** (green) vs **Theirs** (blue)
- Per-conflict resolution: Accept Ours / Accept Theirs / Accept Both
- "Mark as Resolved & Stage" writes the result and stages the file
- Progress counter: resolved / total

### Branch Management
- Full local branch list with ahead/behind indicators
- Double-click to checkout
- Right-click context menu: checkout, rename, delete, create branch from here, merge into current, rebase current onto this, push to remote
- Remote branch list with per-section search
- Click remote branch → filters commit graph to that branch
- Switch to remote branch → creates local tracking branch + checks out

### Commit Operations
- Commit with message (Ctrl/Cmd+Enter shortcut)
- Amend last commit
- Undo last commit (soft reset to HEAD~1)
- Cherry-pick, revert, reset (soft / mixed / hard) from commit context menu

### Remote Operations
- Fetch all remotes
- Pull (merge or rebase)
- Push / Force push (with confirmation dialog)

### Stash
- View, apply, pop, drop stashes from sidebar
- Create stash with optional message (toolbar button)
- Pop stash (toolbar button)

### Tags
- Lightweight and annotated tags
- Create tag from any commit
- Delete tags from sidebar context menu

### Settings
- Dark / Light theme toggle
- Font size slider (12–18 px)
- Git identity override (name / email)
- Persisted to `localStorage`

### Keyboard Shortcuts
| Shortcut | Action |
|---|---|
| `⌘,` / `Ctrl,` | Open settings |
| `⌘F` / `CtrlF` | Focus commit search |
| `Escape` | Clear selection |
| `Ctrl+Enter` | Commit (in message field) |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | [Tauri 2](https://tauri.app) |
| Git backend | [git2](https://crates.io/crates/git2) (libgit2 bindings) |
| UI framework | React 18 + TypeScript |
| Styling | Tailwind CSS + Radix UI |
| State | Zustand |
| Virtual list | react-virtuoso |
| Notifications | sonner |

---

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) 18+
- Tauri prerequisites for your platform → [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)

### Development

```bash
# Install frontend dependencies
npm install

# Start dev server (hot-reload frontend + Rust recompile)
npm run tauri dev
```

### Build

```bash
npm run tauri build
```

Output binary is in `src-tauri/target/release/`.

---

## Architecture

```
src/                        # React frontend
├── components/
│   ├── layout/             # TopToolbar, Sidebar
│   ├── graph/              # CommitGraph, branch visualization
│   ├── detail/             # WorkingTree, DiffViewer, ConflictViewer
│   └── dialogs/            # Branch, Tag, Reset, Settings dialogs
├── hooks/                  # useCommits, useBranches, useStatus, useRepo
├── store/                  # Zustand global state (appStore)
├── lib/                    # tauri.ts (IPC), types.ts, utils.ts
├── App.tsx
├── CommitDiffWindow.tsx     # Standalone commit diff window
└── FileDiffWindow.tsx       # Standalone file diff window

src-tauri/src/              # Rust backend
├── commands/               # Tauri IPC commands
│   ├── repo.rs             # Open, init, clone, recent repos, windows
│   ├── log.rs              # Commit history with branch filter
│   ├── diff.rs             # Staged / unstaged / commit diffs
│   ├── status.rs           # Working tree status, stage, discard, ignore
│   ├── commit.rs           # Commit, amend, undo, cherry-pick, revert, reset
│   ├── branch.rs           # Branch CRUD, checkout, merge, rebase
│   ├── remote.rs           # Fetch, pull, push
│   ├── stash.rs            # Stash list, create, apply, pop, drop
│   └── tag.rs              # Tag list, create, delete
└── git/
    ├── graph.rs             # Branch graph column computation
    └── types.rs             # Shared data types
```

---

## Recent repos

Git Crab stores the list of recently opened repositories in:

| Platform | Path |
|---|---|
| Linux | `~/.config/git_crab/recent.json` |
| macOS | `~/Library/Application Support/git_crab/recent.json` |
| Windows | `%APPDATA%\git_crab\recent.json` |
