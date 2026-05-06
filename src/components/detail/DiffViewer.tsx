import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { FileDiff, DiffLine } from "@/lib/types";

type SideType = "context" | "add" | "delete" | "empty";

type Side = {
  lineNo: number | null;
  content: string;
  type: SideType;
};

type Row = { left: Side; right: Side };

function buildRows(lines: DiffLine[]): Row[] {
  const rows: Row[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.line_type === "header") {
      i++;
      continue;
    }

    if (line.line_type === "context") {
      rows.push({
        left: { lineNo: line.old_lineno ?? null, content: line.content, type: "context" },
        right: { lineNo: line.new_lineno ?? null, content: line.content, type: "context" },
      });
      i++;
      continue;
    }

    // Collect consecutive deletes then adds
    const dels: DiffLine[] = [];
    const adds: DiffLine[] = [];

    while (i < lines.length && lines[i].line_type === "delete") dels.push(lines[i++]);
    while (i < lines.length && lines[i].line_type === "add") adds.push(lines[i++]);

    const maxLen = Math.max(dels.length, adds.length);
    for (let j = 0; j < maxLen; j++) {
      rows.push({
        left: dels[j]
          ? { lineNo: dels[j].old_lineno ?? null, content: dels[j].content, type: "delete" }
          : { lineNo: null, content: "", type: "empty" },
        right: adds[j]
          ? { lineNo: adds[j].new_lineno ?? null, content: adds[j].content, type: "add" }
          : { lineNo: null, content: "", type: "empty" },
      });
    }
  }

  return rows;
}

function Gutter({ n }: { n: number | null }) {
  return (
    <span className="w-10 shrink-0 text-right pr-2 text-muted-foreground/50 select-none text-[10px] tabular-nums leading-5">
      {n ?? ""}
    </span>
  );
}

function Sign({ type }: { type: SideType }) {
  return (
    <span
      className={cn(
        "w-4 shrink-0 text-center select-none leading-5",
        type === "delete" && "text-red-400",
        type === "add" && "text-green-400",
      )}
    >
      {type === "delete" ? "−" : type === "add" ? "+" : " "}
    </span>
  );
}

function SideCell({ side }: { side: Side }) {
  return (
    <div
      className={cn(
        "flex items-start flex-1 min-w-0 overflow-hidden",
        side.type === "delete" && "bg-red-950/50",
        side.type === "add" && "bg-green-950/50",
        side.type === "empty" && "bg-muted/5",
      )}
    >
      <Gutter n={side.lineNo} />
      <Sign type={side.type} />
      <span
        className={cn(
          "flex-1 whitespace-pre-wrap break-all min-w-0 pr-2 leading-5 text-[11px]",
          side.type === "delete" && "text-red-200",
          side.type === "add" && "text-green-100",
          side.type === "context" && "text-foreground",
          side.type === "empty" && "select-none",
        )}
      >
        {side.content || " "}
      </span>
    </div>
  );
}

export function DiffViewer({ diff, loading }: { diff: FileDiff[]; loading?: boolean }) {
  const processed = useMemo(
    () =>
      diff.map((file) => ({
        path: file.path,
        hunks: file.hunks.map((hunk) => ({
          header: hunk.header,
          rows: buildRows(hunk.lines),
        })),
      })),
    [diff],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-muted-foreground">Loading diff…</p>
      </div>
    );
  }

  if (diff.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-muted-foreground">Select a file to view diff</p>
      </div>
    );
  }

  return (
    <div className="overflow-auto h-full font-mono">
      {processed.map((file) => (
        <div key={file.path}>
          {/* File header */}
          <div className="sticky top-0 z-10 bg-secondary px-3 py-1 text-xs font-semibold text-foreground border-b border-border flex items-center gap-2">
            <span className="flex-1 truncate">{file.path}</span>
          </div>

          {file.hunks.map((hunk, hi) => (
            <div key={hi}>
              {/* Hunk header — spans full width */}
              <div className="px-3 py-0.5 bg-blue-950/30 border-y border-blue-900/30 text-blue-400/80 text-[10px]">
                {hunk.header}
              </div>

              {/* Side-by-side rows */}
              {hunk.rows.map((row, ri) => (
                <div key={ri} className="flex border-b border-border/10">
                  <div className="flex flex-1 min-w-0 border-r border-border/30">
                    <SideCell side={row.left} />
                  </div>
                  <div className="flex flex-1 min-w-0">
                    <SideCell side={row.right} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
