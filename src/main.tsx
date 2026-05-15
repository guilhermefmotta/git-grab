import React from "react";
import ReactDOM from "react-dom/client";
import { attachConsole } from "@tauri-apps/plugin-log";
import App from "./App";
import CommitDiffWindow from "./CommitDiffWindow";
import FileDiffWindow from "./FileDiffWindow";
import MergeWindow from "./MergeWindow";
import "./index.css";

attachConsole();

const params = new URLSearchParams(window.location.search);
const view = params.get("view");
const hash = params.get("hash");
const key  = params.get("key");
const repoPath = params.get("repoPath");

function Root() {
  if (view === "commit" && hash) return <CommitDiffWindow hash={hash} />;
  if (view === "filediff" && key) return <FileDiffWindow storageKey={key} />;
  if (view === "merge" && repoPath) return <MergeWindow repoPath={decodeURIComponent(repoPath)} />;
  return <App />;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "monospace", color: "#f87171", background: "#0f172a", minHeight: "100vh" }}>
          <h2 style={{ color: "#fca5a5", marginBottom: 8 }}>Render Error</h2>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>
            {(this.state.error as Error).message}
            {"\n\n"}
            {(this.state.error as Error).stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </React.StrictMode>
);
