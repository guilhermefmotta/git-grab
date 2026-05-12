/**
 * Factory for creating CodeMirror EditorView instances with shared config.
 */
import { EditorState, Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, historyKeymap, history } from "@codemirror/commands";
import { appTheme, appHighlight } from "./theme";

const LINE_H = 20;

const baseExtensions: Extension[] = [
  appTheme,
  appHighlight,
  // Fit to full content height — outer container handles scroll
  EditorView.theme({
    "&": { height: "auto" },
    ".cm-scroller": { overflow: "visible !important" },
  }),
  // 20px line height enforced
  EditorView.contentAttributes.of({ style: `line-height: ${LINE_H}px` }),
];

export function makeReadonlyEditor(
  parent: HTMLElement,
  doc: string,
  extensions: Extension[] = [],
): EditorView {
  return new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        ...baseExtensions,
        EditorState.readOnly.of(true),
        lineNumbers(),
        ...extensions,
      ],
    }),
    parent,
  });
}

export function makeEditableEditor(
  parent: HTMLElement,
  doc: string,
  extensions: Extension[] = [],
  onChange?: (content: string) => void,
): EditorView {
  const updateListener = onChange
    ? EditorView.updateListener.of(u => {
        if (u.docChanged) onChange(u.state.doc.toString());
      })
    : [];

  return new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        ...baseExtensions,
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        lineNumbers(),
        updateListener,
        ...extensions,
      ],
    }),
    parent,
  });
}

/** Sync scroll of multiple panes when source scrolls. */
export function setupScrollSync(
  source: EditorView,
  targets: EditorView[],
  container: HTMLElement,
) {
  let ticking = false;
  const handler = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const st = source.scrollDOM.scrollTop;
      for (const t of targets) {
        if (Math.abs(t.scrollDOM.scrollTop - st) > 1) {
          t.scrollDOM.scrollTop = st;
        }
      }
      container.scrollTop = st;
      ticking = false;
    });
  };
  source.scrollDOM.addEventListener("scroll", handler, { passive: true });
  return () => source.scrollDOM.removeEventListener("scroll", handler);
}
