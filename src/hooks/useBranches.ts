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
    async (name: string): Promise<"ok" | "conflict" | "error"> => {
      if (!activeRepo) return "error";
      try {
        await git.checkoutBranch(activeRepo.path, name);
        await Promise.all([refresh(), refreshHead()]);
        toast.success(`Switched to ${name}`);
        return "ok";
      } catch (e) {
        const msg = String(e);
        if (/conflict.{0,10}prevent.{0,10}checkout/i.test(msg) || msg.includes("unresolved conflicts")) return "conflict";
        toast.error(msg);
        return "error";
      }
    },
    [activeRepo, refresh, refreshHead]
  );

  const openConflictViewers = useCallback(
    async (conflicted: string[]) => {
      if (!activeRepo) return;
      for (const filePath of conflicted) {
        const key = filePath.replace(/[^a-zA-Z0-9_-]/g, "-");
        localStorage.setItem(`git_crab_conflict_${key}`, JSON.stringify({ repoPath: activeRepo.path, filePath }));
        await git.openConflictWindow(key, `Resolve: ${filePath}`);
      }
    },
    [activeRepo]
  );

  const smartCheckout = useCallback(
    async (name: string) => {
      if (!activeRepo) return;
      try {
        const conflicted = await git.smartCheckout(activeRepo.path, name);
        await Promise.all([refresh(), refreshHead()]);
        if (conflicted.length === 0) {
          toast.success(`Switched to ${name}`);
        } else {
          toast.info(`${conflicted.length} conflict${conflicted.length !== 1 ? "s" : ""} need resolving`);
          await openConflictViewers(conflicted);
        }
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

  return { branches, local, remote, currentBranch, refresh, checkout, smartCheckout, openConflictViewers, createBranch, deleteBranch };
}
