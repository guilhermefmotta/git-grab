import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import { git } from "@/lib/tauri";
import { useAppStore } from "@/store/appStore";

export function useBranches() {
  const { activeRepo, branches, setBranches, setActiveRepo } = useAppStore();

  const refresh = useCallback(async () => {
    if (!activeRepo) return;
    try {
      const result = await git.getBranches(activeRepo.path);
      setBranches(result);
    } catch (e) {
      toast.error(String(e));
    }
  }, [activeRepo, setBranches]);

  const refreshHead = useCallback(async () => {
    if (!activeRepo) return;
    try {
      const repo = await git.openRepo(activeRepo.path);
      setActiveRepo(repo);
    } catch {
      // non-critical
    }
  }, [activeRepo, setActiveRepo]);

  const checkout = useCallback(
    async (name: string) => {
      if (!activeRepo) return;
      try {
        await git.checkoutBranch(activeRepo.path, name);
        await Promise.all([refresh(), refreshHead()]);
        toast.success(`Switched to ${name}`);
      } catch (e) {
        toast.error(String(e));
      }
    },
    [activeRepo, refresh, refreshHead]
  );

  const createBranch = useCallback(
    async (name: string, fromHash?: string, checkoutAfter = true) => {
      if (!activeRepo) return;
      try {
        await git.createBranch(activeRepo.path, name, fromHash, checkoutAfter);
        await Promise.all([refresh(), checkoutAfter ? refreshHead() : Promise.resolve()]);
        toast.success(`Created branch ${name}`);
      } catch (e) {
        toast.error(String(e));
      }
    },
    [activeRepo, refresh, refreshHead]
  );

  const deleteBranch = useCallback(
    async (name: string) => {
      if (!activeRepo) return;
      try {
        await git.deleteBranch(activeRepo.path, name);
        await refresh();
        toast.success(`Deleted branch ${name}`);
      } catch (e) {
        toast.error(String(e));
      }
    },
    [activeRepo, refresh]
  );

  useEffect(() => {
    if (activeRepo) refresh();
  }, [activeRepo?.path]);

  const local = branches.filter((b) => !b.is_remote);
  const remote = branches.filter((b) => b.is_remote);
  const currentBranch = branches.find((b) => b.is_head);

  return { branches, local, remote, currentBranch, refresh, checkout, createBranch, deleteBranch };
}
