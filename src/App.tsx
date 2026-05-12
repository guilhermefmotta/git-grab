import { useCallback, useEffect, useState } from "react";
import { Toaster } from "sonner";
import { useAppStore } from "@/store/appStore";
import { TopToolbar } from "@/components/layout/TopToolbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { CommitGraph } from "@/components/graph/CommitGraph";
import { DetailPanel } from "@/components/layout/DetailPanel";
import { WelcomeScreen } from "@/components/dialogs/WelcomeScreen";
import { SettingsDialog } from "@/components/dialogs/SettingsDialog";
import { MergeWorkspace } from "@/components/merge/MergeWorkspace";
import { git } from "@/lib/tauri";
import type { RepoStatus } from "@/lib/mergeTypes";

export default function App() {
  const { activeRepo, settings, setSelectedCommitHash } = useAppStore();
  const [settingsOpen, setSettingsOpen]   = useState(false);
  const [mergeStatus, setMergeStatus]     = useState<RepoStatus | null>(null);

  // Apply theme + font size
  useEffect(() => {
    document.documentElement.classList.toggle("light", settings.theme === "light");
    document.body.style.fontSize = `${settings.fontSize}px`;
  }, [settings.theme, settings.fontSize]);

  // Check repo conflict / merge state
  const refreshMergeStatus = useCallback(async () => {
    if (!activeRepo) { setMergeStatus(null); return; }
    try {
      const s = await git.getRepoStatus(activeRepo.path);
      const active = s.operation !== "Clean" || s.conflictedFiles.length > 0;
      setMergeStatus(active ? s : null);
    } catch {
      setMergeStatus(null);
    }
  }, [activeRepo]);

  // Check on repo change
  useEffect(() => { refreshMergeStatus(); }, [activeRepo?.path]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === ",") { e.preventDefault(); setSettingsOpen(true); return; }
      if (mod && e.key === "f") {
        e.preventDefault();
        (document.getElementById("commit-search") as HTMLInputElement | null)?.focus();
        return;
      }
      if (e.key === "Escape") {
        const active = document.activeElement as HTMLElement | null;
        if (active && active.tagName !== "BODY") { active.blur(); return; }
        setSelectedCommitHash(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setSelectedCommitHash]);

  const toastOpts = {
    style: {
      background: settings.theme === "dark" ? "hsl(222 47% 13%)" : "hsl(0 0% 97%)",
      border: `1px solid hsl(${settings.theme === "dark" ? "217 32% 17%" : "214 32% 86%"})`,
      color: settings.theme === "dark" ? "hsl(210 40% 98%)" : "hsl(222 47% 11%)",
      fontSize: "12px",
    },
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background text-foreground">
      <TopToolbar onOpenSettings={() => setSettingsOpen(true)} />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {!activeRepo ? (
          <WelcomeScreen />
        ) : mergeStatus ? (
          <>
            <Sidebar onOperationComplete={refreshMergeStatus} />
            <div className="flex-1 min-w-0 overflow-hidden">
              <MergeWorkspace
                repoPath={activeRepo.path}
                status={mergeStatus}
                onDone={refreshMergeStatus}
              />
            </div>
          </>
        ) : (
          <>
            <Sidebar onOperationComplete={refreshMergeStatus} />
            <CommitGraph />
            <DetailPanel />
          </>
        )}
      </div>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Toaster position="bottom-right" theme={settings.theme} toastOptions={toastOpts} />
    </div>
  );
}
