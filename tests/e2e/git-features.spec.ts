/**
 * E2E — Git features: commit search, reflog, file history, blame, interactive rebase
 *
 * Shares the same test repo as features.spec.ts (/tmp/git-crab-test-merge).
 * Runs after features.spec.ts in the same session.
 */
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";
import { execSync } from "child_process";

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const SS         = path.resolve(__dirname, "../screenshots/git-features");
const TEST_REPO  = "/tmp/git-crab-test-merge";
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

async function clickByTestId(id: string) {
  const el = await byTestId(id);
  await el.click();
  await browser.pause(400);
}

async function triggerContextMenu(selector: string) {
  await browser.execute((sel: string) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) throw new Error(`selector not found: ${sel}`);
    const rect = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true, cancelable: true, button: 2,
      clientX: Math.round(rect.left + rect.width / 2),
      clientY: Math.round(rect.top  + rect.height / 2),
    }));
  }, selector);
  await browser.pause(500);
}

async function openRepo() {
  seedRecent([TEST_REPO]);
  await browser.execute(() => { (window as any).__refreshRecentRepos?.(); });
  await browser.pause(800);
  const name = TEST_REPO.split("/").pop()!;
  const el = await $(`[data-testid="recent-repo-${name}"]`);
  await el.waitForExist({ timeout: 6000 });
  await el.click();
  await browser.pause(1500);
}

/** Click X button to clear search — reliably fires React onChange */
async function clearSearch() {
  const xBtn = await $('[data-testid="search-clear-btn"]');
  if (await xBtn.isExisting()) {
    await xBtn.click();
    await browser.pause(400);
    return;
  }
  // Fallback: dispatch native input event so React state clears
  await browser.execute(() => {
    const input = document.getElementById("commit-search") as HTMLInputElement | null;
    if (!input) return;
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    nativeInputValueSetter?.call(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await browser.pause(400);
}

/** Ensure graph is in clean state: no active search, no selected commit */
async function resetGraphState() {
  // Clear search if active
  const xBtn = await $('[data-testid="search-clear-btn"]');
  if (await xBtn.isExisting()) {
    await xBtn.click();
    await browser.pause(400);
  }
  // Deselect any commit
  await browser.keys("Escape");
  await browser.pause(200);
  await browser.keys("Escape");
  await browser.pause(400);
}

async function selectFirstCommit() {
  await resetGraphState();
  // Wait for commit rows to appear
  await browser.waitUntil(async () => {
    const rows = await $$("[data-testid^='commit-row-']");
    return rows.length > 0;
  }, { timeout: 6000, timeoutMsg: "No commit rows found after 6s" });

  const firstRowTestId = await browser.execute(() => {
    const el = document.querySelector("[data-testid^='commit-row-']");
    return el ? (el as HTMLElement).dataset.testid ?? null : null;
  });
  const row = await $(`[data-testid="${firstRowTestId}"]`);
  await row.click();
  await browser.pause(1200);
}

async function rightClickFirstCommitFile() {
  const fileTestId = await browser.execute(() => {
    const el = document.querySelector("[data-testid^='commit-file-']");
    return el ? (el as HTMLElement).dataset.testid ?? null : null;
  });
  if (!fileTestId) throw new Error("No commit files found in detail panel");
  await triggerContextMenu(`[data-testid="${fileTestId}"]`);
}

// ── Setup ────────────────────────────────────────────────────────────────────

before(async () => {
  try { execSync("bash /tmp/setup-test-repo.sh 2>/dev/null"); } catch {}
  try { execSync(`git -C ${TEST_REPO} merge --abort 2>/dev/null`); } catch {}
  try {
    execSync(`git -C ${TEST_REPO} config user.email "test@gitcrab.dev"`);
    execSync(`git -C ${TEST_REPO} config user.name "Git Crab Test"`);
  } catch {}
});

// ── Suite 13: Commit Search (local filter) ───────────────────────────────────

describe("GitFeatures 13 — Commit search: local filter", () => {
  before(async () => { await openRepo(); });

  it("search input exists", async () => {
    const el = await $(`#commit-search`);
    await expect(el).toExist();
  });

  it("typing 'initial' filters to matching commits", async () => {
    const input = await $(`#commit-search`);
    await input.setValue("initial");
    await browser.pause(400);
    await ss("13-search-initial");

    const count = await browser.execute(() =>
      document.querySelectorAll("[data-testid^='commit-row-']").length
    );
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("count badge shows 'X of Y' while query active", async () => {
    const badge = await browser.execute(() => {
      const spans = Array.from(document.querySelectorAll("span"));
      return spans.find(s => / of /.test(s.textContent ?? ""))?.textContent?.trim() ?? null;
    });
    expect(badge).not.toBeNull();
    expect(badge).toMatch(/\d+ of \d+/);
  });

  it("X button clears search and removes badge", async () => {
    await clearSearch();

    const badge = await browser.execute(() => {
      const spans = Array.from(document.querySelectorAll("span"));
      return spans.find(s => / of \d/.test(s.textContent ?? ""))?.textContent?.trim() ?? null;
    });
    expect(badge).toBeNull();
  });
});

// ── Suite 14: Commit Search (server-side fallback) ───────────────────────────

describe("GitFeatures 14 — Commit search: server-side fallback", () => {
  before(async () => { await resetGraphState(); });

  it("query with no local match shows 'Search all commits' button", async () => {
    const input = await $(`#commit-search`);
    await input.setValue("xyzzy-no-match-9999");
    await browser.pause(500);
    await ss("14-no-local-results");

    const btn = await byTestId("search-all-commits-btn");
    await expect(btn).toExist();
  });

  it("clicking button fires server search and app stays alive", async () => {
    await clickByTestId("search-all-commits-btn");
    await browser.pause(3000);
    await ss("14-server-search-result");

    const alive = await browser.execute(() => document.readyState);
    expect(alive).toBe("complete");
  });

  it("clearing search returns to normal graph with commit rows", async () => {
    await clearSearch();
    await browser.pause(600);

    const rows = await $$("[data-testid^='commit-row-']");
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Suite 15: Reflog ──────────────────────────────────────────────────────────

describe("GitFeatures 15 — Reflog sidebar section", () => {
  before(async () => { await resetGraphState(); });

  it("sidebar has Reflog section header button", async () => {
    const reflogBtn = await browser.execute(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      return btns.some(b => /Reflog/.test(b.textContent ?? ""));
    });
    expect(reflogBtn).toBe(true);
    await ss("15-reflog-section");
  });

  it("clicking Reflog header expands and shows entries", async () => {
    await browser.execute(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const btn = btns.find(b => /Reflog/.test(b.textContent ?? "")) as HTMLElement | undefined;
      btn?.click();
    });
    await browser.pause(600);
    await ss("15-reflog-expanded");

    const item = await byTestId("reflog-item-0");
    await expect(item).toExist();
  });

  it("reflog entry text contains a short hash", async () => {
    const item = await byTestId("reflog-item-0");
    const text = await item.getText();
    expect(text).toMatch(/[0-9a-f]{7}/);
  });

  it("clicking reflog entry doesn't crash the app", async () => {
    const item = await byTestId("reflog-item-0");
    await item.click();
    await browser.pause(800);
    await ss("15-reflog-clicked");
    await expect(await $("body")).toExist();
  });

  it("collapse reflog section", async () => {
    await browser.execute(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const btn = btns.find(b => /Reflog/.test(b.textContent ?? "")) as HTMLElement | undefined;
      btn?.click();
    });
    await browser.pause(300);
    const item = await $('[data-testid="reflog-item-0"]');
    await expect(item).not.toExist();
  });
});

// ── Suite 16: File History ────────────────────────────────────────────────────

describe("GitFeatures 16 — File History from CommitDetail", () => {
  before(async () => { await selectFirstCommit(); });

  it("right-click changed file shows File History option", async () => {
    await rightClickFirstCommitFile();
    await ss("16-commit-file-ctx");

    const item = await byTestId("ctx-file-history");
    await expect(item).toExist();
  });

  it("clicking File History writes localStorage key", async () => {
    await browser.execute(() => {
      Object.keys(localStorage)
        .filter(k => k.startsWith("git_rust_filehistory_"))
        .forEach(k => localStorage.removeItem(k));
    });

    const item = await byTestId("ctx-file-history");
    await item.click();
    await browser.pause(600);
    await ss("16-file-history-clicked");

    const key = await browser.execute(() =>
      Object.keys(localStorage).find(k => k.startsWith("git_rust_filehistory_")) ?? null
    );
    expect(key).not.toBeNull();
  });

  it("localStorage entry has repoPath and filePath", async () => {
    const raw = await browser.execute(() => {
      const k = Object.keys(localStorage).find(k => k.startsWith("git_rust_filehistory_"));
      return k ? localStorage.getItem(k) : null;
    });
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.repoPath).toBeTruthy();
    expect(parsed.filePath).toBeTruthy();
  });
});

// ── Suite 17: Blame ───────────────────────────────────────────────────────────

describe("GitFeatures 17 — Blame from CommitDetail", () => {
  before(async () => { await selectFirstCommit(); });

  it("right-click changed file shows Blame option", async () => {
    await rightClickFirstCommitFile();
    await ss("17-blame-ctx");

    const item = await byTestId("ctx-file-blame");
    await expect(item).toExist();
  });

  it("clicking Blame writes localStorage key", async () => {
    await browser.execute(() => {
      Object.keys(localStorage)
        .filter(k => k.startsWith("git_rust_blame_"))
        .forEach(k => localStorage.removeItem(k));
    });

    const item = await byTestId("ctx-file-blame");
    await item.click();
    await browser.pause(600);
    await ss("17-blame-clicked");

    const key = await browser.execute(() =>
      Object.keys(localStorage).find(k => k.startsWith("git_rust_blame_")) ?? null
    );
    expect(key).not.toBeNull();
  });

  it("localStorage blame entry has repoPath, filePath, commitHash", async () => {
    const raw = await browser.execute(() => {
      const k = Object.keys(localStorage).find(k => k.startsWith("git_rust_blame_"));
      return k ? localStorage.getItem(k) : null;
    });
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.repoPath).toBeTruthy();
    expect(parsed.filePath).toBeTruthy();
    expect(parsed.commitHash).toBeTruthy();
  });
});

// ── Suite 18: Interactive Rebase ──────────────────────────────────────────────

describe("GitFeatures 18 — Interactive Rebase dialog", () => {
  before(async () => { await resetGraphState(); });

  it("at least 2 commit rows exist in graph", async () => {
    await browser.waitUntil(async () => {
      const rows = await $$("[data-testid^='commit-row-']");
      return rows.length >= 2;
    }, { timeout: 6000, timeoutMsg: "Less than 2 commit rows after 6s" });

    const count = await browser.execute(() =>
      document.querySelectorAll("[data-testid^='commit-row-']").length
    );
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("right-clicking second commit shows Interactive Rebase menu item", async () => {
    const rowTestIds = await browser.execute(() =>
      Array.from(document.querySelectorAll("[data-testid^='commit-row-']"))
        .map(el => (el as HTMLElement).dataset.testid!)
    );
    await triggerContextMenu(`[data-testid="${rowTestIds[1]}"]`);
    await ss("18-commit-ctx-menu");

    const item = await byTestId("ctx-interactive-rebase");
    await expect(item).toExist();
  });

  it("clicking Interactive Rebase opens the dialog", async () => {
    const item = await byTestId("ctx-interactive-rebase");
    await item.click();
    await browser.pause(2000);
    await ss("18-interactive-rebase-dialog");

    const dialog = await byTestId("interactive-rebase-dialog");
    await expect(dialog).toExist();
  });

  it("dialog shows at least one draggable commit step", async () => {
    const stepCount = await browser.execute(() =>
      document.querySelectorAll('[data-testid="interactive-rebase-dialog"] [draggable="true"]').length
    );
    await ss("18-rebase-steps");
    expect(stepCount).toBeGreaterThanOrEqual(1);
  });

  it("Cancel closes the dialog", async () => {
    await clickByTestId("interactive-rebase-cancel");
    await browser.pause(500);
    await ss("18-rebase-cancelled");

    const dialog = await $('[data-testid="interactive-rebase-dialog"]');
    await expect(dialog).not.toExist();
  });
});

// ── Suite 19: Hunk-level staging ─────────────────────────────────────────────

describe("GitFeatures 19 — Hunk-level staging", () => {
  before(async () => {
    await resetGraphState();
    fs.appendFileSync(`${TEST_REPO}/file.txt`, "\nhunk-staging test line A\nhunk-staging test line B\n");
    await browser.execute(() => {
      const btn = document.querySelector('button[title="Refresh"]') as HTMLElement | null;
      btn?.click();
    });
    await browser.pause(800);
  });

  it("dirty file.txt appears in working tree", async () => {
    const el = await byTestId("worktree-file-file.txt");
    await expect(el).toExist();
    await ss("19-dirty-file");
  });

  it("clicking file.txt loads diff content into panel", async () => {
    const el = await byTestId("worktree-file-file.txt");
    await el.click();
    await browser.pause(1200);
    await ss("19-diff-loaded");

    const hasContent = await browser.execute(() => {
      const cm = document.querySelector(".cm-content");
      return cm ? (cm.textContent?.length ?? 0) > 0 : false;
    });
    expect(hasContent).toBe(true);
  });

  it("stage-all-btn stages entire file", async () => {
    const btn = await byTestId("stage-all-btn");
    await expect(btn).toExist();
    await btn.click();
    await browser.pause(800);
    await ss("19-after-stage-all");

    const unstageBtn = await byTestId("unstage-all-btn");
    await expect(unstageBtn).toExist();
  });

  it("unstage-all-btn returns file to unstaged", async () => {
    const btn = await byTestId("unstage-all-btn");
    await btn.click();
    await browser.pause(800);

    const el = await byTestId("worktree-file-file.txt");
    await expect(el).toExist();
  });
});
