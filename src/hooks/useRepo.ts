import { useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { git } from "@/lib/tauri";
import { useAppStore } from "@/store/appStore";

export function useRepo() {
  const { addRepo, setOperationInProgress } = useAppStore();

  const openRepo = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (!selected || typeof selected !== "string") return;

    try {
      const repo = await git.openRepo(selected);
      await git.addRecentRepo(selected);
      addRepo(repo);
    } catch (e) {
      toast.error(`Failed to open repo: ${e}`);
    }
  }, [addRepo]);

  const openRepoFromPath = useCallback(
    async (path: string) => {
      try {
        const repo = await git.openRepo(path);
        addRepo(repo);
      } catch (e) {
        toast.error(`Failed to open repo: ${e}`);
      }
    },
    [addRepo]
  );

  const withOp = useCallback(
    async (fn: () => Promise<void>, successMsg?: string) => {
      setOperationInProgress(true);
      try {
        await fn();
        if (successMsg) toast.success(successMsg);
      } catch (e) {
        toast.error(String(e));
      } finally {
        setOperationInProgress(false);
      }
    },
    [setOperationInProgress]
  );

  return { openRepo, openRepoFromPath, withOp };
}
