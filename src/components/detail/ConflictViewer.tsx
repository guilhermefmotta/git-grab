import { useEffect, useState } from "react";
import { CheckCircle, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { git } from "@/lib/tauri";

// ── types ──────────────────────────────────────────────────────────────────

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

type Resolution = "ours" | "theirs" | "both";

type Row =
  | { kind: "ctx"; lineNum: number; text: string }
  | { kind: "chdr"; si: number; oursLabel: string; theirsLabel: string }
  | { kind: "cline"; si: number; j: number; oursLine: string | undefined; theirsLine: string | undefined };

// ── parsing ────────────────────────────────────────────────────────────────

function parseConflicts(content: string): ParsedFile {
  const rawLines = content.split("\n");
  const sections: ConflictSection[] = [];
  let i = 0;
  let idx = 0;

  while (i < rawLines.length) {
    if (rawLines[i].startsWith("<<<<<<<")) {
      const startLine = i;
      const oursLabel = rawLines[i].slice(8).trim() || "HEAD";
      const ours: string[] = [];
      const theirs: string[] = [];
      i++;
      while (i < rawLines.length && !rawLines[i].startsWith("=======")) {
        ours.push(rawLines[i]);
        i++;
      }
      i++;
      while (i < rawLines.length && !rawLines[i].startsWith(">>>>>>>")) {
        theirs.push(rawLines[i]);
        i++;
      }
      const theirsLabel = rawLines[i]?.slice(8).trim() || "incoming";
      const endLine = i;
      i++;
      sections.push({ idx: idx++, oursLabel, theirsLabel, ours, theirs, startLine, endLine });
    } else {
      i++;
    }
  }
  return { sections, rawLines };
}

function applyResolutions(
  rawLines: string[],
  resolutions: Map<number, Resolution>,
  sections: ConflictSection[],
): string {
  const result: string[] = [];
  let i = 0;
  let si = 0;
  while (i < rawLines.length) {
    const section = sections[si];
    if (section && i === section.startLine) {
      const r = resolutions.get(section.idx) ?? "ours";
      if (r === "ours" || r === "both") result.push(...section.ours);
      if (r === "theirs" || r === "both") result.push(...section.theirs);
      i = section.endLine + 1;
      si++;
    } else {
      result.push(rawLines[i]);
      i++;
    }
  }
  return result.join("\n");
}

function buildRows(parsed: ParsedFile): Row[] {
  const rows: Row[] = [];
  let i = 0;
  let si = 0;
  let lineNum = 0;

  while (i < parsed.rawLines.length) {
    const section = parsed.sections[si];
    if (section && i === section.startLine) {
      rows.push({ kind: "chdr", si: section.idx, oursLabel: section.oursLabel, theirsLabel: section.theirsLabel });
      const maxLen = Math.max(section.ours.length, section.theirs.length, 1);
      for (let j = 0; j < maxLen; j++) {
        rows.push({ kind: "cline", si: section.idx, j, oursLine: section.ours[j], theirsLine: section.theirs[j] });
      }
      i = section.endLine + 1;
      si++;
    } else {
      lineNum++;
      rows.push({ kind: "ctx", lineNum, text: parsed.rawLines[i] });
      i++;
    }
  }
  return rows;
}

// ── cell helpers ───────────────────────────────────────────────────────────

function LineNum({ n }: { n: number | "" }) {
  return (
    <span className="w-9 shrink-0 text-right pr-2 text-muted-foreground/40 select-none text-[10px] leading-5 tabular-nums">
      {n}
    </span>
  );
}

function CtxCell({ lineNum, text, border }: { lineNum: number; text: string; border?: boolean }) {
  return (
    <div className={cn("flex flex-1 min-w-0 items-start", border && "border-r border-border/20")}>
      <LineNum n={lineNum} />
      <span className="flex-1 whitespace-pre text-[11px] leading-5 text-foreground pr-2 overflow-hidden">
        {text}
      </span>
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────

interface Props {
  repoPath: string;
  filePath: string;
  onResolved?: () => void;
}

export function ConflictViewer({ repoPath, filePath, onResolved }: Props) {
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Map<number, Resolution>>(new Map());
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setResolutions(new Map());
    git
      .getFileContent(repoPath, filePath)
      .then((c) => setParsed(parseConflicts(c)))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [repoPath, filePath]);

  const resolve = (idx: number, r: Resolution) =>
    setResolutions((prev) => new Map(prev).set(idx, r));

  const clear = (idx: number) =>
    setResolutions((prev) => {
      const next = new Map(prev);
      next.delete(idx);
      return next;
    });

  const allResolved = parsed !== null && parsed.sections.every((s) => resolutions.has(s.idx));

  const apply = async () => {
    if (!parsed) return;
    setApplying(true);
    try {
      const content = applyResolutions(parsed.rawLines, resolutions, parsed.sections);
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

  const sectionMap = new Map(parsed?.sections.map((s) => [s.idx, s]) ?? []);
  const rows = parsed ? buildRows(parsed) : [];

  return (
    <div className="flex flex-col h-full overflow-hidden font-mono">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card shrink-0">
        <span className="text-xs text-foreground truncate flex-1">{filePath}</span>
        {parsed && (
          <span className="text-[10px] text-muted-foreground shrink-0">
            {resolutions.size}/{parsed.sections.length} resolved
          </span>
        )}
        <button
          onClick={apply}
          disabled={!allResolved || applying}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          {applying && <Loader2 size={11} className="animate-spin" />}
          {applying ? "Applying…" : "Mark as Resolved & Stage"}
        </button>
      </div>

      {/* Column headers */}
      <div className="flex border-b border-border shrink-0 bg-card">
        <div className="flex-1 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-green-400 border-r border-border">
          Local (Ours)
        </div>
        <div className="flex-1 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-r border-border">
          Result
        </div>
        <div className="flex-1 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-blue-400">
          Incoming (Theirs)
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading && (
          <div className="flex items-center justify-center h-full gap-2">
            <Loader2 size={14} className="animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Loading…</span>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-destructive px-4 text-center">{error}</p>
          </div>
        )}
        {parsed && parsed.sections.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-muted-foreground">No conflict markers found</p>
          </div>
        )}

        {rows.map((row, i) => {
          // ── context row ─────────────────────────────────────────────────
          if (row.kind === "ctx") {
            return (
              <div key={i} className="flex border-b border-border/5 hover:bg-accent/10">
                <CtxCell lineNum={row.lineNum} text={row.text} border />
                <CtxCell lineNum={row.lineNum} text={row.text} border />
                <CtxCell lineNum={row.lineNum} text={row.text} />
              </div>
            );
          }

          // ── conflict header ─────────────────────────────────────────────
          if (row.kind === "chdr") {
            const res = resolutions.get(row.si);
            return (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border-y border-yellow-500/20 flex-wrap"
              >
                <span className="text-[10px] font-semibold text-yellow-400 uppercase tracking-wider shrink-0">
                  Conflict {row.si + 1}
                </span>
                <span className="text-[10px] text-green-400/70 truncate max-w-[120px]">
                  ← {row.oursLabel}
                </span>

                {!res ? (
                  <>
                    <button
                      onClick={() => resolve(row.si, "ours")}
                      className="px-2 py-0.5 text-[10px] rounded bg-green-900/60 border border-green-700/60 text-green-300 hover:bg-green-800/70 transition-colors"
                    >
                      Accept Ours
                    </button>
                    <button
                      onClick={() => resolve(row.si, "both")}
                      className="px-2 py-0.5 text-[10px] rounded bg-secondary border border-border text-secondary-foreground hover:bg-secondary/80 transition-colors"
                    >
                      Accept Both
                    </button>
                    <button
                      onClick={() => resolve(row.si, "theirs")}
                      className="px-2 py-0.5 text-[10px] rounded bg-blue-900/60 border border-blue-700/60 text-blue-300 hover:bg-blue-800/70 transition-colors"
                    >
                      Accept Theirs
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex items-center gap-1 text-[10px] text-green-400">
                      <CheckCircle size={10} />
                      {res === "ours" ? "Accepted Ours" : res === "theirs" ? "Accepted Theirs" : "Accepted Both"}
                    </span>
                    <button
                      onClick={() => clear(row.si)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title="Clear resolution"
                    >
                      <X size={11} />
                    </button>
                  </>
                )}

                <span className="text-[10px] text-blue-400/70 truncate max-w-[120px] ml-auto">
                  {row.theirsLabel} →
                </span>
              </div>
            );
          }

          // ── conflict line ───────────────────────────────────────────────
          const res = resolutions.get(row.si);
          const section = sectionMap.get(row.si)!;

          let middleLine: string | undefined;
          if (res === "ours") {
            middleLine = row.oursLine;
          } else if (res === "theirs") {
            middleLine = row.theirsLine;
          } else if (res === "both") {
            // show ours rows first, then theirs rows
            if (row.j < section.ours.length) {
              middleLine = section.ours[row.j];
            } else {
              middleLine = section.theirs[row.j - section.ours.length];
            }
          }

          return (
            <div key={i} className="flex border-b border-border/5">
              {/* Left – ours */}
              <div
                className={cn(
                  "flex flex-1 min-w-0 items-start border-r border-border/20",
                  row.oursLine !== undefined ? "bg-green-950/40" : "bg-muted/5",
                )}
              >
                <LineNum n={row.oursLine !== undefined ? row.j + 1 : ""} />
                <span className="flex-1 whitespace-pre text-[11px] leading-5 text-green-100 pr-2 overflow-hidden">
                  {row.oursLine ?? " "}
                </span>
              </div>

              {/* Middle – result */}
              <div
                className={cn(
                  "flex flex-1 min-w-0 items-start border-r border-border/20",
                  res === "ours"
                    ? "bg-green-950/20"
                    : res === "theirs"
                    ? "bg-blue-950/20"
                    : res === "both"
                    ? "bg-purple-950/20"
                    : "bg-muted/10",
                )}
              >
                <LineNum n={middleLine !== undefined ? row.j + 1 : ""} />
                {middleLine !== undefined ? (
                  <span className="flex-1 whitespace-pre text-[11px] leading-5 text-foreground pr-2 overflow-hidden">
                    {middleLine}
                  </span>
                ) : (
                  <span className="flex-1 text-[10px] text-muted-foreground/25 italic leading-5">
                    ← choose →
                  </span>
                )}
              </div>

              {/* Right – theirs */}
              <div
                className={cn(
                  "flex flex-1 min-w-0 items-start",
                  row.theirsLine !== undefined ? "bg-blue-950/40" : "bg-muted/5",
                )}
              >
                <LineNum n={row.theirsLine !== undefined ? row.j + 1 : ""} />
                <span className="flex-1 whitespace-pre text-[11px] leading-5 text-blue-100 pr-2 overflow-hidden">
                  {row.theirsLine ?? " "}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer status */}
      {parsed && parsed.sections.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 border-t border-border bg-card shrink-0">
          <span className="text-[10px] text-muted-foreground flex-1">
            {!allResolved
              ? `${parsed.sections.length - resolutions.size} conflict${parsed.sections.length - resolutions.size !== 1 ? "s" : ""} remaining`
              : "All conflicts resolved — ready to stage"}
          </span>
        </div>
      )}
    </div>
  );
}
