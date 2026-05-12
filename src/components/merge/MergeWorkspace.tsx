import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, CheckCircle, ChevronDown, ChevronUp,
  ChevronsLeft, ChevronsRight, FileWarning, GitMerge,
  Loader2, X, SkipForward,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { git } from "@/lib/tauri";
import { parseSegments, buildResult } from "@/lib/conflictParser";
import type { ConflictContent, RepoStatus, Segment } from "@/lib/mergeTypes";

// ── Layout constants ──────────────────────────────────────────────────────────

const GRID = "grid grid-cols-[1fr_28px_1fr_28px_1fr]";

// ── Line number gutter ────────────────────────────────────────────────────────

function Ln({ n }: { n: number | "" }) {
  return (
    <span className="shrink-0 w-9 text-right pr-2 text-muted-foreground/25 select-none text-[10px] leading-5 tabular-nums">
      {n}
    </span>
  );
}

// ── Context row (same line in all 3 panels) ───────────────────────────────────

function CtxRow({ line, ln }: { line: string; ln: number }) {
  return (
    <div className={cn(GRID, "border-b border-border/5 hover:bg-accent/5 min-w-0")}>
      <div className="flex min-w-0">
        <Ln n={ln} />
        <span className="flex-1 whitespace-pre text-[11px] leading-5 pr-2 overflow-hidden text-foreground/60 font-mono">{line || " "}</span>
      </div>
      <div className="border-x border-border/10" />
      <div className="flex min-w-0">
        <Ln n={ln} />
        <span className="flex-1 whitespace-pre text-[11px] leading-5 pr-2 overflow-hidden text-foreground/60 font-mono">{line || " "}</span>
      </div>
      <div className="border-x border-border/10" />
      <div className="flex min-w-0">
        <Ln n={ln} />
        <span className="flex-1 whitespace-pre text-[11px] leading-5 pr-2 overflow-hidden text-foreground/60 font-mono">{line || " "}</span>
      </div>
    </div>
  );
}

// ── Conflict block ────────────────────────────────────────────────────────────

function ConflictBlock({
  section, idx, active, resolved,
  onActivate, onAcceptOurs, onAcceptTheirs, onClear,
}: {
  section: { idx: number; ourLabel: string; theirLabel: string; oursLines: string[]; theirsLines: string[] };
  idx: number;
  active: boolean;
  resolved: "ours" | "theirs" | null;
  onActivate: () => void;
  onAcceptOurs: () => void;
  onAcceptTheirs: () => void;
  onClear: () => void;
}) {
  const rows = Math.max(section.oursLines.length, section.theirsLines.length, 1);
  const resultLines =
    resolved === "ours"   ? section.oursLines
    : resolved === "theirs" ? section.theirsLines
    : null;

  const border = active
    ? "border-yellow-500/50 shadow-[inset_0_0_0_1px_rgba(234,179,8,.1)]"
    : "border-yellow-500/12";

  return (
    <div
      className={cn("border-y transition-colors cursor-pointer", border)}
      onClick={onActivate}
    >
      {/* Header */}
      <div className={cn(
        GRID, "text-[10px] border-b",
        active
          ? "bg-yellow-500/8 border-yellow-500/20"
          : "bg-yellow-500/3 border-yellow-500/8",
      )}>
        {/* Left label */}
        <div className="flex items-center gap-1.5 px-2 py-1 min-w-0">
          <AlertTriangle size={9} className="text-yellow-400 shrink-0" />
          <span className="font-semibold text-yellow-300 shrink-0">Conflict {idx + 1}</span>
          <span className="text-green-400/50 font-mono truncate ml-1">{section.ourLabel}</span>
        </div>

        {/* Left divider — >> accept ours */}
        <div className="border-x border-yellow-500/10 flex items-center justify-center">
          {resolved === null ? (
            <button
              title="Accept Local (ours) →"
              onClick={e => { e.stopPropagation(); onAcceptOurs(); }}
              className="text-green-400 hover:text-green-200 hover:bg-green-900/40 rounded p-0.5 transition-colors"
            >
              <ChevronsRight size={12} />
            </button>
          ) : (
            <button title="Clear resolution" onClick={e => { e.stopPropagation(); onClear(); }}
              className="text-muted-foreground/30 hover:text-muted-foreground transition-colors">
              <X size={9} />
            </button>
          )}
        </div>

        {/* Center — resolution status */}
        <div className="flex items-center justify-center gap-1.5 px-1 py-1">
          {resolved ? (
            <>
              <CheckCircle size={9} className="text-green-400" />
              <span className="text-green-300 capitalize text-[9px]">{resolved}</span>
              <button onClick={e => { e.stopPropagation(); onClear(); }}
                className="text-muted-foreground/30 hover:text-muted-foreground transition-colors ml-0.5">
                <X size={8} />
              </button>
            </>
          ) : (
            <span className="text-muted-foreground/20 italic text-[9px]">choose</span>
          )}
        </div>

        {/* Right divider — << accept theirs */}
        <div className="border-x border-yellow-500/10 flex items-center justify-center">
          {resolved === null ? (
            <button
              title="← Accept Remote (theirs)"
              onClick={e => { e.stopPropagation(); onAcceptTheirs(); }}
              className="text-blue-400 hover:text-blue-200 hover:bg-blue-900/40 rounded p-0.5 transition-colors"
            >
              <ChevronsLeft size={12} />
            </button>
          ) : (
            <button title="Clear resolution" onClick={e => { e.stopPropagation(); onClear(); }}
              className="text-muted-foreground/30 hover:text-muted-foreground transition-colors">
              <X size={9} />
            </button>
          )}
        </div>

        {/* Right label */}
        <div className="flex items-center justify-end px-2 py-1 min-w-0">
          <span className="text-blue-400/50 font-mono truncate">{section.theirLabel}</span>
        </div>
      </div>

      {/* Content rows */}
      {Array.from({ length: rows }, (_, j) => {
        const oLine = section.oursLines[j];
        const tLine = section.theirsLines[j];
        const rLine = resultLines ? resultLines[j] : undefined;

        return (
          <div key={j} className={cn(GRID, "border-b border-border/5")}>
            {/* Ours */}
            <div className={cn(
              "flex min-w-0",
              oLine !== undefined
                ? "bg-green-900/20 border-l-2 border-l-green-500/40"
                : "bg-muted/3",
            )}>
              <Ln n={oLine !== undefined ? j + 1 : ""} />
              <span className={cn("flex-1 whitespace-pre text-[11px] leading-5 pr-2 overflow-hidden font-mono",
                oLine !== undefined ? "text-green-50/80" : "")}>
                {oLine ?? " "}
              </span>
            </div>

            {/* Left gutter */}
            <div className="border-x border-yellow-500/8 bg-yellow-950/3" />

            {/* Result */}
            <div className={cn("flex min-w-0",
              rLine !== undefined
                ? resolved === "ours"   ? "bg-green-900/12"
                : resolved === "theirs" ? "bg-blue-900/12"
                : "bg-muted/5"
                : "bg-amber-950/8",
            )}>
              <Ln n={rLine !== undefined ? j + 1 : ""} />
              {rLine !== undefined ? (
                <span className="flex-1 whitespace-pre text-[11px] leading-5 font-mono text-foreground/85 pr-2 overflow-hidden">{rLine || " "}</span>
              ) : (
                <span className="flex-1 text-[9px] text-amber-600/40 italic leading-5 select-none pl-0.5">← unresolved →</span>
              )}
            </div>

            {/* Right gutter */}
            <div className="border-x border-yellow-500/8 bg-yellow-950/3" />

            {/* Theirs */}
            <div className={cn(
              "flex min-w-0",
              tLine !== undefined
                ? "bg-blue-900/20 border-l-2 border-l-blue-500/40"
                : "bg-muted/3",
            )}>
              <Ln n={tLine !== undefined ? j + 1 : ""} />
              <span className={cn("flex-1 whitespace-pre text-[11px] leading-5 pr-2 overflow-hidden font-mono",
                tLine !== undefined ? "text-blue-50/80" : "")}>
                {tLine ?? " "}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── File conflict editor ──────────────────────────────────────────────────────

function FileEditor({
  repoPath, filePath, onStaged, onSkip,
}: {
  repoPath: string;
  filePath: string;
  onStaged: () => void;
  onSkip: () => void;
}) {
  const [content, setContent] = useState<ConflictContent | null>(null);
  const [segs, setSegs] = useState<Segment[]>([]);
  const [resolutions, setResolutions] = useState<Map<number, "ours" | "theirs">>(new Map());
  const [activeIdx, setActiveIdx] = useState(0);
  const [staging, setStaging] = useState(false);
  const [loading, setLoading] = useState(true);
  const blockRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    setLoading(true);
    setResolutions(new Map());
    setActiveIdx(0);
    blockRefs.current.clear();
    git.getConflictContent(repoPath, filePath)
      .then(c => {
        setContent(c);
        setSegs(parseSegments(c.merged));
      })
      .catch(e => toast.error(String(e)))
      .finally(() => setLoading(false));
  }, [repoPath, filePath]);

  const conflictSegs = segs.filter(s => s.kind === "conflict") as Extract<Segment, { kind: "conflict" }>[];
  const total = conflictSegs.length;
  const resolved = resolutions.size;
  const allDone = total > 0 && resolved === total;

  const goTo = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(total - 1, idx));
    setActiveIdx(clamped);
    blockRefs.current.get(clamped)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [total]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "ArrowDown") { e.preventDefault(); goTo(activeIdx + 1); }
      if ((e.ctrlKey || e.metaKey) && e.key === "ArrowUp")   { e.preventDefault(); goTo(activeIdx - 1); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [activeIdx, goTo]);

  const acceptAll = (kind: "ours" | "theirs") => {
    const m = new Map<number, "ours" | "theirs">();
    conflictSegs.forEach(s => m.set(s.section.idx, kind));
    setResolutions(m);
  };

  const stage = async () => {
    if (!content) return;
    setStaging(true);
    try {
      const final = buildResult(segs, resolutions);
      await git.resolveConflict(repoPath, filePath, final);
      toast.success(`Staged: ${filePath}`);
      onStaged();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setStaging(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full gap-2">
      <Loader2 size={14} className="animate-spin text-muted-foreground" />
      <span className="text-xs text-muted-foreground">Loading…</span>
    </div>
  );

  if (content?.isBinary) return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <FileWarning size={24} className="text-yellow-400" />
      <p className="text-xs text-muted-foreground">Binary file — resolve manually</p>
      <button onClick={onSkip}
        className="px-3 py-1.5 text-xs bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 transition-colors">
        Mark as resolved (use current)
      </button>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden font-mono">

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card shrink-0 flex-wrap">
        <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">{filePath}</span>

        {total > 1 && !allDone && (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => acceptAll("ours")}
              className="flex items-center gap-0.5 px-2 py-1 text-[10px] rounded border bg-green-900/30 border-green-700/30 text-green-300 hover:bg-green-900/50 transition-colors">
              <ChevronsRight size={10} /> All Local
            </button>
            <button onClick={() => acceptAll("theirs")}
              className="flex items-center gap-0.5 px-2 py-1 text-[10px] rounded border bg-blue-900/30 border-blue-700/30 text-blue-300 hover:bg-blue-900/50 transition-colors">
              <ChevronsLeft size={10} /> All Remote
            </button>
          </div>
        )}

        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={() => goTo(activeIdx - 1)} disabled={activeIdx === 0}
            className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 hover:bg-accent/30 transition-colors">
            <ChevronUp size={12} />
          </button>
          <span className="text-[10px] tabular-nums text-muted-foreground px-1 min-w-[68px] text-center">
            {resolved}/{total} resolved
          </span>
          <button onClick={() => goTo(activeIdx + 1)} disabled={activeIdx >= total - 1}
            className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 hover:bg-accent/30 transition-colors">
            <ChevronDown size={12} />
          </button>
        </div>

        <button onClick={stage} disabled={!allDone || staging}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
          {staging && <Loader2 size={11} className="animate-spin" />}
          {staging ? "Staging…" : "Stage File"}
        </button>

        <button onClick={onSkip}
          className="flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border/40 rounded hover:bg-accent/20 transition-colors shrink-0">
          <SkipForward size={11} /> Skip
        </button>
      </div>

      {/* Column headers */}
      <div className={cn(GRID, "shrink-0 bg-card border-b border-border text-[10px] font-semibold uppercase tracking-wider")}>
        <div className="px-3 py-1.5 text-green-400">Local (Ours)</div>
        <div className="border-x border-border/15 bg-card/30" />
        <div className="px-3 py-1.5 text-muted-foreground">Result</div>
        <div className="border-x border-border/15 bg-card/30" />
        <div className="px-3 py-1.5 text-blue-400">Remote (Theirs)</div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {segs.map((seg, i) => {
          if (seg.kind === "context") {
            return (
              <div key={`ctx-${i}`}>
                {seg.lines.map((line, j) => (
                  <CtxRow key={j} line={line} ln={seg.firstLine + j} />
                ))}
              </div>
            );
          }
          const { section } = seg;
          return (
            <div
              key={`conflict-${section.idx}`}
              ref={el => { if (el) blockRefs.current.set(section.idx, el); }}
            >
              <ConflictBlock
                section={section}
                idx={section.idx}
                active={section.idx === activeIdx}
                resolved={resolutions.get(section.idx) ?? null}
                onActivate={() => setActiveIdx(section.idx)}
                onAcceptOurs={() => setResolutions(prev => new Map(prev).set(section.idx, "ours"))}
                onAcceptTheirs={() => setResolutions(prev => new Map(prev).set(section.idx, "theirs"))}
                onClear={() => setResolutions(prev => { const m = new Map(prev); m.delete(section.idx); return m; })}
              />
            </div>
          );
        })}
      </div>

      {/* Footer minimap */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-t border-border bg-card shrink-0">
        <div className="flex gap-1">
          {conflictSegs.map(s => (
            <button key={s.section.idx} onClick={() => goTo(s.section.idx)}
              className={cn("w-2 h-2 rounded-full transition-all",
                resolutions.has(s.section.idx) ? "bg-green-500"
                  : s.section.idx === activeIdx ? "bg-yellow-400 scale-125"
                  : "bg-yellow-700/50 hover:bg-yellow-500/60"
              )} />
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground flex-1 text-right">
          {allDone
            ? "All resolved — ready to stage"
            : `${total - resolved} conflict${total - resolved !== 1 ? "s" : ""} remaining`}
        </span>
      </div>
    </div>
  );
}

// ── File list sidebar ─────────────────────────────────────────────────────────

function FileList({
  files, current, resolved, onSelect,
}: {
  files: string[];
  current: string | null;
  resolved: Set<string>;
  onSelect: (f: string) => void;
}) {
  return (
    <div className="w-56 shrink-0 border-r border-border bg-card/50 flex flex-col overflow-hidden">
      <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
        Conflicted Files ({files.length})
      </div>
      <div className="flex-1 overflow-y-auto">
        {files.map(f => {
          const isResolved = resolved.has(f);
          const isCurrent  = f === current;
          return (
            <button
              key={f}
              onClick={() => onSelect(f)}
              className={cn(
                "w-full text-left px-3 py-2 text-[11px] flex items-center gap-2 border-b border-border/30 hover:bg-accent/20 transition-colors",
                isCurrent && "bg-accent/30",
              )}
            >
              {isResolved
                ? <CheckCircle size={12} className="text-green-400 shrink-0" />
                : <AlertTriangle size={12} className="text-yellow-400 shrink-0" />}
              <span className={cn(
                "truncate font-mono",
                isResolved ? "text-muted-foreground line-through" : isCurrent ? "text-foreground" : "text-foreground/70",
              )}>
                {f.split("/").pop()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Operation banner ──────────────────────────────────────────────────────────

const OP_LABELS: Record<string, string> = {
  Merging:       "Merging",
  Rebasing:      "Rebasing",
  CherryPicking: "Cherry-picking",
  Reverting:     "Reverting",
  Conflicted:    "Conflicts from stash pop",
};

function Banner({
  status, resolvedCount, onAbort, onComplete, completing,
}: {
  status: RepoStatus;
  resolvedCount: number;
  onAbort: () => void;
  onComplete: () => void;
  completing: boolean;
}) {
  const op     = OP_LABELS[status.operation] ?? status.operation;
  const total  = status.conflictedFiles.length;
  const allDone = resolvedCount === total;
  const isRebase = status.operation === "Rebasing";
  const isConflicted = status.operation === "Conflicted";
  const needsCommit  = status.operation === "Merging";

  const completeLabel =
    isRebase    ? "Continue Rebase"
    : isConflicted ? "Done"
    : "Commit Merge";

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-yellow-500/20 bg-yellow-950/15 shrink-0">
      <GitMerge size={14} className="text-yellow-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-yellow-300">{op}</span>
        {status.operationLabel && (
          <span className="text-xs text-yellow-400/60 ml-2 font-mono">{status.operationLabel}</span>
        )}
        {status.headBranch && (
          <span className="text-xs text-muted-foreground ml-2">
            into <span className="font-mono text-foreground/70">{status.headBranch}</span>
          </span>
        )}
        <span className="text-xs text-muted-foreground ml-3">
          {resolvedCount}/{total} files resolved
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onAbort}
          className="px-3 py-1 text-xs border border-border/40 rounded hover:bg-accent/20 text-muted-foreground hover:text-foreground transition-colors"
        >
          {needsCommit ? "Abort Merge" : isRebase ? "Abort Rebase" : "Abort"}
        </button>
        <button
          onClick={onComplete}
          disabled={!allDone || completing}
          className="flex items-center gap-1.5 px-3 py-1 text-xs bg-green-700 text-white rounded hover:bg-green-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {completing && <Loader2 size={10} className="animate-spin" />}
          {completeLabel}
        </button>
      </div>
    </div>
  );
}

// ── Root MergeWorkspace ───────────────────────────────────────────────────────

interface Props {
  repoPath: string;
  status: RepoStatus;
  onDone: () => void;
}

export function MergeWorkspace({ repoPath, status, onDone }: Props) {
  const [current, setCurrent] = useState<string | null>(status.conflictedFiles[0] ?? null);
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [completing, setCompleting] = useState(false);

  // Reset when status changes (e.g. continue rebase adds new conflicts)
  useEffect(() => {
    setResolved(new Set());
    setCurrent(status.conflictedFiles[0] ?? null);
  }, [status.conflictedFiles.join(",")]);

  const handleStaged = () => {
    const next = new Set(resolved).add(current!);
    setResolved(next);
    // Move to next unresolved
    const remaining = status.conflictedFiles.filter(f => !next.has(f));
    setCurrent(remaining[0] ?? current);
  };

  const handleAbort = async () => {
    try {
      await git.abortOperation(repoPath);
      toast.success("Operation aborted — files restored");
      onDone();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      if (status.operation === "Merging") {
        await git.completeMergeCommit(repoPath);
        toast.success("Merge committed");
      } else if (status.operation === "Rebasing") {
        const newStatus = await git.continueOperation(repoPath);
        if (newStatus.conflictedFiles.length > 0) {
          toast.info(`Next rebase step has ${newStatus.conflictedFiles.length} conflict(s)`);
          setResolved(new Set());
          setCurrent(newStatus.conflictedFiles[0]);
          return;
        }
        toast.success("Rebase completed");
      } else {
        toast.success("Conflicts resolved");
      }
      onDone();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Banner
        status={status}
        resolvedCount={resolved.size}
        onAbort={handleAbort}
        onComplete={handleComplete}
        completing={completing}
      />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <FileList
          files={status.conflictedFiles}
          current={current}
          resolved={resolved}
          onSelect={setCurrent}
        />
        <div className="flex-1 min-w-0 overflow-hidden">
          {current ? (
            <FileEditor
              key={current}
              repoPath={repoPath}
              filePath={current}
              onStaged={handleStaged}
              onSkip={() => {
                const remaining = status.conflictedFiles.filter(f => f !== current);
                setCurrent(remaining[0] ?? null);
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-xs text-muted-foreground">Select a file to resolve</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
