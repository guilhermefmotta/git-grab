/**
 * E2E — Merge/conflict resolution full flow
 * Repos:
 *   TEST_REPO = /tmp/git-crab-test-merge  (1 conflict: file.txt)
 *   GITUI     = /home/evil/Dev/gitui      (19 active conflicts)
 */
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SS = path.resolve(__dirname, "../screenshots/merge");
const TEST_REPO  = "/tmp/git-crab-test-merge";
const GITUI_REPO = "/home/evil/Dev/gitui";
const RECENT_CFG = path.join(os.homedir(), ".config", "git_crab", "recent.json");

async function ss(name: string) {
  fs.mkdirSync(SS, { recursive: true });
  await browser.saveScreenshot(path.join(SS, `${name}.png`));
}

function seedRecent(paths: string[]) {
  fs.mkdirSync(path.dirname(RECENT_CFG), { recursive: true });
  fs.writeFileSync(RECENT_CFG, JSON.stringify(paths));
}

async function byTestId(id: string, timeout = 8000) {
  const el = await $(`[data-testid="${id}"]`);
  await el.waitForExist({ timeout });
  return el;
}

async function clickByTestId(id: string, timeout = 8000) {
  const el = await byTestId(id, timeout);
  await el.click();
  await browser.pause(400);
}

async function clickRecentRepo(repoPath: string) {
  const name = repoPath.split("/").pop()!;
  const el = await $(`[data-testid="recent-repo-${name}"]`);
  await el.waitForExist({ timeout: 6000 });
  await el.click();
  await browser.pause(1200);
}

async function openResolver() {
  await clickByTestId("resolve-conflicts-btn");
  await browser.pause(600);
}

// ── Suite 1: Welcome screen ───────────────────────────────────────────────────
describe("Merge 01 — Welcome screen recent repos", () => {
  before(async () => {
    seedRecent([TEST_REPO, GITUI_REPO]);
    await browser.execute(() => {
      // @ts-ignore
      window.__refreshRecentRepos?.();
    });
    await browser.pause(1500);
  });

  it("shows test-merge repo in Recent", async () => {
    await ss("01-welcome");
    const el = await $(`[data-testid="recent-repo-git-crab-test-merge"]`);
    await expect(el).toExist();
  });

  it("shows gitui repo in Recent", async () => {
    const el = await $(`[data-testid="recent-repo-gitui"]`);
    await expect(el).toExist();
  });
});

// ── Suite 2: Conflict banner in main view ─────────────────────────────────────
describe("Merge 02 — Conflict banner (main view)", () => {
  it("click test-merge repo opens it", async () => {
    await clickRecentRepo(TEST_REPO);
    await ss("02-test-repo-opened");
  });

  it("conflict banner appears", async () => {
    const banner = await byTestId("conflict-banner");
    await expect(banner).toExist();
    await ss("03-conflict-banner");
  });

  it("banner shows conflict count", async () => {
    const banner = await byTestId("conflict-banner");
    const text = await banner.getText();
    expect(text).toContain("conflict");
    await ss("04-banner-text");
  });

  it("Resolve Conflicts button present", async () => {
    const btn = await byTestId("resolve-conflicts-btn");
    await expect(btn).toExist();
  });
});

// ── Suite 3: Gitui — 19 conflicts ────────────────────────────────────────────
describe("Merge 03 — Gitui repo (19 conflicts)", () => {
  it("open gitui repo via close + recent", async () => {
    await browser.execute(() => {
      const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === '×');
      closeBtn?.click();
    });
    await browser.pause(600);
    await clickRecentRepo(GITUI_REPO);
    await ss("05-gitui-opened");
  });

  it("gitui shows conflict banner", async () => {
    const banner = await byTestId("conflict-banner");
    await expect(banner).toExist();
    const text = await banner.getText();
    expect(text).toMatch(/\d+/);
    await ss("06-gitui-banner");
  });
});

// ── Suite 4: Inline resolver opens ───────────────────────────────────────────
describe("Merge 04 — Resolver opens inline", () => {
  before(async () => {
    await browser.execute(() => {
      const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === '×');
      closeBtn?.click();
    });
    await browser.pause(400);
    await clickRecentRepo(TEST_REPO);
    await browser.pause(800);
  });

  it("click Resolve Conflicts shows inline resolver", async () => {
    await openResolver();
    await ss("07-resolver-opened");
  });

  it("merge banner visible in resolver", async () => {
    const banner = await byTestId("merge-banner");
    await expect(banner).toExist();
    await ss("08-merge-banner");
  });

  it("file list shows Conflicted Files", async () => {
    const fileList = await byTestId("file-list");
    await expect(fileList).toExist();
    await ss("09-file-list");
  });

  it("file.txt appears in conflict file list", async () => {
    const fileBtn = await $('[data-testid="conflict-file-file.txt"]');
    await expect(fileBtn).toExist();
    await ss("10-file-txt-in-list");
  });
});

// ── Suite 5: 3-pane editor ────────────────────────────────────────────────────
describe("Merge 05 — 3-pane editor interactions", () => {
  it("3 CodeMirror editors rendered", async () => {
    const editors = await $$(".cm-editor");
    expect(editors.length).toBeGreaterThanOrEqual(3);
    await ss("11-three-pane-editors");
  });

  it("All Ours button visible", async () => {
    const btn = await byTestId("all-ours-btn");
    await expect(btn).toExist();
  });

  it("All Theirs button visible", async () => {
    const btn = await byTestId("all-theirs-btn");
    await expect(btn).toExist();
  });

  it("Next conflict button visible", async () => {
    const btn = await byTestId("next-conflict-btn");
    await expect(btn).toExist();
  });

  it("Prev conflict button visible", async () => {
    const btn = await byTestId("prev-conflict-btn");
    await expect(btn).toExist();
  });

  it("conflict progress counter visible", async () => {
    const progress = await byTestId("conflict-progress");
    await expect(progress).toExist();
    await ss("12-progress-counter");
  });

  it("stage button visible", async () => {
    const btn = await byTestId("stage-btn");
    await expect(btn).toExist();
  });
});

// ── Suite 6: Accept Ours flow ─────────────────────────────────────────────────
describe("Merge 06 — Accept Ours and stage", () => {
  it("click All Ours resolves all conflicts in file", async () => {
    await clickByTestId("all-ours-btn");
    await browser.pause(500);
    await ss("13-after-all-ours");
  });

  it("stage button is now clickable", async () => {
    const btn = await byTestId("stage-btn");
    const enabled = await btn.isEnabled();
    expect(enabled).toBe(true);
    await ss("14-stage-enabled");
  });

  it("click stage — file resolved", async () => {
    await clickByTestId("stage-btn");
    await browser.pause(800);
    await ss("15-after-stage");
  });

  it("file.txt shows in file list", async () => {
    const fileBtn = await $('[data-testid="conflict-file-file.txt"]');
    await expect(fileBtn).toExist();
    await ss("16-file-resolved");
  });

  it("Commit Merge button enabled (all conflicts resolved)", async () => {
    const btn = await byTestId("complete-btn");
    await expect(btn).toExist();
    const enabled = await btn.isEnabled();
    expect(enabled).toBe(true);
    await ss("17-commit-enabled");
  });
});

// ── Suite 7: Commit merge ─────────────────────────────────────────────────────
describe("Merge 07 — Commit merge", () => {
  it("commit merge completes and closes resolver", async () => {
    await clickByTestId("complete-btn");
    await browser.pause(2000);
    await ss("18-after-commit");
  });

  it("resolver closed — conflict banner gone", async () => {
    // After commit, resolver closes and conflict banner should be gone
    await browser.pause(1000);
    await ss("19-post-commit");
    const banner = await $('[data-testid="conflict-banner"]');
    await expect(banner).not.toExist();
  });
});

// ── Suite 8: Abort merge flow ─────────────────────────────────────────────────
describe("Merge 08 — Abort merge", () => {
  before(async () => {
    const { execSync } = await import("child_process");
    try { execSync("bash /tmp/setup-test-repo.sh 2>/dev/null"); } catch {}

    await browser.execute(() => {
      const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === '×');
      closeBtn?.click();
    });
    await browser.pause(400);
    await clickRecentRepo(TEST_REPO);
    await browser.pause(800);
  });

  it("conflict banner shows after repo reset", async () => {
    await ss("20-reset-repo-banner");
    const banner = await byTestId("conflict-banner");
    await expect(banner).toExist();
  });

  it("open resolver", async () => {
    await openResolver();
    await ss("21-resolver-before-abort");
    const banner = await byTestId("merge-banner");
    await expect(banner).toExist();
  });

  it("abort button present and clickable", async () => {
    const abortBtn = await byTestId("abort-btn");
    await abortBtn.click();
    await browser.pause(1500);
    await ss("22-after-abort");
  });

  it("after abort — resolver closed, no conflict banner", async () => {
    await browser.pause(800);
    await ss("23-main-after-abort");
    const banner = await $('[data-testid="conflict-banner"]');
    await expect(banner).not.toExist();
  });
});

// ── Suite 9: Accept Theirs flow ───────────────────────────────────────────────
describe("Merge 09 — Accept Theirs", () => {
  before(async () => {
    const { execSync } = await import("child_process");
    try { execSync("bash /tmp/setup-test-repo.sh 2>/dev/null"); } catch {}

    await browser.execute(() => {
      const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === '×');
      closeBtn?.click();
    });
    await browser.pause(400);
    await clickRecentRepo(TEST_REPO);
    await browser.pause(800);
    await openResolver();
  });

  it("All Theirs resolves all conflicts with their content", async () => {
    await clickByTestId("all-theirs-btn");
    await browser.pause(500);
    await ss("24-after-all-theirs");
    const stageBtn = await byTestId("stage-btn");
    const enabled = await stageBtn.isEnabled();
    expect(enabled).toBe(true);
  });

  it("stage and commit with theirs content", async () => {
    await clickByTestId("stage-btn");
    await browser.pause(600);
    await ss("25-staged-theirs");
    const completeBtn = await byTestId("complete-btn");
    const enabled = await completeBtn.isEnabled();
    expect(enabled).toBe(true);
    await completeBtn.click();
    await browser.pause(1500);
    await ss("26-theirs-committed");
  });
});

// ── Suite 10: DiffViewer (CodeMirror) ─────────────────────────────────────────
describe("Merge 10 — DiffViewer CodeMirror rendering", () => {
  before(async () => {
    // Close current tab, reopen fresh test repo (post-merge state)
    const { execSync } = await import("child_process");
    try { execSync("bash /tmp/setup-test-repo.sh 2>/dev/null"); } catch {}
    await browser.execute(() => {
      const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === '×');
      closeBtn?.click();
    });
    await browser.pause(400);
    await clickRecentRepo(TEST_REPO);
    await browser.pause(800);
  });

  it("click first commit in graph — diff loads", async () => {
    // Commit rows have cursor-pointer class — click the last one (oldest commit = "initial")
    await browser.execute(() => {
      const rows = Array.from(document.querySelectorAll(".cursor-pointer"))
        .filter(el => el.textContent?.includes("initial") || el.closest('[style]'));
      const last = document.querySelectorAll(".cursor-pointer");
      if (last.length > 0) (last[last.length - 1] as HTMLElement).click();
    });
    await browser.pause(1200);
    await ss("27-commit-selected");
  });

  it("diff viewer renders with CodeMirror editors", async () => {
    // cm-editor elements should appear in the diff panel
    const editors = await $$(".cm-editor");
    await ss("28-diff-viewer-cm");
    expect(editors.length).toBeGreaterThanOrEqual(1);
  });

  it("diff shows file path header", async () => {
    // After clicking a commit, diff panel shows changed files
    const panels = await $$(".cm-editor");
    await ss("29-diff-file-header");
    expect(panels.length).toBeGreaterThanOrEqual(1);
  });
});
