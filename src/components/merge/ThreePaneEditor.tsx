/**
 * IntelliJ-style 3-pane merge editor.
 *
 * Left  (read-only): full `ours` content, conflict lines highlighted green.
 * Center (editable): full merged document with CodeMirror. Conflict marker
 *                    blocks are highlighted; accepting replaces them in place.
 * Right (read-only): full `theirs` content, conflict lines highlighted blue.
 *
 * Phantom lines keep all three panes the same total height so a single outer
 * scroll container aligns them perfectly.
 */

import {
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import { EditorView } from "@codemirror/view";
import {
  ChevronsLeft, ChevronsRight, ChevronDown, ChevronUp,
  CheckCircle, SkipForward, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { git } from "@/lib/tauri";
import { parseSegments } from "@/lib/conflictParser";
import type { ConflictContent, ConflictStatus } from "@/lib/mergeTypes";
import { getLanguage } from "./cm/lang";
import {
  conflictRangesField, centerConflictPlugin, centerPhantomDecoField, setConflictRanges,
  phantomLinesField, setPhantomLines, parseConflictRanges,
  sidePaneConflictsField, sidePanePlugin, sidePanePhantomDecoField, setSidePaneConflicts,
  type ConflictRange, type SidePaneConflict,
} from "./cm/conflictExt";
import { makeReadonlyEditor, makeEditableEditor } from "./cm/editor";

// ── Constants ─────────────────────────────────────────────────────────────────

const LINE_H = 20;

// ── History stack for conflict states ─────────────────────────────────────────

class ConflictHistory {
  private stack: string[] = [];
  private idx = -1;
  private readonly limit = 100;

  push(doc: string) {
    this.stack = this.stack.slice(0, this.idx + 1);
    this.stack.push(doc);
    if (this.stack.length > this.limit) this.stack.shift();
    this.idx = this.stack.length - 1;
  }

  undo(): string | null {
    if (this.idx <= 0) return null;
    this.idx--;
    return this.stack[this.idx];
  }

  redo(): string | null {
    if (this.idx >= this.stack.length - 1) return null;
    this.idx++;
    return this.stack[this.idx];
  }
}

// ── ThreePaneEditor ───────────────────────────────────────────────────────────

export interface ThreePaneEditorProps {
  repoPath: string;
  filePath: string;
  content: ConflictContent;
  onStaged: () => void;
  onSkip: () => void;
}

export function ThreePaneEditor({
  repoPath, filePath, content, onStaged, onSkip,
}: ThreePaneEditorProps) {
  // ── Refs for CM editors ──────────────────────────────────────────────────────
  const leftRef    = useRef<HTMLDivElement>(null);
  const centerRef  = useRef<HTMLDivElement>(null);
  const rightRef   = useRef<HTMLDivElement>(null);
  const leftView   = useRef<EditorView | null>(null);
  const centerView = useRef<EditorView | null>(null);
  const rightView  = useRef<EditorView | null>(null);

  // ── State ──────────────────────────────────────────────────────────────────
  const [centerDoc, setCenterDoc] = useState(content.merged);
  const [activeConflict, setActiveConflict] = useState(0);
  const [staging, setStaging] = useState(false);
  const histRef = useRef(new ConflictHistory());

  // Initial segment parse for ours/theirs line ranges (fixed at load time)
  const segs = useMemo(() => parseSegments(content.merged), [content.merged]);

  // ── Parse conflict ranges from initial segments ───────────────────────────
  const initialConflicts = useMemo(() => {
    const res: Array<{
      idx: number;
      oursLines: string[];
      theirsLines: string[];
      ourLabel: string;
      theirLabel: string;
    }> = [];
    for (const seg of segs) {
      if (seg.kind === "conflict") {
        res.push(seg.section);
      }
    }
    return res;
  }, [segs]);

  const total = initialConflicts.length;

  // ── Compute ours/theirs line ranges in the side panes ────────────────────
  const sideRanges = useMemo(() => {
    let oursLine = 1, theirsLine = 1;
    const oursConflicts: SidePaneConflict[]   = [];
    const theirsConflicts: SidePaneConflict[] = [];

    for (const seg of segs) {
      if (seg.kind === "context") {
        oursLine   += seg.lines.length;
        theirsLine += seg.lines.length;
      } else {
        const { oursLines, theirsLines } = seg.section;
        oursConflicts.push({
          startLine: oursLine,
          endLine: oursLine + oursLines.length - 1,
          side: "ours",
          phantomAfter: 0, // computed below
        });
        theirsConflicts.push({
          startLine: theirsLine,
          endLine: theirsLine + theirsLines.length - 1,
          side: "theirs",
          phantomAfter: 0,
        });
        oursLine   += oursLines.length;
        theirsLine += theirsLines.length;
      }
    }
    return { oursConflicts, theirsConflicts };
  }, [segs]);

  // ── Status tracking: Map<conflictIdx → status> from center doc ───────────
  const [conflictStateMap, setConflictStateMap] = useState<Map<number, ConflictStatus>>(new Map());

  const updateConflictStates = useCallback((doc: string) => {
    const m = new Map<number, ConflictStatus>();
    for (const ic of initialConflicts) {
      const hasMarker = doc.includes(`<<<<<<< ${ic.ourLabel}`) || doc.includes(`>>>>>>> ${ic.theirLabel}`);
      m.set(ic.idx, hasMarker ? "unresolved" : "manual");
    }
    setConflictStateMap(m);
  }, [initialConflicts]);

  const resolvedCount = useMemo(
    () => [...conflictStateMap.values()].filter(v => v !== "unresolved").length,
    [conflictStateMap],
  );
  const allDone = resolvedCount === total; // total=0 means diffy resolved cleanly

  // ── Compute phantom lines for alignment ───────────────────────────────────
  const phantomData = useMemo(() => {
    // For each conflict i:
    // center_lines_i = current line count in center for this conflict
    // ours_lines_i = fixed
    // theirs_lines_i = fixed
    // max_i = max of all three
    // phantom_left_i = max_i - ours_lines_i
    // phantom_right_i = max_i - theirs_lines_i
    // phantom_center_i = max_i - center_lines_i (added after conflict region)

    const centerRanges = parseConflictRanges(centerDoc);
    const oursPhantoms: Array<{ afterEndLine: number; height: number }>   = [];
    const theirsPhantoms: Array<{ afterEndLine: number; height: number }> = [];
    const centerPhantoms: Array<{ pos: number; height: number }>          = [];

    for (let i = 0; i < initialConflicts.length; i++) {
      const ic = initialConflicts[i];
      const oursLines   = ic.oursLines.length;
      const theirsLines = ic.theirsLines.length;

      // Find corresponding center range by checking if marker is present
      // Use remaining centerRanges in order (approximate)
      let centerLines = 0;
      if (i < centerRanges.length) {
        const cr = centerRanges[i];
        const sub = centerDoc.slice(cr.markerFrom, cr.markerTo);
        centerLines = sub.split("\n").length;
      } else {
        // Resolved — content is oursLines or theirsLines (we can't know which exactly)
        centerLines = Math.max(oursLines, theirsLines); // safe estimate
      }

      const maxLines = Math.max(oursLines, theirsLines, centerLines, 1);

      // Left phantom (add after ours conflict region)
      const oursConfl = sideRanges.oursConflicts[i];
      if (oursConfl && maxLines > oursLines) {
        oursPhantoms.push({ afterEndLine: oursConfl.endLine, height: (maxLines - oursLines) * LINE_H });
      }

      // Right phantom (add after theirs conflict region)
      const theirsConfl = sideRanges.theirsConflicts[i];
      if (theirsConfl && maxLines > theirsLines) {
        theirsPhantoms.push({ afterEndLine: theirsConfl.endLine, height: (maxLines - theirsLines) * LINE_H });
      }

      // Center phantom (add after center conflict region, if center is shorter)
      if (i < centerRanges.length && maxLines > centerLines) {
        const cr = centerRanges[i];
        centerPhantoms.push({ pos: cr.markerTo, height: (maxLines - centerLines) * LINE_H });
      }
    }

    return { oursPhantoms, theirsPhantoms, centerPhantoms };
  }, [centerDoc, initialConflicts, sideRanges]);

  // ── Initialize CM editors ─────────────────────────────────────────────────
  useEffect(() => {
    if (!leftRef.current || !centerRef.current || !rightRef.current) return;

    const lang = getLanguage(filePath);
    const sharedExtras = lang ? [lang] : [];

    // Left pane
    leftView.current = makeReadonlyEditor(leftRef.current, content.ours, [
      ...sharedExtras,
      sidePaneConflictsField,
      sidePanePhantomDecoField,
      sidePanePlugin,
    ]);

    // Center pane
    centerView.current = makeEditableEditor(centerRef.current, content.merged, [
      ...sharedExtras,
      conflictRangesField,
      phantomLinesField,
      centerPhantomDecoField,
      centerConflictPlugin,
    ], (doc) => {
      setCenterDoc(doc);
      histRef.current.push(doc);
      updateConflictStates(doc);
    });

    // Right pane
    rightView.current = makeReadonlyEditor(rightRef.current, content.theirs, [
      ...sharedExtras,
      sidePaneConflictsField,
      sidePanePhantomDecoField,
      sidePanePlugin,
    ]);

    // Push initial history entry
    histRef.current.push(content.merged);
    updateConflictStates(content.merged);

    return () => {
      leftView.current?.destroy();
      centerView.current?.destroy();
      rightView.current?.destroy();
    };
  }, [filePath, content]);

  // ── Update CM decorations when centerDoc or phantoms change ───────────────
  useEffect(() => {
    const cv = centerView.current;
    if (!cv) return;

    const ranges: ConflictRange[] = parseConflictRanges(centerDoc).map((r, i) => ({
      ...r,
      idx: i,
      status: conflictStateMap.get(i) ?? "unresolved",
    }));

    cv.dispatch({
      effects: [
        setConflictRanges.of(ranges),
        setPhantomLines.of(phantomData.centerPhantoms),
      ],
    });
  }, [centerDoc, conflictStateMap, phantomData]);

  // ── Update side pane decorations ──────────────────────────────────────────
  useEffect(() => {
    const lv = leftView.current;
    const rv = rightView.current;
    if (!lv || !rv) return;

    const oursWithPhantoms: SidePaneConflict[] = sideRanges.oursConflicts.map(c => ({
      ...c,
      phantomAfter: phantomData.oursPhantoms.find(p => p.afterEndLine === c.endLine)?.height ?? 0,
    }));
    const theirsWithPhantoms: SidePaneConflict[] = sideRanges.theirsConflicts.map(c => ({
      ...c,
      phantomAfter: phantomData.theirsPhantoms.find(p => p.afterEndLine === c.endLine)?.height ?? 0,
    }));

    lv.dispatch({ effects: [setSidePaneConflicts.of(oursWithPhantoms)] });
    rv.dispatch({ effects: [setSidePaneConflicts.of(theirsWithPhantoms)] });
  }, [sideRanges, phantomData]);

  // ── Scroll sync ───────────────────────────────────────────────────────────
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const cv = centerView.current;
    const lv = leftView.current;
    const rv = rightView.current;
    const container = scrollContainerRef.current;
    if (!cv || !lv || !rv || !container) return;

    let syncing = false;
    const onCenterScroll = () => {
      if (syncing) return;
      syncing = true;
      requestAnimationFrame(() => {
        const top = cv.scrollDOM.scrollTop;
        lv.scrollDOM.scrollTop = top;
        rv.scrollDOM.scrollTop = top;
        container.scrollTop = top;
        syncing = false;
      });
    };
    const onSideScroll = (src: EditorView) => () => {
      if (syncing) return;
      syncing = true;
      requestAnimationFrame(() => {
        const top = src.scrollDOM.scrollTop;
        cv.scrollDOM.scrollTop = top;
        lv.scrollDOM.scrollTop = top;
        rv.scrollDOM.scrollTop = top;
        syncing = false;
      });
    };

    cv.scrollDOM.addEventListener("scroll", onCenterScroll, { passive: true });
    lv.scrollDOM.addEventListener("scroll", onSideScroll(lv), { passive: true });
    rv.scrollDOM.addEventListener("scroll", onSideScroll(rv), { passive: true });
    return () => {
      cv.scrollDOM.removeEventListener("scroll", onCenterScroll);
      lv.scrollDOM.removeEventListener("scroll", onSideScroll(lv));
      rv.scrollDOM.removeEventListener("scroll", onSideScroll(rv));
    };
  }, []);

  // ── Accept ours / theirs / both for conflict i ────────────────────────────
  const acceptConflict = useCallback((conflictIdx: number, kind: "ours" | "theirs" | "both") => {
    const cv = centerView.current;
    if (!cv) return;

    const ranges = cv.state.field(conflictRangesField);
    const r = ranges[conflictIdx];
    if (!r) return;

    const ic = initialConflicts[conflictIdx];
    if (!ic) return;

    const oursContent   = ic.oursLines.join("\n");
    const theirsContent = ic.theirsLines.join("\n");
    const replacement   =
      kind === "ours"   ? oursContent
      : kind === "theirs" ? theirsContent
      : [oursContent, theirsContent].filter(Boolean).join("\n");

    const from = r.markerFrom;
    const to   = Math.min(r.markerTo, cv.state.doc.length);

    cv.dispatch({
      changes: { from, to, insert: replacement },
    });

    // Auto-advance to next unresolved
    goToConflict(conflictIdx + 1);
  }, [initialConflicts]);

  // ── Navigate to conflict i ────────────────────────────────────────────────
  const goToConflict = useCallback((i: number) => {
    const cv = centerView.current;
    if (!cv) return;

    const clamped = Math.max(0, Math.min(total - 1, i));
    setActiveConflict(clamped);

    // Scroll center to the conflict position
    const ranges = cv.state.field(conflictRangesField);
    const r = ranges[clamped];
    if (r) {
      cv.dispatch({ effects: EditorView.scrollIntoView(r.markerFrom, { y: "center" }) });
    }
  }, [total]);

  const goToNextUnresolved = useCallback(() => {
    const cv = centerView.current;
    if (!cv) return;
    const ranges = cv.state.field(conflictRangesField);
    if (ranges.length === 0) return;
    // Find next unresolved after activeConflict
    for (let d = 1; d <= total; d++) {
      const i = (activeConflict + d) % ranges.length;
      const r = ranges[i];
      if (r && r.status === "unresolved") {
        setActiveConflict(i);
        cv.dispatch({ effects: EditorView.scrollIntoView(r.markerFrom, { y: "center" }) });
        return;
      }
    }
  }, [activeConflict, total]);

  // Accept all one side
  const acceptAll = (kind: "ours" | "theirs") => {
    const cv = centerView.current;
    if (!cv) return;

    const ranges = [...cv.state.field(conflictRangesField)].reverse(); // apply back-to-front
    for (const r of ranges) {
      const idx = r.idx;
      const ic = initialConflicts[idx];
      if (!ic) continue;
      const replacement = kind === "ours" ? ic.oursLines.join("\n") : ic.theirsLines.join("\n");
      const from = r.markerFrom;
      const to   = Math.min(r.markerTo, cv.state.doc.length);
      cv.dispatch({ changes: { from, to, insert: replacement } });
    }
  };

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "ArrowDown") { e.preventDefault(); goToNextUnresolved(); }
      if (mod && e.key === "ArrowUp")   { e.preventDefault(); goToConflict(activeConflict - 1); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [activeConflict, goToConflict, goToNextUnresolved]);

  // ── Stage ─────────────────────────────────────────────────────────────────
  const stage = async () => {
    const cv = centerView.current;
    if (!cv) return;
    const doc = cv.state.doc.toString();

    if (doc.includes("<<<<<<<")) {
      toast.error("Unresolved conflict markers remain");
      return;
    }
    setStaging(true);
    try {
      await git.resolveConflict(repoPath, filePath, doc);
      toast.success(`Staged: ${filePath}`);
      onStaged();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setStaging(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const unresolvedTotal = parseConflictRanges(centerDoc).length;

  return (
    <div className="flex flex-col h-full overflow-hidden font-mono">

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card shrink-0 flex-wrap">
        <span className="text-xs text-muted-foreground truncate flex-1 min-w-0 font-mono">{filePath}</span>

        {total > 1 && (
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
          <button onClick={() => goToConflict(activeConflict - 1)} disabled={activeConflict === 0}
            className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 hover:bg-accent/30 transition-colors">
            <ChevronUp size={12} />
          </button>
          <span className="text-[10px] tabular-nums text-muted-foreground px-1 min-w-[72px] text-center">
            {total - unresolvedTotal}/{total} resolved
          </span>
          <button onClick={() => goToConflict(activeConflict + 1)} disabled={activeConflict >= total - 1}
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
      <div className="grid grid-cols-3 shrink-0 bg-card border-b border-border text-[10px] font-semibold uppercase tracking-wider">
        <div className="px-3 py-1.5 text-green-400/80">Local (Ours)</div>
        <div className="px-3 py-1.5 text-muted-foreground border-x border-border/20">
          Result <span className="normal-case font-normal text-muted-foreground/40 ml-1">— editable</span>
        </div>
        <div className="px-3 py-1.5 text-blue-400/80">Remote (Theirs)</div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 relative" ref={scrollContainerRef}>
        <div className="grid grid-cols-3 min-h-full">
          {/* Left pane — Accept Local button on the right edge */}
          <div className="relative overflow-hidden border-r border-border/20">
            <div ref={leftRef} />
            <SidePaneOverlay
              paneView={leftView}
              conflicts={sideRanges.oursConflicts}
              conflictStateMap={conflictStateMap}
              side="ours"
              onActivate={setActiveConflict}
              onAccept={acceptConflict}
            />
          </div>

          {/* Center pane — editable result */}
          <div className="relative overflow-hidden border-x border-border/20">
            <div ref={centerRef} />
          </div>

          {/* Right pane — Accept Remote button on the left edge */}
          <div className="relative overflow-hidden border-l border-border/20">
            <div ref={rightRef} />
            <SidePaneOverlay
              paneView={rightView}
              conflicts={sideRanges.theirsConflicts}
              conflictStateMap={conflictStateMap}
              side="theirs"
              onActivate={setActiveConflict}
              onAccept={acceptConflict}
            />
          </div>
        </div>
      </div>

      {/* Footer minimap */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-t border-border bg-card shrink-0">
        {initialConflicts.map((ic, i) => {
          const isResolved = (conflictStateMap.get(ic.idx) ?? "unresolved") !== "unresolved";
          return (
            <button key={ic.idx} onClick={() => goToConflict(i)}
              title={`Conflict ${i + 1}`}
              className={cn("w-2 h-2 rounded-full transition-all hover:scale-125",
                isResolved          ? "bg-green-500"
                : i === activeConflict ? "bg-yellow-400 scale-125"
                : "bg-yellow-700/50 hover:bg-yellow-500/60"
              )} />
          );
        })}
        <span className="text-[10px] text-muted-foreground flex-1 text-right">
          {allDone
            ? total === 0
              ? "No conflicts — click Stage File"
              : "All resolved — click Stage File"
            : `${unresolvedTotal} conflict${unresolvedTotal !== 1 ? "s" : ""} remaining`}
        </span>
      </div>
    </div>
  );
}

// ── Accept button overlaid on side panes ─────────────────────────────────────

function SidePaneOverlay({
  paneView, conflicts, conflictStateMap, side, onActivate, onAccept,
}: {
  paneView: React.RefObject<EditorView | null>;
  conflicts: SidePaneConflict[];
  conflictStateMap: Map<number, ConflictStatus>;
  side: "ours" | "theirs";
  onActivate: (i: number) => void;
  onAccept: (i: number, kind: "ours" | "theirs") => void;
}) {
  const [positions, setPositions] = useState<{ top: number; idx: number }[]>([]);

  useEffect(() => {
    const view = paneView.current;
    if (!view) return;

    const update = () => {
      const newPos = conflicts.map((c, i) => {
        try {
          const startLine = Math.max(1, Math.min(c.startLine, view.state.doc.lines));
          const lineFrom = view.state.doc.line(startLine).from;
          return { top: view.lineBlockAt(lineFrom).top, idx: i };
        } catch { return null; }
      }).filter(Boolean) as { top: number; idx: number }[];
      setPositions(newPos);
    };

    update();
    const obs = new MutationObserver(update);
    obs.observe(view.dom, { childList: true, subtree: true });
    view.scrollDOM.addEventListener("scroll", update, { passive: true });
    return () => { obs.disconnect(); view.scrollDOM.removeEventListener("scroll", update); };
  }, [paneView, conflicts]);

  const isOurs = side === "ours";

  return (
    <>
      {positions.map(({ top, idx }) => {
        const status = conflictStateMap.get(idx) ?? "unresolved";
        if (status !== "unresolved") {
          return (
            <div key={idx} style={{ position: "absolute", top, [isOurs ? "right" : "left"]: 0, zIndex: 10 }}>
              <div className="px-1.5 py-0.5 bg-green-950/70 border border-green-700/20 text-[9px]">
                <CheckCircle size={8} className="text-green-400" />
              </div>
            </div>
          );
        }

        return (
          <button
            key={idx}
            style={{ position: "absolute", top, [isOurs ? "right" : "left"]: 0, zIndex: 10 }}
            onClick={() => { onActivate(idx); onAccept(idx, side); }}
            title={isOurs ? "Accept Local (ours)" : "Accept Remote (theirs)"}
            className={cn(
              "flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-medium",
              "bg-card/90 backdrop-blur shadow-sm border transition-colors",
              isOurs
                ? "text-green-400 hover:text-green-200 hover:bg-green-900/60 border-green-700/30 rounded-br"
                : "text-blue-400 hover:text-blue-200 hover:bg-blue-900/60 border-blue-700/30 rounded-bl",
            )}
          >
            {isOurs
              ? <><ChevronsRight size={9} /> Accept</>
              : <>Accept <ChevronsLeft size={9} /></>}
          </button>
        );
      })}
    </>
  );
}
