import { useEffect, useState } from "react";
import { Folder, GitBranch, Clock } from "lucide-react";
import { git } from "@/lib/tauri";
import { useRepo } from "@/hooks/useRepo";

export function WelcomeScreen() {
  const [recentRepos, setRecentRepos] = useState<string[]>([]);
  const { openRepo, openRepoFromPath } = useRepo();

  useEffect(() => {
    git.getRecentRepos().then(setRecentRepos).catch(() => {});
  }, []);

  return (
    <div className="flex-1 flex items-center justify-center bg-background">
      <div className="w-96">
        <div className="flex items-center gap-3 mb-8">
          <GitBranch size={32} className="text-primary" />
          <div>
            <h1 className="text-lg font-semibold text-foreground">git_rust</h1>
            <p className="text-xs text-muted-foreground">Git GUI client</p>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={openRepo}
            data-testid="open-repo-btn"
            className="w-full flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-lg text-sm text-foreground hover:bg-accent transition-colors"
          >
            <Folder size={18} className="text-primary" />
            <div className="text-left">
              <p className="font-medium">Open Repository</p>
              <p className="text-xs text-muted-foreground">Browse for an existing git repo</p>
            </div>
          </button>

          {recentRepos.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Clock size={11} />
                Recent
              </p>
              <div className="space-y-1">
                {recentRepos.map((path) => {
                  const name = path.split("/").pop() ?? path;
                  return (
                    <button
                      key={path}
                      onClick={() => openRepoFromPath(path)}
                      data-testid={`recent-repo-${name}`}
                      className="w-full flex items-start gap-2 px-3 py-2 rounded hover:bg-accent transition-colors text-left"
                    >
                      <Folder size={13} className="text-muted-foreground mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{path}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
