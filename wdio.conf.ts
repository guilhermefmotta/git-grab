import { ChildProcess, spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { waitTauriDriverReady } from "@crabnebula/tauri-driver";
import type { Options } from "@wdio/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const applicationPath = path.resolve(__dirname, "src-tauri/target/debug/git-crab");

let tauriDriver: ChildProcess;
let killedTauriDriver = false;

function closeTauriDriver() {
  killedTauriDriver = true;
  tauriDriver?.kill();
}

export const config: Options.Testrunner = {
  specs: ["./tests/e2e/features.spec.ts"],
  maxInstances: 1,

  capabilities: [
    {
      maxInstances: 1,
      "tauri:options": { application: applicationPath },
    } as WebdriverIO.Capabilities,
  ],

  logLevel: "warn",
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: { ui: "bdd", timeout: 60000 },
  connectionRetryCount: 0,

  host: "127.0.0.1",
  port: 4444,

  beforeSession: async () => {
    tauriDriver = spawn(
      path.resolve(__dirname, "node_modules/.bin/tauri-driver"),
      [],
      { stdio: [null, process.stdout, process.stderr], shell: false }
    );
    tauriDriver.on("error", (err) => { console.error("tauri-driver error:", err); process.exit(1); });
    tauriDriver.on("exit", (code) => {
      if (!killedTauriDriver) { console.error("tauri-driver exited:", code); process.exit(1); }
    });
    await waitTauriDriverReady();
  },

  afterSession: () => { closeTauriDriver(); },
};
