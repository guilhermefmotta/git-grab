import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import CommitDiffWindow from "./CommitDiffWindow";
import FileDiffWindow from "./FileDiffWindow";
import "./index.css";

const params = new URLSearchParams(window.location.search);
const view = params.get("view");
const hash = params.get("hash");
const key = params.get("key");

function Root() {
  if (view === "commit" && hash) return <CommitDiffWindow hash={hash} />;
  if (view === "filediff" && key) return <FileDiffWindow storageKey={key} />;
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
