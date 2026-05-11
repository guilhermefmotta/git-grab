import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, CheckCircle, ChevronDown, ChevronUp,
  Edit3, Loader2, X, ArrowLeftRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { git } from "@/lib/tauri";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConflictSection {
  idx: number;
  oursLabel: string;
  theirsLabel: string;
  ours: string[];
  theirs: string[];
  startLine: number;
  endLine: number;
}

interface ParsedFile {
  sections: ConflictSection[];
  rawLines: string[];
}

type Resolution = "ours" | "theirs" | "both" | "custom";

interface ResolutionEntry {
  kind: Resolution;
  customText?: string;
}

type Segment =
  | { kind: "context"; lines: string[]; firstLineNum: number }
  | { kind: "conflict"; section: ConflictSection };

// ── Parser ────────────────────────────────────────────────────────────────────

function parseConflicts(content: string): ParsedFile {
  const rawLines = content.split("\n");
  const sections: ConflictSection[] = [];
  let i = 0;
  let idx = 0;

  while (i < rawLines.length) {
    if (rawLines[i].startsWith("<<<<<<<")) {
      const startLine = i;
      const oursLabel = rawLines[i].slice(8).trim() || "ours";
      const ours: string[] = [];
      const theirs: string[] = [];
      i++;
      while (i < rawLines.length && !rawLines[i].startsWith("=======")) {
        ours.push(rawLines[i]);
        i++;
      }
      i++; // skip =======
      while (i < rawLines.length && !rawLines[i].startsWith(">>>>>>>")) {
        theirs.push(rawLines[i]);
        i++;
      }
      const theirsLabel = rawLines[i]?.slice(8).trim() || "theirs";
      const endLine = i;
      i++;
      sections.push({ idx: idx++, oursLabel, theirsLabel, ours, theirs, startLine, endLine });
    } else {
      i++;
    }
  }
  return { sections, rawLines };
}

function buildSegments(parsed: ParsedFile): Segment[] {
  const segs: Segment[] = [];
  let i = 0;
  let si = 0;
  let lineNum = 1;

  while (i < parsed.rawLines.length) {
    const sec = parsed.sections[si];
    if (sec && i === sec.startLine) {
      segs.push({ kind: "conflict", section: sec });
      i = sec.endLine + 1;
      si++;
    } else {
      const ctxLines: string[] = [];
      const first = lineNum;
      while (i < parsed.rawLines.length && !(parsed.sections[si] && i === parsed.sections[si].startLine)) {
        ctxLines.push(parsed.rawLines[i]);
        i++;
        lineNum++;
      }
      if (ctxLines.length > 0) segs.push({ kind: "context", lines: ctxLines, firstLineNum: first });
    }
  }
  return segs;
}

function buildResultContent(
  rawLines: string[],
  sections: ConflictSection[],
  resolutions: Map<number, ResolutionEntry>,
): string {
  const result: string[] = [];
  let i = 0;
  let si = 0;
  while (i < rawLines.length) {
    const sec = sections[si];
    if (sec && i === sec.startLine) {
      const r = resolutions.get(sec.idx);
      if (r) {
        if (r.kind === "custom" && r.customText !== undefined) {
          result.push(...r.customText.split("\n"));
        } else {
          if (r.kind === "ours" || r.kind === "both") result.push(...sec.ours);
          if (r.kind === "theirs" || r.kind === "both") result.push(...sec.theirs);
        }
      } else {
        result.push(rawLines[i]);
        result.push(...sec.ours);
        result.push("=======");
        result.push(...sec.theirs);
        result.push(rawLines[sec.endLine]);
      }
      i = sec.endLine + 1;
      si++;
    } else {
      result.push(rawLines[i]);
      i++;
    }
  }
  return result.join("\n");
}

// ── Primitives ────────────────────────────────────────────────────────────────

function GutterNum({ n }: { n: number | "" }) {
  return (
    <span className="shrink-0 w-10 text-right pr-2 text-muted-foreground/35 select-none text-[10px] leading-5 tabular-nums">
      {n}
    </span>
  );
}

function CtxRow({ line, lineNum }: { line: string; lineNum: number }) {
  return (
    <div className="grid grid-cols-3 border-b border-border/5 hover:bg-accent/5 min-w-0">
      {[0, 1, 2].map(col => (
        <div key={col} className={cn("flex min-w-0", col < 2 && "border-r border-border/15")}>
          <GutterNum n={lineNum} />
          <span className="flex-1 whitespace-pre text-[11px] leading-5 pr-2 overflow-hidden text-foreground/75">
            {line || " "}
          </span>
        </div>
      ))}
    </div>
  );
}

function ActionBtn({
  label, variant, onClick,
}: {
  label: string;
  variant: "green" | "blue" | "purple" | "ghost";
  onClick: React.MouseEventHandler<HTMLButtonElement>;
}) {
  const cls: Record<string, string> = {
    green: "bg-green-900/60 border-green-700/50 text-green-300 hover:bg-green-800/80",
    blue: "bg-blue-900/60 border-blue-700/50 text-blue-300 hover:bg-blue-800/80",
    purple: "bg-purple-900/50 border-purple-700/40 text-purple-300 hover:bg-purple-800/70",
    ghost: "bg-transparent border-border text-muted-foreground hover:text-foreground hover:bg-accent/30",
  };
  return (
    <button
      onClick={onClick}
      className={cn("px-2 py-0.5 text-[10px] rounded border transition-colors shrink-0", cls[variant])}
    >
      {label}
    </button>
  );
}

// ── Conflict Block ────────────────────────────────────────────────────────────

function ConflictBlock({
  section,
  resolution,
  customDraft,
  isActive,
  onActivate,
  onResolve,
  onClear,
  onCustomChange,
}: {
  section: ConflictSection;
  resolution: ResolutionEntry | undefined;
  customDraft: string | undefined;
  isActive: boolean;
  onActivate: () => void;
  onResolve: (kind: Resolution, custom?: string) => void;
  onClear: () => void;
  onCustomChange: (text: string) => void;
}) {
  const maxSides = Math.max(section.ours.length, section.theirs.length, 1);

  const resultLines: string[] = resolution
    ? resolution.kind === "custom" && resolution.customText !== undefined
      ? resolution.customText.split("\n")
      : resolution.kind === "ours"
      ? section.ours
      : resolution.kind === "theirs"
      ? section.theirs
      : [...section.ours, ...section.theirs]
    : [];

  const maxRows = Math.max(maxSides, resultLines.length, 1);

  const resColor = resolution?.kind === "ours"
    ? "bg-green-900/20"
    : resolution?.kind === "theirs"
    ? "bg-blue-900/20"
    : resolution?.kind === "both"
    ? "bg-purple-900/20"
    : "bg-muted/8";

  const isCustom = resolution?.kind === "custom";

  return (
    <div
      className={cn(
        "border-y transition-colors",
        isActive
          ? "border-yellow-500/60 shadow-[0_0_0_1px_rgba(234,179,8,0.2)]"
          : "border-yellow-500/15",
      )}
      onClick={onActivate}
    >
      {/* ── Header ── */}
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-1 flex-wrap border-b",
          isActive ? "bg-yellow-500/12 border-yellow-500/30" : "bg-yellow-500/5 border-yellow-500/10",
        )}
      >
        <AlertTriangle size={11} className="text-yellow-400 shrink-0" />
        <span className="text-[10px] font-bold text-yellow-300 uppercase tracking-wider shrink-0">
          Conflict {section.idx + 1}
        </span>
        <span className="text-[10px] text-green-400/60 font-mono truncate max-w-[110px]">
          ← {section.oursLabel}
        </span>

        {!resolution ? (
          <div className="flex items-center gap-1 ml-auto flex-wrap">
            <ActionBtn label="Accept Ours" variant="green" onClick={e => { e.stopPropagation(); onResolve("ours"); }} />
            <ActionBtn label="Accept Both" variant="purple" onClick={e => { e.stopPropagation(); onResolve("both"); }} />
            <ActionBtn label="Accept Theirs" variant="blue" onClick={e => { e.stopPropagation(); onResolve("theirs"); }} />
          </div>
        ) : (
          <div className="flex items-center gap-2 ml-auto">
            <CheckCircle size={10} className="text-green-400" />
            <span className="text-[10px] text-green-300">
              {resolution.kind === "ours" ? "Ours" : resolution.kind === "theirs" ? "Theirs" : resolution.kind === "both" ? "Both" : "Custom"}
            </span>
            <button onClick={e => { (e as unknown as Event).stopPropagation?.(); onClear(); }} className="text-muted-foreground hover:text-foreground transition-colors" title="Reset">
              <X size={10} />
            </button>
          </div>
        )}

        <span className="text-[10px] text-blue-400/60 font-mono truncate max-w-[110px]">
          {section.theirsLabel} →
        </span>
      </div>

      {/* ── Lines ── */}
      {isCustom ? (
        // Custom edit: full-width textarea in middle, read-only sides
        <div className="grid grid-cols-3">
          {/* Ours (left) */}
          <div className="border-r border-border/20 bg-green-950/20">
            {section.ours.map((line, j) => (
              <div key={j} className="flex border-b border-border/5 border-l-2 border-l-green-500/50">
                <GutterNum n={j + 1} />
                <span className="flex-1 whitespace-pre text-[11px] leading-5 text-green-100/80 pr-2 overflow-hidden">{line || " "}</span>
              </div>
            ))}
          </div>
          {/* Custom editor (middle) */}
          <div className="border-r border-border/20 bg-muted/5 relative">
            <textarea
              className="w-full bg-transparent text-foreground text-[11px] leading-5 font-mono resize-none outline-none px-2 py-0 border-0 block"
              value={customDraft ?? section.ours.join("\n")}
              rows={Math.max(section.ours.length, section.theirs.length, 3)}
              spellCheck={false}
              onClick={e => e.stopPropagation()}
              onChange={e => { e.stopPropagation(); onCustomChange(e.target.value); }}
            />
          </div>
          {/* Theirs (right) */}
          <div className="bg-blue-950/20">
            {section.theirs.map((line, j) => (
              <div key={j} className="flex border-b border-border/5 border-l-2 border-l-blue-500/50">
                <GutterNum n={j + 1} />
                <span className="flex-1 whitespace-pre text-[11px] leading-5 text-blue-100/80 pr-2 overflow-hidden">{line || " "}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        Array.from({ length: maxRows }, (_, j) => {
          const oLine = section.ours[j];
          const tLine = section.theirs[j];
          const rLine = resultLines[j];
          return (
            <div key={j} className="grid grid-cols-3 border-b border-border/5">
              {/* Left – ours */}
              <div className={cn(
                "flex min-w-0 border-r border-border/20",
                oLine !== undefined ? "bg-green-900/30 border-l-2 border-l-green-500/55" : "bg-muted/4",
              )}>
                <GutterNum n={oLine !== undefined ? j + 1 : ""} />
                <span className={cn(
                  "flex-1 whitespace-pre text-[11px] leading-5 pr-2 overflow-hidden",
                  oLine !== undefined ? "text-green-50/90" : "",
                )}>
                  {oLine ?? " "}
                </span>
              </div>
              {/* Middle – result */}
              <div className={cn("flex min-w-0 border-r border-border/20", resColor)}>
                <GutterNum n={rLine !== undefined ? j + 1 : ""} />
                {rLine !== undefined ? (
                  <span className="flex-1 whitespace-pre text-[11px] leading-5 text-foreground pr-2 overflow-hidden">
                    {rLine || " "}
                  </span>
                ) : (
                  <span className="flex-1 text-[10px] text-muted-foreground/25 italic leading-5 select-none">
                    ← choose →
                  </span>
                )}
              </div>
              {/* Right – theirs */}
              <div className={cn(
                "flex min-w-0",
                tLine !== undefined ? "bg-blue-900/30 border-l-2 border-l-blue-500/55" : "bg-muted/4",
              )}>
                <GutterNum n={tLine !== undefined ? j + 1 : ""} />
                <span className={cn(
                  "flex-1 whitespace-pre text-[11px] leading-5 pr-2 overflow-hidden",
                  tLine !== undefined ? "text-blue-50/90" : "",
                )}>
                  {tLine ?? " "}
                </span>
              </div>
            </div>
          );
        })
      )}

      {/* ── Manual edit toggle ── */}
      {!resolution && (
        <div className="flex items-center justify-center py-1 bg-muted/4 border-t border-border/10">
          <button
            onClick={e => {
              e.stopPropagation();
              const draft = customDraft ?? section.ours.join("\n");
              onResolve("custom", draft);
            }}
            className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            <Edit3 size={9} /> Edit manually
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface Props {
  repoPath: string;
  filePath: string;
  onResolved?: () => void;
}

export function ConflictViewer({ repoPath, filePath, onResolved }: Props) {
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Map<number, ResolutionEntry>>(new Map());
  const [customDrafts, setCustomDrafts] = useState<Map<number, string>>(new Map());
  const [applying, setApplying] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const conflictEls = useRef<Map<number, HTMLElement>>(new Map());

  useEffect(() => {
    setLoading(true);
    setError(null);
    setResolutions(new Map());
    setCustomDrafts(new Map());
    git.getFileContent(repoPath, filePath)
      .then(c => { setParsed(parseConflicts(c)); setActiveIdx(0); })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [repoPath, filePath]);

  const resolve = useCallback((idx: number, kind: Resolution, customText?: string) => {
    setResolutions(prev => new Map(prev).set(idx, { kind, customText }));
  }, []);

  const clear = useCallback((idx: number) => {
    setResolutions(prev => { const m = new Map(prev); m.delete(idx); return m; });
  }, []);

  const goTo = useCallback((idx: number) => {
    if (!parsed) return;
    const clamped = Math.max(0, Math.min(parsed.sections.length - 1, idx));
    setActiveIdx(clamped);
    conflictEls.current.get(clamped)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [parsed]);

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "ArrowDown") { e.preventDefault(); goTo(activeIdx + 1); }
      if ((e.ctrlKey || e.metaKey) && e.key === "ArrowUp") { e.preventDefault(); goTo(activeIdx - 1); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeIdx, goTo]);

  const apply = async () => {
    if (!parsed) return;
    setApplying(true);
    try {
      const content = buildResultContent(parsed.rawLines, parsed.sections, resolutions);
      await git.writeFileContent(repoPath, filePath, content);
      await git.stageFile(repoPath, filePath);
      toast.success(`Conflicts resolved in ${filePath}`);
      onResolved?.();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setApplying(false);
    }
  };

  const totalCount = parsed?.sections.length ?? 0;
  const resolvedCount = resolutions.size;
  const allResolved = totalCount > 0 && resolvedCount === totalCount;
  const segments = parsed ? buildSegments(parsed) : [];

  // ── Loading / error ──
  if (loading) return (
    <div className="flex items-center justify-center h-full gap-2">
      <Loader2 size={14} className="animate-spin text-muted-foreground" />
      <span className="text-xs text-muted-foreground">Loading…</span>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center h-full px-4">
      <p className="text-xs text-destructive text-center">{error}</p>
    </div>
  );

  if (!parsed || parsed.sections.length === 0) return (
    <div className="flex items-center justify-center h-full">
      <p className="text-xs text-muted-foreground">No conflict markers found</p>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden font-mono">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card shrink-0 flex-wrap">
        <ArrowLeftRight size={12} className="text-yellow-400 shrink-0" />
        <span className="text-xs text-foreground/70 truncate flex-1 min-w-0">{filePath}</span>

        {/* Navigation */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => goTo(activeIdx - 1)}
            disabled={activeIdx === 0}
            title="Previous conflict (Ctrl+↑)"
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/30 disabled:opacity-30 transition-colors"
          >
            <ChevronUp size={12} />
          </button>
          <span className="text-[10px] text-muted-foreground tabular-nums px-1 min-w-[72px] text-center">
            {resolvedCount}/{totalCount} resolved
          </span>
          <button
            onClick={() => goTo(activeIdx + 1)}
            disabled={activeIdx >= totalCount - 1}
            title="Next conflict (Ctrl+↓)"
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/30 disabled:opacity-30 transition-colors"
          >
            <ChevronDown size={12} />
          </button>
        </div>

        {/* Apply */}
        <button
          onClick={apply}
          disabled={!allResolved || applying}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          {applying && <Loader2 size={11} className="animate-spin" />}
          {applying ? "Staging…" : "Mark Resolved & Stage"}
        </button>
      </div>

      {/* ── Column headers ── */}
      <div className="grid grid-cols-3 shrink-0 bg-card border-b border-border text-[10px] font-semibold uppercase tracking-wider">
        <div className="px-3 py-1.5 text-green-400 border-r border-border">Local (Ours)</div>
        <div className="px-3 py-1.5 text-muted-foreground border-r border-border">Result</div>
        <div className="px-3 py-1.5 text-blue-400">Incoming (Theirs)</div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {segments.map((seg, i) => {
          if (seg.kind === "context") {
            return (
              <div key={`ctx-${i}`}>
                {seg.lines.map((line, j) => (
                  <CtxRow key={j} line={line} lineNum={seg.firstLineNum + j} />
                ))}
              </div>
            );
          }

          const { section } = seg;
          return (
            <div
              key={`conflict-${section.idx}`}
              ref={el => { if (el) conflictEls.current.set(section.idx, el); }}
            >
              <ConflictBlock
                section={section}
                resolution={resolutions.get(section.idx)}
                customDraft={customDrafts.get(section.idx)}
                isActive={section.idx === activeIdx}
                onActivate={() => setActiveIdx(section.idx)}
                onResolve={(kind, custom) => resolve(section.idx, kind, custom)}
                onClear={() => clear(section.idx)}
                onCustomChange={text => {
                  setCustomDrafts(prev => new Map(prev).set(section.idx, text));
                  resolve(section.idx, "custom", text);
                }}
              />
            </div>
          );
        })}
      </div>

      {/* ── Footer minimap ── */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-t border-border bg-card shrink-0">
        {/* Dot indicators per conflict */}
        <div className="flex gap-1 items-center">
          {parsed.sections.map(s => (
            <button
              key={s.idx}
              onClick={() => goTo(s.idx)}
              title={`Conflict ${s.idx + 1}`}
              className={cn(
                "w-2 h-2 rounded-full transition-all",
                resolutions.has(s.idx)
                  ? "bg-green-500"
                  : s.idx === activeIdx
                  ? "bg-yellow-400 scale-125"
                  : "bg-yellow-700/60 hover:bg-yellow-500/80",
              )}
            />
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground flex-1 text-right">
          {allResolved
            ? "All conflicts resolved — ready to stage"
            : `${totalCount - resolvedCount} conflict${totalCount - resolvedCount !== 1 ? "s" : ""} remaining`}
        </span>
      </div>
    </div>
  );
}
