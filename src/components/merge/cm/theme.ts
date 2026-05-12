import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

// Dark theme matching the app's hsl(222 47% 11%) background
export const appTheme = EditorView.theme({
  "&": {
    background: "transparent",
    color: "hsl(210 40% 90%)",
    fontSize: "11px",
    fontFamily: "ui-monospace, 'Cascadia Code', 'JetBrains Mono', Menlo, monospace",
  },
  ".cm-content": {
    padding: "0",
    caretColor: "hsl(210 40% 90%)",
    lineHeight: "20px",
  },
  ".cm-line": { padding: "0 4px" },
  ".cm-cursor": { borderLeftColor: "hsl(210 40% 90%)" },
  ".cm-selectionBackground": { background: "rgba(59,130,246,.25) !important" },
  ".cm-focused .cm-selectionBackground": { background: "rgba(59,130,246,.35) !important" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { overflow: "visible !important", fontFamily: "inherit" },
  ".cm-gutters": { display: "none" }, // we handle line numbers ourselves
  // Conflict marker lines
  ".cm-conflict-marker":  { background: "rgba(234,179,8,.12)",  borderLeft: "2px solid rgba(234,179,8,.5)" },
  ".cm-conflict-ours":    { background: "rgba(34,197,94,.10)",  borderLeft: "2px solid rgba(34,197,94,.3)" },
  ".cm-conflict-theirs":  { background: "rgba(59,130,246,.10)", borderLeft: "2px solid rgba(59,130,246,.3)" },
  ".cm-conflict-sep":     { background: "rgba(234,179,8,.08)",  borderLeft: "2px solid rgba(234,179,8,.3)" },
  // Resolved regions
  ".cm-resolved-ours":    { background: "rgba(34,197,94,.08)" },
  ".cm-resolved-theirs":  { background: "rgba(59,130,246,.08)" },
  ".cm-resolved-both":    { background: "rgba(168,85,247,.08)" },
  ".cm-resolved-manual":  { background: "rgba(16,185,129,.08)" },
}, { dark: true });

export const appHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: t.keyword,           color: "hsl(207 61% 66%)" },
  { tag: t.comment,           color: "hsl(220 10% 50%)", fontStyle: "italic" },
  { tag: t.string,            color: "hsl(152 52% 60%)" },
  { tag: t.number,            color: "hsl(29 54% 65%)" },
  { tag: t.bool,              color: "hsl(207 61% 66%)" },
  { tag: t.null,              color: "hsl(207 61% 66%)" },
  { tag: t.function(t.variableName), color: "hsl(220 52% 75%)" },
  { tag: t.typeName,          color: "hsl(39 67% 69%)" },
  { tag: t.className,         color: "hsl(39 67% 69%)" },
  { tag: t.definition(t.variableName), color: "hsl(215 60% 78%)" },
  { tag: t.operator,          color: "hsl(207 61% 66%)" },
  { tag: t.propertyName,      color: "hsl(215 60% 78%)" },
  { tag: t.punctuation,       color: "hsl(210 25% 70%)" },
  { tag: t.heading,           color: "hsl(39 67% 69%)", fontWeight: "bold" },
  { tag: t.emphasis,          fontStyle: "italic" },
  { tag: t.strong,            fontWeight: "bold" },
  { tag: t.link,              color: "hsl(152 52% 60%)", textDecoration: "underline" },
  { tag: t.meta,              color: "hsl(220 10% 50%)" },
  { tag: t.processingInstruction, color: "hsl(207 61% 66%)" },
  { tag: t.variableName,      color: "hsl(210 40% 88%)" },
  { tag: t.attributeName,     color: "hsl(39 67% 69%)" },
]));
