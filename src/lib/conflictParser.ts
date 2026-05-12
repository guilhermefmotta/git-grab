import type { Segment, ConflictSection, ConflictState } from "./mergeTypes";

/** Parse the diffy-generated merged text into display segments. */
export function parseSegments(merged: string): Segment[] {
  const rawLines = merged.split("\n");
  const sections: ConflictSection[] = [];

  let i = 0;
  let idx = 0;

  while (i < rawLines.length) {
    if (rawLines[i].startsWith("<<<<<<<")) {
      const ourLabel = rawLines[i].slice(8).trim() || "ours";
      const oursLines: string[] = [];
      const theirsLines: string[] = [];
      i++;
      while (i < rawLines.length && !rawLines[i].startsWith("=======")) {
        oursLines.push(rawLines[i]);
        i++;
      }
      i++; // skip =======
      while (i < rawLines.length && !rawLines[i].startsWith(">>>>>>>")) {
        theirsLines.push(rawLines[i]);
        i++;
      }
      const theirLabel = rawLines[i]?.slice(8).trim() || "theirs";
      i++; // skip >>>>>>>
      sections.push({ idx: idx++, ourLabel, theirLabel, oursLines, theirsLines });
    } else {
      i++;
    }
  }

  // Build segments: walk rawLines again, emit context vs conflict
  const segs: Segment[] = [];
  let pos = 0;
  let si = 0;
  let lineNum = 1;

  while (pos < rawLines.length) {
    const nextConflictLine = sections[si]
      ? rawLines.indexOf(`<<<<<<< ${sections[si].ourLabel}`, pos)
      : -1;

    if (nextConflictLine === -1 || nextConflictLine > pos) {
      const end = nextConflictLine === -1 ? rawLines.length : nextConflictLine;
      const ctxLines = rawLines.slice(pos, end);
      if (ctxLines.length > 0) {
        segs.push({ kind: "context", lines: ctxLines, firstLine: lineNum });
        lineNum += ctxLines.length;
      }
      pos = end;
    }

    if (sections[si] && pos === nextConflictLine) {
      segs.push({ kind: "conflict", section: sections[si] });
      const sec = sections[si];
      pos += 1 + sec.oursLines.length + 1 + sec.theirsLines.length + 1;
      si++;
    }
  }

  return segs;
}

/** Build final file content from segments + per-conflict states. */
export function buildResult(
  segs: Segment[],
  states: Map<number, ConflictState>,
): string {
  const lines: string[] = [];

  for (const seg of segs) {
    if (seg.kind === "context") {
      lines.push(...seg.lines);
    } else {
      const state = states.get(seg.section.idx);
      if (state && state.status !== "unresolved" && state.content !== "") {
        lines.push(...state.content.split("\n"));
      } else {
        // Unresolved — preserve conflict markers (caught before submit)
        lines.push(
          `<<<<<<< ${seg.section.ourLabel}`,
          ...seg.section.oursLines,
          "=======",
          ...seg.section.theirsLines,
          `>>>>>>> ${seg.section.theirLabel}`,
        );
      }
    }
  }

  return lines.join("\n");
}
