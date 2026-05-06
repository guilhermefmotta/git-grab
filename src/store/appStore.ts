import { create } from "zustand";
import type {
  BranchInfo,
  CommitInfo,
  FileStatus,
  FileDiff,
  RepoInfo,
  StashInfo,
  TagInfo,
} from "@/lib/types";

export interface AppSettings {
  theme: "dark" | "light";
  fontSize: number;
  userName: string;
  userEmail: string;
}

const SETTINGS_KEY = "git_rust_settings";

function loadSettings(): AppSettings {
  try {
    return {
      theme: "dark",
      fontSize: 13,
      userName: "",
      userEmail: "",
      ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}"),
    };
  } catch {
    return { theme: "dark", fontSize: 13, userName: "", userEmail: "" };
  }
}

interface AppState {
  repos: RepoInfo[];
  activeRepoIndex: number;
  activeRepo: RepoInfo | null;

  commits: CommitInfo[];
  branches: BranchInfo[];
  status: FileStatus[];
  stashes: StashInfo[];
  tags: TagInfo[];

  selectedCommitHash: string | null;
  selectedFilePath: string | null;
  diff: FileDiff[];
  activeBranchFilter: string | null;

  loadingCommits: boolean;
  loadingStatus: boolean;
  loadingDiff: boolean;
  operationInProgress: boolean;

  settings: AppSettings;

  setRepos: (repos: RepoInfo[]) => void;
  addRepo: (repo: RepoInfo) => void;
  setActiveRepo: (repo: RepoInfo) => void;
  removeRepo: (path: string) => void;
  setActiveRepoIndex: (index: number) => void;
  setCommits: (commits: CommitInfo[]) => void;
  appendCommits: (commits: CommitInfo[]) => void;
  setBranches: (branches: BranchInfo[]) => void;
  setStatus: (status: FileStatus[]) => void;
  setStashes: (stashes: StashInfo[]) => void;
  setTags: (tags: TagInfo[]) => void;
  setSelectedCommitHash: (hash: string | null) => void;
  setSelectedFilePath: (path: string | null) => void;
  setDiff: (diff: FileDiff[]) => void;
  setActiveBranchFilter: (branch: string | null) => void;
  setLoadingCommits: (v: boolean) => void;
  setLoadingStatus: (v: boolean) => void;
  setLoadingDiff: (v: boolean) => void;
  setOperationInProgress: (v: boolean) => void;
  setSettings: (updates: Partial<AppSettings>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  repos: [],
  activeRepoIndex: 0,
  activeRepo: null,
  commits: [],
  branches: [],
  status: [],
  stashes: [],
  tags: [],
  selectedCommitHash: null,
  selectedFilePath: null,
  diff: [],
  activeBranchFilter: null,
  loadingCommits: false,
  loadingStatus: false,
  loadingDiff: false,
  operationInProgress: false,
  settings: loadSettings(),

  setRepos: (repos) => set({ repos }),
  setActiveRepo: (repo) =>
    set((state) => ({
      activeRepo: repo,
      repos: state.repos.map((r) => (r.path === repo.path ? repo : r)),
    })),
  addRepo: (repo) =>
    set((state) => {
      const exists = state.repos.findIndex((r) => r.path === repo.path);
      if (exists >= 0) {
        return { activeRepoIndex: exists, activeRepo: state.repos[exists] };
      }
      const repos = [...state.repos, repo];
      return { repos, activeRepoIndex: repos.length - 1, activeRepo: repo };
    }),
  removeRepo: (path) =>
    set((state) => {
      const repos = state.repos.filter((r) => r.path !== path);
      const activeRepoIndex = Math.min(state.activeRepoIndex, repos.length - 1);
      return { repos, activeRepoIndex, activeRepo: repos[activeRepoIndex] ?? null };
    }),
  setActiveRepoIndex: (index) =>
    set((state) => ({
      activeRepoIndex: index,
      activeRepo: state.repos[index] ?? null,
      commits: [],
      selectedCommitHash: null,
      selectedFilePath: null,
      diff: [],
      activeBranchFilter: null,
    })),
  setCommits: (commits) => set({ commits }),
  appendCommits: (commits) =>
    set((state) => ({ commits: [...state.commits, ...commits] })),
  setBranches: (branches) => set({ branches }),
  setStatus: (status) => set({ status }),
  setStashes: (stashes) => set({ stashes }),
  setTags: (tags) => set({ tags }),
  setActiveBranchFilter: (branch) => set({ activeBranchFilter: branch, commits: [] }),
  setSelectedCommitHash: (hash) =>
    set({ selectedCommitHash: hash, selectedFilePath: null, diff: [] }),
  setSelectedFilePath: (path) => set({ selectedFilePath: path }),
  setDiff: (diff) => set({ diff }),
  setLoadingCommits: (v) => set({ loadingCommits: v }),
  setLoadingStatus: (v) => set({ loadingStatus: v }),
  setLoadingDiff: (v) => set({ loadingDiff: v }),
  setOperationInProgress: (v) => set({ operationInProgress: v }),
  setSettings: (updates) =>
    set((state) => {
      const settings = { ...state.settings, ...updates };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      return { settings };
    }),
}));
