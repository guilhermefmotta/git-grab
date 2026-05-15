import { useCallback, useEffect } from "react";
import { git } from "@/lib/tauri";
import { useAppStore } from "@/store/appStore";
import { toast } from "sonner";

export function useCommits() {
  const {
    activeRepo,
    activeBranchFilter,
    commits,
    setCommits,
    appendCommits,
    setLoadingCommits,
    loadingCommits,
  } = useAppStore();

  const loadCommits = useCallback(
    async (offset = 0) => {
      if (!activeRepo) return;
      setLoadingCommits(true);
      try {
        const result = await git.getCommits(
          activeRepo.path,
          200,
          offset,
          activeBranchFilter ?? undefined
        );
        if (offset === 0) {
          setCommits(result);
        } else {
          appendCommits(result);
        }
      } catch (e) {
        toast.error(`Failed to load commits: ${e}`);
      } finally {
        setLoadingCommits(false);
      }
    },
    [activeRepo, activeBranchFilter, setCommits, appendCommits, setLoadingCommits]
  );

  const loadMore = useCallback(() => {
    if (!loadingCommits) {
      loadCommits(commits.length);
    }
  }, [loadCommits, commits.length, loadingCommits]);

  useEffect(() => {
    if (activeRepo) {
      loadCommits(0);
    }
  }, [activeRepo?.path, activeBranchFilter]);

  return { commits, loadCommits, loadMore, loadingCommits };
}
