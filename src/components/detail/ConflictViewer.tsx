import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { git } from "@/lib/tauri";
import { useStatus } from "@/hooks/useStatus";

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
      i++; // skip =======

      let theirsLabel = "";
      while (i < rawLines.length && !rawLines[i].startsWith(">>>>>>>")) {
        theirs.push(rawLines[i]);
        i++;
      }
      theirsLabel = rawLines[i]?.slice(8).trim() || "incoming";
      const endLine = i;
      i++;

      sections.push({ idx: idx++, oursLabel, theirsLabel, ours, theirs, startLine, endLine });
    } else {
      i++;
    }
  }

  return { sections, rawLines };
}

type Resolution = "ours" | "theirs" | "both";

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

function ConflictBlock({
  section,
  resolution,
  onResolve,
  onClear,
}: {
  section: ConflictSection;
  resolution: Resolution | undefined;
  onResolve: (r: Resolution) => void;
  onClear: () => void;
}) {
  const maxLines = Math.max(section.ours.length, section.theirs.length);

  return (
    <div className={cn("border-b border-border", resolution && "opacity-70")}>
      {/* Section label */}
      <div className="flex items-center gap-2 px-3 py-1 bg-yellow-500/10 border-b border-yellow-500/20">
        <span className="text-[10px] font-semibold text-yellow-400 uppercase tracking-wider">
          Conflict {section.idx + 1}
        </span>
        {resolution && (
          <span className="flex items-center gap-1 text-[10px] text-green-400 ml-2">
            <CheckCircle size={10} />
            {resolution === "ours" ? "Accepted ours" : resolution === "theirs" ? "Accepted theirs" : "Accepted both"}
          </span>
        )}
        {resolution && (
          <button onClick={onClear} className="ml-auto text-muted-foreground hover:text-foreground">
            <X size={11} />
          </button>
        )}
      </div>

      {/* Branch labels */}
      <div className="flex border-b border-border/50 bg-card/30">
        <div className="flex-1 px-3 py-0.5 text-[10px] text-green-400/80 border-r border-border/50 truncate">
          ← {section.oursLabel}
        </div>
        <div className="flex-1 px-3 py-0.5 text-[10px] text-blue-400/80 truncate">
          {section.theirsLabel} →
        </div>
      </div>

      {/* Lines */}
      {Array.from({ length: maxLines }, (_, j) => (
        <div key={j} className="flex border-b border-border/10">
          {/* Ours */}
          <div
            className={cn(
              "flex flex-1 min-w-0 border-r border-border/30",
              section.ours[j] !== undefined ? "bg-green-950/40" : "bg-muted/5",
            )}
          >
            <span className="w-8 shrink-0 text-right pr-2 text-muted-foreground/40 select-none text-[10px] leading-5 tabular-nums">
              {section.ours[j] !== undefined ? j + 1 : ""}
            </span>
            <span className="flex-1 whitespace-pre-wrap break-all pr-2 leading-5 text-[11px] text-green-100 min-w-0">
              {section.ours[j] ?? ""}
            </span>
          </div>
          {/* Theirs */}
          <div
            className={cn(
              "flex flex-1 min-w-0",
              section.theirs[j] !== undefined ? "bg-blue-950/40" : "bg-muted/5",
            )}
          >
            <span className="w-8 shrink-0 text-right pr-2 text-muted-foreground/40 select-none text-[10px] leading-5 tabular-nums">
              {section.theirs[j] !== undefined ? j + 1 : ""}
            </span>
            <span className="flex-1 whitespace-pre-wrap break-all pr-2 leading-5 text-[11px] text-blue-100 min-w-0">
              {section.theirs[j] ?? ""}
            </span>
          </div>
        </div>
      ))}

      {/* Resolution buttons */}
      <div className="flex items-center gap-2 px-3 py-2 bg-card/40 border-t border-border/30">
        {(["ours", "theirs", "both"] as Resolution[]).map((r) => (
          <button
            key={r}
            onClick={() => onResolve(r)}
            className={cn(
              "px-2.5 py-1 text-[10px] rounded capitalize transition-colors border",
              resolution === r
                ? r === "ours"
                  ? "bg-green-700 border-green-600 text-white"
                  : r === "theirs"
                  ? "bg-blue-700 border-blue-600 text-white"
                  : "bg-primary border-primary text-primary-foreground"
                : r === "ours"
                ? "bg-green-950/40 border-green-800/50 text-green-400 hover:bg-green-900/50"
                : r === "theirs"
                ? "bg-blue-950/40 border-blue-800/50 text-blue-400 hover:bg-blue-900/50"
                : "bg-secondary border-border text-secondary-foreground hover:bg-secondary/80",
            )}
          >
            Accept {r}
          </button>
        ))}
      </div>
    </div>
  );
}

interface Props {
  repoPath: string;
  filePath: string;
  onBack: () => void;
  onResolved: () => void;
}

export function ConflictViewer({ repoPath, filePath, onBack, onResolved }: Props) {
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Map<number, Resolution>>(new Map());
  const [applying, setApplying] = useState(false);
  const { stageFile } = useStatus();

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
      await stageFile(filePath);
      toast.success(`Conflicts resolved in ${filePath}`);
      onResolved();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={13} />
          Back
        </button>
        <span className="text-xs text-foreground truncate flex-1 ml-1">{filePath}</span>
        {parsed && (
          <span className="text-[10px] text-muted-foreground shrink-0">
            {resolutions.size}/{parsed.sections.length} resolved
          </span>
        )}
      </div>

      {/* Column headers */}
      <div className="flex border-b border-border shrink-0">
        <div className="flex-1 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-green-400 border-r border-border">
          Current (Ours)
        </div>
        <div className="flex-1 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-blue-400">
          Incoming (Theirs)
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 font-mono">
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
        {parsed?.sections.map((section) => (
          <ConflictBlock
            key={section.idx}
            section={section}
            resolution={resolutions.get(section.idx)}
            onResolve={(r) => resolve(section.idx, r)}
            onClear={() => clear(section.idx)}
          />
        ))}
      </div>

      {/* Footer */}
      {parsed && parsed.sections.length > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 border-t border-border bg-card shrink-0">
          <span className="text-[10px] text-muted-foreground flex-1">
            {!allResolved
              ? `${parsed.sections.length - resolutions.size} conflict${parsed.sections.length - resolutions.size !== 1 ? "s" : ""} remaining`
              : "All conflicts resolved — ready to stage"}
          </span>
          <button
            onClick={apply}
            disabled={!allResolved || applying}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {applying && <Loader2 size={11} className="animate-spin" />}
            {applying ? "Applying…" : "Mark as Resolved & Stage"}
          </button>
        </div>
      )}
    </div>
  );
}
