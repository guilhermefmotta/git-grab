import { useAppStore } from "@/store/appStore";
import { CommitDetail } from "@/components/detail/CommitDetail";
import { WorkingTree } from "@/components/detail/WorkingTree";

export function DetailPanel() {
  const { selectedCommitHash, commits, activeRepo } = useAppStore();

  const selectedCommit = selectedCommitHash
    ? commits.find((c) => c.hash === selectedCommitHash)
    : null;

  if (!activeRepo) {
    return (
      <div className="w-80 shrink-0 border-l border-border bg-card flex items-center justify-center">
        <p className="text-xs text-muted-foreground">No repo open</p>
      </div>
    );
  }

  return (
    <div className="w-80 shrink-0 border-l border-border bg-card flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-border shrink-0">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {selectedCommit ? "Commit" : "Working Tree"}
        </h2>
      </div>
      <div className="flex-1 overflow-hidden">
        {selectedCommit ? (
          <CommitDetail commit={selectedCommit} />
        ) : (
          <WorkingTree />
        )}
      </div>
    </div>
  );
}
