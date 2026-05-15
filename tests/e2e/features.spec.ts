/**
 * E2E — New features: resizable columns, rollback dialog,
 *        WorkingTree double-click, Show in folder context menu
 */
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";
import { execSync } from "child_process";

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const SS          = path.resolve(__dirname, "../screenshots/features");
const TEST_REPO   = "/tmp/git-crab-test-merge";
const RECENT_CFG  = path.join(os.homedir(), ".config", "git_crab", "recent.json");

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

/** Simulate mousedown + mousemove + mouseup via JS (works with WebKit) */
async function simulateDrag(selector: string, deltaX: number) {
  await browser.execute(
    (sel: string, dx: number) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) throw new Error(`selector not found: ${sel}`);
      const rect = el.getBoundingClientRect();
      const cx   = Math.round(rect.left + rect.width / 2);
      const cy   = Math.round(rect.top  + rect.height / 2);
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: cx, clientY: cy, button: 0 }));
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: cx + dx, clientY: cy }));
      window.dispatchEvent(new MouseEvent("mouseup",   { bubbles: true, clientX: cx + dx, clientY: cy }));
    },
    selector,
    deltaX,
  );
  await browser.pause(200);
}

/** Right-click via contextmenu JS event — opens Radix ContextMenu */
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

async function dismissMenu() {
  await browser.keys("Escape");
  await browser.pause(300);
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

async function clickRefreshWorkingTree() {
  await browser.execute(() => {
    const btn = document.querySelector('button[title="Refresh"]') as HTMLElement | null;
    btn?.click();
  });
  await browser.pause(600);
}

// ── Setup: clean repo with a modified file ─────────────────────────────────────

before(async () => {
  // Fresh repo with conflict state, then abort → clean master with dirty file
  try { execSync("bash /tmp/setup-test-repo.sh 2>/dev/null"); } catch {}
  try { execSync(`git -C ${TEST_REPO} merge --abort 2>/dev/null`); } catch {}
  // dirty file.txt so it appears in working tree
  fs.appendFileSync(`${TEST_REPO}/file.txt`, "\nmodified for test\n");
});

// ── Suite 1: Resizable columns ────────────────────────────────────────────────

describe("Features 01 — Resizable columns", () => {
  before(async () => { await openRepo(); });

  it("sidebar resize divider exists", async () => {
    const el = await byTestId("resize-divider-sidebar");
    await expect(el).toExist();
    await ss("01-divider-exists");
  });

  it("detail resize divider exists", async () => {
    const el = await byTestId("resize-divider-detail");
    await expect(el).toExist();
  });

  it("drag sidebar divider right expands sidebar", async () => {
    const before = await browser.execute(() => {
      const el = document.querySelector('[data-testid="sidebar-wrapper"]') as HTMLElement;
      return el ? el.getBoundingClientRect().width : 0;
    });

    await simulateDrag('[data-testid="resize-divider-sidebar"]', 80);
    await ss("02-after-sidebar-drag");

    const after = await browser.execute(() => {
      const el = document.querySelector('[data-testid="sidebar-wrapper"]') as HTMLElement;
      return el ? el.getBoundingClientRect().width : 0;
    });
    expect(after).toBeGreaterThan(before + 50);
  });

  it("drag detail divider left expands detail panel", async () => {
    const before = await browser.execute(() => {
      const el = document.querySelector('[data-testid="detail-wrapper"]') as HTMLElement;
      return el ? el.getBoundingClientRect().width : 0;
    });

    await simulateDrag('[data-testid="resize-divider-detail"]', -80);
    await ss("03-after-detail-drag");

    const after = await browser.execute(() => {
      const el = document.querySelector('[data-testid="detail-wrapper"]') as HTMLElement;
      return el ? el.getBoundingClientRect().width : 0;
    });
    expect(after).toBeGreaterThan(before + 50);
  });

  it("sidebar respects min width (160px)", async () => {
    await simulateDrag('[data-testid="resize-divider-sidebar"]', -1000);
    await ss("04-min-width-clamp");

    const width = await browser.execute(() => {
      const el = document.querySelector('[data-testid="sidebar-wrapper"]') as HTMLElement;
      return el ? el.getBoundingClientRect().width : 0;
    });
    expect(width).toBeGreaterThanOrEqual(159);
  });

  it("restore sidebar to working width", async () => {
    // Expand sidebar back to ~240 so remaining tests work
    await simulateDrag('[data-testid="resize-divider-sidebar"]', 100);
    await browser.pause(100);
  });
});

// ── Suite 2: Rollback dialog ──────────────────────────────────────────────────

describe("Features 02 — Rollback dialog", () => {
  it("HEAD branch context menu shows Rollback option", async () => {
    await triggerContextMenu('[data-testid="head-branch-item"]');
    await ss("05-branch-context-menu");

    const item = await byTestId("branch-rollback-menuitem");
    await expect(item).toExist();
  });

  it("click Rollback opens dialog", async () => {
    await clickByTestId("branch-rollback-menuitem");
    await browser.pause(800);
    await ss("06-rollback-dialog-open");

    const dialog = await byTestId("rollback-dialog");
    await expect(dialog).toExist();
  });

  it("dialog lists files with checkboxes", async () => {
    const checkboxes = await $$('[data-testid="rollback-dialog"] input[type="checkbox"]');
    expect(checkboxes.length).toBeGreaterThanOrEqual(1);
    await ss("07-rollback-files-listed");
  });

  it("dialog has cancel and confirm buttons", async () => {
    await expect(await byTestId("rollback-cancel")).toExist();
    await expect(await byTestId("rollback-confirm")).toExist();
  });

  it("cancel closes dialog", async () => {
    await clickByTestId("rollback-cancel");
    await ss("08-rollback-cancelled");

    const dialog = await $('[data-testid="rollback-dialog"]');
    await expect(dialog).not.toExist();
  });
});

// ── Suite 3: Rollback executes ────────────────────────────────────────────────

describe("Features 03 — Rollback executes discard", () => {
  before(async () => {
    fs.appendFileSync(`${TEST_REPO}/file.txt`, "\ndirty again\n");
    await clickRefreshWorkingTree();
  });

  it("open rollback dialog", async () => {
    await triggerContextMenu('[data-testid="head-branch-item"]');
    await browser.pause(400);
    await clickByTestId("branch-rollback-menuitem");
    await browser.pause(800);

    const dialog = await byTestId("rollback-dialog");
    await expect(dialog).toExist();
    await ss("09-rollback-dialog-reopen");
  });

  it("confirm button enabled when files selected", async () => {
    const confirm = await byTestId("rollback-confirm");
    expect(await confirm.isEnabled()).toBe(true);
  });

  it("rollback executes and dialog closes", async () => {
    await clickByTestId("rollback-confirm");
    await browser.pause(1500);
    await ss("10-after-rollback");

    const dialog = await $('[data-testid="rollback-dialog"]');
    await expect(dialog).not.toExist();
  });
});

// ── Suite 4: WorkingTree — context menus ──────────────────────────────────────

describe("Features 04 — WorkingTree context menus", () => {
  before(async () => {
    // Re-dirty file and refresh status
    fs.appendFileSync(`${TEST_REPO}/file.txt`, "\ndirty for wt test\n");
    await clickRefreshWorkingTree();
  });

  it("file.txt appears in working tree via testid", async () => {
    const el = await byTestId("worktree-file-file.txt");
    await expect(el).toExist();
    await ss("11-file-in-worktree");
  });

  it("right-click on file shows Show in folder option", async () => {
    await triggerContextMenu('[data-testid="worktree-file-file.txt"]');
    await ss("12-worktree-context-menu");

    const item = await byTestId("file-show-folder-menuitem");
    await expect(item).toExist();
  });

  it("context menu also shows Open in editor", async () => {
    const item = await byTestId("file-open-editor-menuitem");
    await expect(item).toExist();
  });

  it("dismiss context menu", async () => {
    await dismissMenu();
  });
});

// ── Suite 5: WorkingTree — double-click (no crash) ────────────────────────────

describe("Features 05 — WorkingTree double-click", () => {
  it("double-click file does not crash app", async () => {
    await browser.execute(() => {
      const el = document.querySelector('[data-testid="worktree-file-file.txt"]') as HTMLElement | null;
      el?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    await browser.pause(600);
    await ss("13-after-dblclick");

    // App still alive
    await expect(await $("body")).toExist();
  });
});
