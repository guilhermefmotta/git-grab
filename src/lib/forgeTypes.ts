export type ForgePlatform = "github" | "gitlab" | "unknown";

export interface ForgeInfo {
  platform: ForgePlatform;
  owner: string;
  repo: string;
  base_url: string;
  has_token: boolean;
}

export interface PullRequest {
  number: number;
  title: string;
  state: string;
  url: string;
  author: string;
  created_at: string;
  source_branch: string;
  target_branch: string;
  draft: boolean;
  body: string | null;
}

export interface Pipeline {
  id: number;
  name: string;
  status: string;
  branch: string;
  url: string;
  created_at: string;
}

export interface PipelineJob {
  id: number;
  name: string;
  status: string;
  stage: string | null;
  url: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
}

export interface PrComment {
  id: number;
  author: string;
  body: string;
  created_at: string;
  url: string;
}
