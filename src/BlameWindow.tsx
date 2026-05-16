import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Loader2, Layers } from "lucide-react";
import { git } from "@/lib/tauri";
import type { BlameLine } from "@/lib/types";

const STORAGE_PREFIX = "git_rust_blame_";

interface BlameMeta {
  repoPath: string;
  filePath: string;
  commitHash?: string;
}

interface Props {
  storageKey: string;
}

const GUTTER_COLORS = [
  "bg-blue-500/8",
  "bg-purple-500/8",
  "bg-green-500/8",
  "bg-amber-500/8",
  "bg-pink-500/8",
  "bg-cyan-500/8",
  "bg-orange-500/8",
  "bg-teal-500/8",
];

export default function BlameWindow({ storageKey }: Props) {
  const [meta, setMeta] = useState<BlameMeta | null>(null);
  const [lines, setLines] = useState<BlameLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredHash, setHoveredHash] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${storageKey}`);
      if (!raw) { setError("No blame data found"); return; }
      setMeta(JSON.parse(raw));
    } catch {
      setError("Failed to load blame data");
    }
  }, [storageKey]);

  useEffect(() => {
    if (!meta) return;
    setLoading(true);
    git.getBlame(meta.repoPath, meta.filePath, meta.commitHash)
      .then(setLines)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [meta]);

  const hashColorMap = useMemo(() => {
    const map = new Map<string, number>();
    let idx = 0;
    for (const line of lines) {
      if (!map.has(line.hash)) {
        map.set(line.hash, idx % GUTTER_COLORS.length);
        idx++;
      }
    }
    return map;
  }, [lines]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground">
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-border bg-card shrink-0">
        <Layers size={14} className="text-muted-foreground shrink-0" />
        <span className="font-mono text-sm">{meta?.filePath ?? "…"}</span>
        {!loading && lines.length > 0 && (
          <span className="text-xs text-muted-foreground ml-1">
            {lines.length} lines
          </span>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center flex-1 gap-2">
          <Loader2 size={14} className="animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Computing blame…</span>
        </div>
      )}

      {!loading && lines.length > 0 && (
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse font-mono text-xs">
            <tbody>
              {lines.map((line, i) => {
                const isFirst = i === 0 || lines[i - 1].hash !== line.hash;
                const colorIdx = hashColorMap.get(line.hash) ?? 0;
                const gutterBg = GUTTER_COLORS[colorIdx];
                const isHovered = hoveredHash === line.hash;

                return (
                  <tr
                    key={line.line_no}
                    className={isHovered ? "bg-accent/40" : ""}
                    onMouseEnter={() => setHoveredHash(line.hash)}
                    onMouseLeave={() => setHoveredHash(null)}
                  >
                    {/* Commit gutter */}
                    <td
                      className={`px-2 py-[1px] border-r border-border/30 select-none whitespace-nowrap ${gutterBg}`}
                      style={{ width: 300 }}
                    >
                      {isFirst && (
                        <div className="flex items-center gap-2">
                          <span className="text-primary shrink-0">{line.short_hash}</span>
                          <span className="text-muted-foreground truncate" style={{ maxWidth: 120 }}>
                            {line.author}
                          </span>
                          <span className="text-muted-foreground/60 shrink-0 text-[10px]">
                            {formatDistanceToNow(new Date(line.timestamp * 1000), { addSuffix: true })}
                          </span>
                        </div>
                      )}
                    </td>
                    {/* Line number */}
                    <td
                      className="px-2 py-[1px] text-right text-muted-foreground/40 border-r border-border/20 select-none"
                      style={{ width: 48 }}
                    >
                      {line.line_no}
                    </td>
                    {/* Code */}
                    <td className="px-3 py-[1px] whitespace-pre">{line.content}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && lines.length === 0 && (
        <div className="flex items-center justify-center flex-1 text-xs text-muted-foreground">
          No blame data
        </div>
      )}
    </div>
  );
}
