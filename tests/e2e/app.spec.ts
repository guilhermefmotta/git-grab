import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const screenshotsDir = path.resolve(__dirname, "../screenshots");

async function screenshot(name: string) {
  const file = path.join(screenshotsDir, `${name}.png`);
  fs.mkdirSync(screenshotsDir, { recursive: true });
  await browser.saveScreenshot(file);
  return file;
}

describe("Git Crab — smoke tests", () => {
  it("shows welcome screen on launch", async () => {
    await browser.pause(1500);
    await screenshot("01-launch");

    const body = await $("body");
    await expect(body).toExist();
  });

  it("has open repo button", async () => {
    await screenshot("02-welcome");
    // Toolbar has a + button to open repos
    const plusBtn = await $("button[title='Open repo']");
    await expect(plusBtn).toExist();
  });
});
