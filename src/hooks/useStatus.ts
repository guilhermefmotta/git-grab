import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import { git } from "@/lib/tauri";
import { useAppStore } from "@/store/appStore";

export function useStatus() {
  const { activeRepo, status, setStatus, setLoadingStatus } = useAppStore();

  const refresh = useCallback(async () => {
    if (!activeRepo) return;
    setLoadingStatus(true);
    try {
      const result = await git.getStatus(activeRepo.path);
      setStatus(result);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoadingStatus(false);
    }
  }, [activeRepo, setStatus, setLoadingStatus]);

  const stageFile = useCallback(
    async (filePath: string) => {
      if (!activeRepo) return;
      try {
        await git.stageFile(activeRepo.path, filePath);
        await refresh();
      } catch (e) {
        toast.error(String(e));
      }
    },
    [activeRepo, refresh]
  );

  const unstageFile = useCallback(
    async (filePath: string) => {
      if (!activeRepo) return;
      try {
        await git.unstageFile(activeRepo.path, filePath);
        await refresh();
      } catch (e) {
        toast.error(String(e));
      }
    },
    [activeRepo, refresh]
  );

  const stageAll = useCallback(async () => {
    if (!activeRepo) return;
    try {
      await git.stageAll(activeRepo.path);
      await refresh();
    } catch (e) {
      toast.error(String(e));
    }
  }, [activeRepo, refresh]);

  const unstageAll = useCallback(async () => {
    if (!activeRepo) return;
    try {
      await git.unstageAll(activeRepo.path);
      await refresh();
    } catch (e) {
      toast.error(String(e));
    }
  }, [activeRepo, refresh]);

  const discardChanges = useCallback(
    async (filePath: string) => {
      if (!activeRepo) return;
      try {
        await git.discardChanges(activeRepo.path, filePath);
        await refresh();
      } catch (e) {
        toast.error(String(e));
      }
    },
    [activeRepo, refresh]
  );

  useEffect(() => {
    if (activeRepo) refresh();
  }, [activeRepo?.path]);

  const staged = status.filter(
    (f) => f.status === "staged" || f.status === "staged_and_unstaged"
  );
  const unstaged = status.filter(
    (f) => f.status === "unstaged" || f.status === "staged_and_unstaged"
  );
  const untracked = status.filter((f) => f.status === "untracked");
  const conflicted = status.filter((f) => f.status === "conflicted");

  return {
    status,
    staged,
    unstaged,
    untracked,
    conflicted,
    refresh,
    stageFile,
    unstageFile,
    stageAll,
    unstageAll,
    discardChanges,
  };
}
