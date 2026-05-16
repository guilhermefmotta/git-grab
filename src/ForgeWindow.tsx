import { useEffect, useState } from "react";
import { useApplySettings } from "./hooks/useApplySettings";
import { ForgePanel } from "@/components/forge/ForgePanel";
import { useAppStore } from "@/store/appStore";
import type { RepoInfo } from "@/lib/types";

interface Props {
  repoPath: string;
}

export default function ForgeWindow({ repoPath }: Props) {
  useApplySettings();
  const { setActiveRepoIndex, repos, addRepo } = useAppStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Ensure the repo is set as active so ForgePanel can read activeRepo
    const existing = repos.findIndex((r) => r.path === repoPath);
    if (existing >= 0) {
      setActiveRepoIndex(existing);
      setReady(true);
    } else {
      // Minimal repo stub so ForgePanel works
      const stub: RepoInfo = {
        path: repoPath,
        name: repoPath.split("/").pop() ?? repoPath,
        head_branch: null,
        remotes: [],
      };
      addRepo(stub);
      setReady(true);
    }
  }, [repoPath]);

  if (!ready) return null;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background text-foreground">
      <ForgePanel />
    </div>
  );
}
