export type GitOperation =
  | "Clean"
  | "Merging"
  | "Rebasing"
  | "CherryPicking"
  | "Reverting"
  | "Bisecting"
  | "Conflicted";

export interface RepoStatus {
  operation: GitOperation;
  conflictedFiles: string[];
  headBranch: string | null;
  operationLabel: string | null;
}

export interface ConflictContent {
  path: string;
  ancestor: string;
  ours: string;
  theirs: string;
  merged: string;  // diffy 3-way output — may contain conflict markers
  ourLabel: string;
  theirLabel: string;
  isBinary: boolean;
}

export interface MergeOutcome {
  fastForward: boolean;
  conflictedFiles: string[];
}

export interface CheckoutOutcome {
  switchedTo: string;
  conflictedFiles: string[];
}

// ── Parsed conflict segments ──────────────────────────────────────────────────

export interface ConflictSection {
  idx: number;
  ourLabel: string;
  theirLabel: string;
  oursLines: string[];
  theirsLines: string[];
}

export type Segment =
  | { kind: "context"; lines: string[]; firstLine: number }
  | { kind: "conflict"; section: ConflictSection };

// ── Conflict resolution state ─────────────────────────────────────────────────

export type ConflictStatus = "unresolved" | "ours" | "theirs" | "both" | "manual";

export interface ConflictState {
  status: ConflictStatus;
  content: string;
}
