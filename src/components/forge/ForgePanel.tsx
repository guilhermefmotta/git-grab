import { useEffect, useState, useCallback, useMemo } from "react";
import {
  GitPullRequest, Play, RefreshCw, AlertCircle, CheckCircle2,
  XCircle, Clock, Loader2, Github, MessageSquare, ChevronDown,
  ChevronRight, Send, Key, ExternalLink, GitBranch, Search,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { git } from "@/lib/tauri";
import { useAppStore } from "@/store/appStore";
import type { ForgeInfo, PullRequest, Pipeline, PipelineJob, PrComment } from "@/lib/forgeTypes";

// ── Status helpers ────────────────────────────────────────────────────────────

function PipelineStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "success": return <CheckCircle2 size={13} className="text-green-400 shrink-0" />;
    case "failure": return <XCircle size={13} className="text-red-400 shrink-0" />;
    case "running": return <Loader2 size={13} className="text-blue-400 animate-spin shrink-0" />;
    case "pending": return <Clock size={13} className="text-yellow-400 shrink-0" />;
    case "cancelled": return <XCircle size={13} className="text-muted-foreground shrink-0" />;
    default: return <AlertCircle size={13} className="text-muted-foreground shrink-0" />;
  }
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: "bg-green-500/15 text-green-400",
    merged: "bg-purple-500/15 text-purple-400",
    closed: "bg-red-500/15 text-red-400",
  };
  return (
    <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", colors[status] ?? "bg-secondary text-muted-foreground")}>
      {status}
    </span>
  );
}

function age(iso: string) {
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); }
  catch { return iso; }
}

// ── Token setup ───────────────────────────────────────────────────────────────

function TokenSetup({ platform, onSaved }: { platform: string; onSaved: () => void }) {
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!token.trim()) return;
    setSaving(true);
    try {
      await git.saveForgeToken(platform, token.trim());
      toast.success("Token saved");
      onSaved();
    } catch (e) { toast.error(String(e)); }
    finally { setSaving(false); }
  };

  const label = platform === "github" ? "GitHub Personal Access Token" : "GitLab Personal Access Token";
  const hint = platform === "github"
    ? "Needs repo + workflow scopes. Create at github.com → Settings → Developer settings → Personal access tokens."
    : "Needs api scope. Create at gitlab.com → User Settings → Access Tokens.";

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Key size={12} />
        <span>{label}</span>
      </div>
      <p className="text-[11px] text-muted-foreground/70">{hint}</p>
      <div className="flex gap-2">
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="Paste token…"
          className="flex-1 bg-background border border-border rounded px-2 py-1 text-xs outline-none focus:border-primary"
        />
        <button
          onClick={save}
          disabled={saving || !token.trim()}
          className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded disabled:opacity-40"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : "Save"}
        </button>
      </div>
    </div>
  );
}

// ── PR Comments ───────────────────────────────────────────────────────────────

function PrComments({ repoPath, prNumber }: { repoPath: string; prNumber: number }) {
  const [comments, setComments] = useState<PrComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setComments(await git.getPrComments(repoPath, prNumber)); }
    catch { setComments([]); }
    finally { setLoading(false); }
  }, [repoPath, prNumber]);

  useEffect(() => { load(); }, [load]);

  const post = async () => {
    if (!newComment.trim()) return;
    setPosting(true);
    try {
      await git.postPrComment(repoPath, prNumber, newComment.trim());
      setNewComment("");
      await load();
      toast.success("Comment posted");
    } catch (e) { toast.error(String(e)); }
    finally { setPosting(false); }
  };

  if (loading) return <div className="p-3 flex justify-center"><Loader2 size={14} className="animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex flex-col gap-1 px-3 pb-3">
      {comments.length === 0 && (
        <p className="text-[11px] text-muted-foreground/60 py-2">No comments yet</p>
      )}
      {comments.map((c) => (
        <div key={c.id} className="border border-border/50 rounded p-2 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-foreground">{c.author}</span>
            <span className="text-[10px] text-muted-foreground">{age(c.created_at)}</span>
          </div>
          <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">{c.body}</p>
        </div>
      ))}
      {/* New comment */}
      <div className="flex gap-2 mt-1">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment…"
          rows={2}
          className="flex-1 bg-background border border-border rounded px-2 py-1 text-xs outline-none focus:border-primary resize-none"
        />
        <button
          onClick={post}
          disabled={posting || !newComment.trim()}
          className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded disabled:opacity-40 self-end"
        >
          {posting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
        </button>
      </div>
    </div>
  );
}

// ── PR row ────────────────────────────────────────────────────────────────────

function PrRow({ pr, repoPath }: { pr: PullRequest; repoPath: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border/40 last:border-0">
      <div
        className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-accent/40 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? <ChevronDown size={11} className="mt-0.5 shrink-0 text-muted-foreground" /> : <ChevronRight size={11} className="mt-0.5 shrink-0 text-muted-foreground" />}
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            {pr.draft && <span className="text-[10px] text-muted-foreground">[Draft]</span>}
            <span className="text-xs text-foreground truncate">{pr.title}</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>#{pr.number}</span>
            <span>{pr.author}</span>
            <span>{pr.source_branch} → {pr.target_branch}</span>
            <span>{age(pr.created_at)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusBadge status={pr.state} />
          {pr.url && (
            <a href={pr.url} onClick={(e) => { e.stopPropagation(); git.openInEditor(pr.url).catch(() => {}); }}
              className="text-muted-foreground hover:text-foreground">
              <ExternalLink size={11} />
            </a>
          )}
        </div>
      </div>
      {expanded && (
        <div className="bg-accent/10">
          {pr.body && (
            <p className="px-3 py-2 text-[11px] text-muted-foreground whitespace-pre-wrap border-b border-border/30">
              {pr.body.slice(0, 500)}{pr.body.length > 500 ? "…" : ""}
            </p>
          )}
          <div className="px-3 py-1.5 flex items-center gap-1.5 border-b border-border/30">
            <MessageSquare size={10} className="text-muted-foreground" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Comments</span>
          </div>
          <PrComments repoPath={repoPath} prNumber={pr.number} />
        </div>
      )}
    </div>
  );
}

// ── Branch badge ──────────────────────────────────────────────────────────────

const BRANCH_PALETTES = [
  "bg-blue-500/20 text-blue-300",
  "bg-purple-500/20 text-purple-300",
  "bg-orange-500/20 text-orange-300",
  "bg-cyan-500/20 text-cyan-300",
  "bg-pink-500/20 text-pink-300",
  "bg-teal-500/20 text-teal-300",
  "bg-violet-500/20 text-violet-300",
  "bg-amber-500/20 text-amber-300",
];

function branchPalette(branch: string) {
  let h = 0;
  for (const c of branch) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return BRANCH_PALETTES[h % BRANCH_PALETTES.length];
}

function BranchBadge({ branch }: { branch: string }) {
  return (
    <span className={cn("flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0", branchPalette(branch))}>
      <GitBranch size={9} />
      {branch}
    </span>
  );
}

function PipelineStatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      "text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0",
      status === "success" && "bg-green-500/15 text-green-400",
      status === "failure" && "bg-red-500/15 text-red-400",
      status === "running" && "bg-blue-500/15 text-blue-400",
      status === "pending" && "bg-yellow-500/15 text-yellow-400",
      !["success", "failure", "running", "pending"].includes(status) && "bg-secondary text-muted-foreground",
    )}>
      {status}
    </span>
  );
}

// ── Pipeline group (collapsed/expanded) ───────────────────────────────────────

type PipelineGroup = { name: string; runs: Pipeline[] };

function groupPipelines(pipelines: Pipeline[]): PipelineGroup[] {
  const map = new Map<string, Pipeline[]>();
  for (const p of pipelines) {
    if (!map.has(p.name)) map.set(p.name, []);
    map.get(p.name)!.push(p);
  }
  return Array.from(map.entries()).map(([name, runs]) => ({ name, runs }));
}

function formatDuration(seconds: number | null, started: string | null, finished: string | null): string | null {
  let s = seconds;
  if (s == null && started && finished) {
    s = (new Date(finished).getTime() - new Date(started).getTime()) / 1000;
  }
  if (s == null || s < 0) return null;
  if (s < 60) return `${Math.round(s)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

function JobStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "success": return <CheckCircle2 size={11} className="text-green-400 shrink-0" />;
    case "failure": case "failed": return <XCircle size={11} className="text-red-400 shrink-0" />;
    case "running": case "in_progress": return <Loader2 size={11} className="text-blue-400 animate-spin shrink-0" />;
    case "pending": case "queued": case "created": return <Clock size={11} className="text-yellow-400 shrink-0" />;
    case "cancelled": case "canceled": return <XCircle size={11} className="text-muted-foreground shrink-0" />;
    case "skipped": case "manual": return <AlertCircle size={11} className="text-muted-foreground shrink-0" />;
    default: return <AlertCircle size={11} className="text-muted-foreground shrink-0" />;
  }
}

function PipelineJobRow({ job, onRetry }: { job: PipelineJob; onRetry: (id: number) => void }) {
  return (
    <div className="flex items-center gap-2 pl-14 pr-3 py-1 border-b border-border/10 last:border-0 hover:bg-accent/20 transition-colors group">
      <JobStatusIcon status={job.status} />
      <div className="flex-1 min-w-0">
        <span className="text-[11px] text-foreground">{job.name}</span>
        {job.stage && (
          <span className="ml-1.5 text-[10px] text-muted-foreground/60">{job.stage}</span>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {formatDuration(job.duration_seconds, job.started_at, job.finished_at) && (
          <span className="text-[10px] text-muted-foreground">
            {formatDuration(job.duration_seconds, job.started_at, job.finished_at)}
          </span>
        )}
        <button
          onClick={() => onRetry(job.id)}
          title="Retry this job"
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all"
        >
          <Play size={10} />
        </button>
        {job.url && (
          <a href={job.url} onClick={(e) => { e.preventDefault(); git.openInEditor(job.url!).catch(() => {}); }}
            className="text-muted-foreground hover:text-foreground">
            <ExternalLink size={10} />
          </a>
        )}
      </div>
    </div>
  );
}

function PipelineRunRow({ pipeline, repoPath, onTrigger }: { pipeline: Pipeline; repoPath: string; onTrigger: (ref: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [jobs, setJobs] = useState<PipelineJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);

  const loadJobs = useCallback(async () => {
    if (jobs.length > 0) return;
    setLoadingJobs(true);
    try { setJobs(await git.getPipelineJobs(repoPath, pipeline.id)); }
    catch { setJobs([]); }
    finally { setLoadingJobs(false); }
  }, [repoPath, pipeline.id, jobs.length]);

  const toggle = () => {
    setExpanded((v) => {
      if (!v) loadJobs();
      return !v;
    });
  };

  const retryJob = async (jobId: number) => {
    try {
      await git.retryPipelineJob(repoPath, jobId);
      toast.success("Job retry triggered");
      setJobs([]);
      setTimeout(loadJobs, 1500);
    } catch (e) { toast.error(String(e)); }
  };

  return (
    <div className="border-b border-border/20 last:border-0">
      <div
        className="flex items-center gap-2 pl-8 pr-3 py-1.5 cursor-pointer hover:bg-accent/20 transition-colors group"
        onClick={toggle}
      >
        {expanded
          ? <ChevronDown size={10} className="text-muted-foreground shrink-0" />
          : <ChevronRight size={10} className="text-muted-foreground shrink-0" />}
        <PipelineStatusIcon status={pipeline.status} />
        <BranchBadge branch={pipeline.branch} />
        <span className="flex-1 text-[10px] text-muted-foreground">{age(pipeline.created_at)}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          <PipelineStatusBadge status={pipeline.status} />
          <button
            onClick={(e) => { e.stopPropagation(); onTrigger(pipeline.branch); }}
            title="Re-run"
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all"
          >
            <Play size={11} />
          </button>
          {pipeline.url && (
            <a href={pipeline.url} onClick={(e) => { e.stopPropagation(); e.preventDefault(); git.openInEditor(pipeline.url).catch(() => {}); }}
              className="text-muted-foreground hover:text-foreground">
              <ExternalLink size={11} />
            </a>
          )}
        </div>
      </div>
      {expanded && (
        <div className="bg-accent/5">
          {loadingJobs && (
            <div className="flex justify-center py-2">
              <Loader2 size={12} className="animate-spin text-muted-foreground" />
            </div>
          )}
          {!loadingJobs && jobs.length === 0 && (
            <p className="pl-14 py-1.5 text-[10px] text-muted-foreground">No jobs found</p>
          )}
          {jobs.map((j) => (
            <PipelineJobRow key={j.id} job={j} onRetry={retryJob} />
          ))}
        </div>
      )}
    </div>
  );
}

function PipelineGroupRow({ group, repoPath, onTrigger }: { group: PipelineGroup; repoPath: string; onTrigger: (ref: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const latest = group.runs[0];
  const branches = [...new Set(group.runs.map((r) => r.branch))];

  return (
    <div className="border-b border-border/40 last:border-0">
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent/40 transition-colors group"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded
          ? <ChevronDown size={11} className="text-muted-foreground shrink-0" />
          : <ChevronRight size={11} className="text-muted-foreground shrink-0" />}
        <PipelineStatusIcon status={latest.status} />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-foreground font-medium truncate">{group.name}</p>
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            {branches.slice(0, 3).map((b) => <BranchBadge key={b} branch={b} />)}
            {branches.length > 3 && (
              <span className="text-[10px] text-muted-foreground">+{branches.length - 3} more</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] text-muted-foreground">{group.runs.length} run{group.runs.length !== 1 ? "s" : ""}</span>
          <PipelineStatusBadge status={latest.status} />
          <button
            onClick={(e) => { e.stopPropagation(); onTrigger(latest.branch); }}
            title="Re-run latest"
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all"
          >
            <Play size={11} />
          </button>
          {latest.url && (
            <a href={latest.url} onClick={(e) => { e.stopPropagation(); e.preventDefault(); git.openInEditor(latest.url).catch(() => {}); }}
              className="text-muted-foreground hover:text-foreground">
              <ExternalLink size={11} />
            </a>
          )}
        </div>
      </div>
      {expanded && (
        <div className="bg-accent/10">
          {group.runs.map((r) => (
            <PipelineRunRow key={r.id} pipeline={r} repoPath={repoPath} onTrigger={onTrigger} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

type Tab = "prs" | "pipelines";

export function ForgePanel() {
  const { activeRepo } = useAppStore();
  const [forge, setForge] = useState<ForgeInfo | null>(null);
  const [tab, setTab] = useState<Tab>("prs");
  const [prs, setPrs] = useState<PullRequest[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsToken, setNeedsToken] = useState(false);
  const [branchFilter, setBranchFilter] = useState("");

  const detect = useCallback(async () => {
    if (!activeRepo) return;
    try {
      const info = await git.detectForge(activeRepo.path);
      setForge(info);
      setNeedsToken(!info.has_token && info.platform !== "unknown");
    } catch {
      setForge(null);
    }
  }, [activeRepo]);

  useEffect(() => { detect(); }, [detect]);

  const loadPrs = useCallback(async () => {
    if (!activeRepo || !forge || forge.platform === "unknown") return;
    setLoading(true); setError(null);
    try { setPrs(await git.getPullRequests(activeRepo.path)); }
    catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [activeRepo, forge]);

  const loadPipelines = useCallback(async () => {
    if (!activeRepo || !forge || forge.platform === "unknown") return;
    setLoading(true); setError(null);
    try { setPipelines(await git.getPipelines(activeRepo.path)); }
    catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [activeRepo, forge]);

  useEffect(() => {
    if (!forge || forge.platform === "unknown" || needsToken) return;
    if (tab === "prs") loadPrs();
    else loadPipelines();
  }, [tab, forge, needsToken]);

  const filteredGroups = useMemo(() => {
    const q = branchFilter.toLowerCase().trim();
    const groups = groupPipelines(pipelines);
    if (!q) return groups;
    return groups
      .map((g) => ({ ...g, runs: g.runs.filter((r) => r.branch.toLowerCase().includes(q)) }))
      .filter((g) => g.runs.length > 0);
  }, [pipelines, branchFilter]);

  const triggerPipeline = async (ref: string) => {
    if (!activeRepo) return;
    try {
      await git.triggerPipeline(activeRepo.path, ref);
      toast.success(`Pipeline triggered for ${ref}`);
      setTimeout(loadPipelines, 2000);
    } catch (e) { toast.error(String(e)); }
  };

  if (!activeRepo) return null;

  if (!forge || forge.platform === "unknown") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 px-4 text-center">
        <Github size={24} className="text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">No GitHub/GitLab remote detected</p>
        <p className="text-[11px] text-muted-foreground/60">Add an origin remote pointing to GitHub or GitLab</p>
      </div>
    );
  }

  if (needsToken) {
    return (
      <div className="flex flex-col overflow-hidden h-full">
        <div className="px-3 py-2 border-b border-border shrink-0 flex items-center gap-2">
          <Github size={12} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{forge.owner}/{forge.repo}</span>
        </div>
        <TokenSetup platform={forge.platform} onSaved={() => { setNeedsToken(false); detect(); }} />
      </div>
    );
  }

  const platformLabel = forge.platform === "github" ? "GitHub" : "GitLab";
  const prLabel = forge.platform === "github" ? "Pull Requests" : "Merge Requests";

  return (
    <div className="flex flex-col overflow-hidden h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border shrink-0 flex items-center gap-2">
        <Github size={12} className="text-muted-foreground" />
        <span className="text-xs text-muted-foreground font-medium">{forge.owner}/{forge.repo}</span>
        <span className="text-[10px] text-muted-foreground/50">{platformLabel}</span>
        <button onClick={() => tab === "prs" ? loadPrs() : loadPipelines()}
          className="ml-auto text-muted-foreground hover:text-foreground">
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border shrink-0">
        {([["prs", prLabel, GitPullRequest], ["pipelines", "Pipelines", Play]] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors border-b-2",
              tab === id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon size={11} />
            {label}
          </button>
        ))}
      </div>

      {/* Branch filter (pipelines tab only) */}
      {tab === "pipelines" && (
        <div className="px-3 py-1.5 border-b border-border shrink-0">
          <div className="flex items-center gap-1.5 bg-background border border-border rounded px-2 py-1">
            <Search size={10} className="text-muted-foreground shrink-0" />
            <input
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              placeholder="Filter by branch…"
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
            />
            {branchFilter && (
              <button onClick={() => setBranchFilter("")} className="text-muted-foreground hover:text-foreground text-xs leading-none">×</button>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading && (
          <div className="flex items-center justify-center h-16">
            <Loader2 size={14} className="animate-spin text-muted-foreground" />
          </div>
        )}
        {error && !loading && (
          <div className="p-3 text-xs text-destructive">{error}</div>
        )}
        {!loading && !error && tab === "prs" && (
          prs.length === 0
            ? <p className="p-3 text-xs text-muted-foreground">No open {prLabel.toLowerCase()}</p>
            : prs.map((pr) => <PrRow key={pr.number} pr={pr} repoPath={activeRepo.path} />)
        )}
        {!loading && !error && tab === "pipelines" && (
          pipelines.length === 0
            ? <p className="p-3 text-xs text-muted-foreground">No recent pipelines</p>
            : filteredGroups.length === 0
              ? <p className="p-3 text-xs text-muted-foreground">No pipelines match "{branchFilter}"</p>
              : filteredGroups.map((g) => (
                  <PipelineGroupRow key={g.name} group={g} repoPath={activeRepo.path} onTrigger={triggerPipeline} />
                ))
        )}
      </div>
    </div>
  );
}
