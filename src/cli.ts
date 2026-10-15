#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  config,
  configFile,
  pidFile,
  validateConfig,
} from "./config.js";
import { runSetup } from "./setup.js";
import { allowedRoots, fullAccess } from "./tools/safety.js";
import { speak } from "./voice/output.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

function resolveElectron(): string | undefined {
  try {
    return require("electron") as unknown as string;
  } catch {
    return undefined;
  }
}

// npm may skip Electron's install script, so download the binary if missing.
function ensureElectron(): string | undefined {
  const existing = resolveElectron();
  if (existing) return existing;

  try {
    const dir = path.dirname(require.resolve("electron/package.json"));
    console.log("Downloading the Electron runtime (one-time setup)...");
    spawnSync(process.execPath, [path.join(dir, "install.js")], {
      stdio: "inherit",
    });
  } catch {
    // fall through
  }
  return resolveElectron();
}

function runningPid(): number | undefined {
  try {
    const pid = Number(fs.readFileSync(pidFile, "utf8"));
    if (!pid) return undefined;
    process.kill(pid, 0);
    return pid;
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "start";

  switch (command) {
    case "help":
    case "--help":
    case "-h":
      console.log(`
Alchemist Personal Assistant

Usage:
  alchemist setup           Enter API keys and choose settings
  alchemist start           Launch Alchemist (press Ctrl+Alt+A to talk)
  alchemist stop            Stop the background app
  alchemist config          Show where settings are stored
  alchemist doctor          Check configuration
  alchemist say <text>      Speak a line of text (voice test)
  alchemist help            Show this help
`);
      return;

    case "setup":
      await runSetup();
      return;

    case "config":
      console.log(`Settings file: ${configFile}`);
      console.log("Run 'alchemist setup' to change them.");
      return;

    case "doctor":
      try {
        validateConfig();
        console.log("OpenRouter key: set");
        console.log(`Model: ${config.model}`);
        console.log(
          config.groqKey
            ? "Speech recognition: Groq Whisper"
            : "Speech recognition: MISSING (run alchemist setup)",
        );
        console.log(
          fullAccess ? "Access mode: FULL" : "Access mode: approved folders",
        );
        console.log(
          config.autoApprove
            ? "Confirmations: OFF (always allow)"
            : "Confirmations: ask before writes and commands",
        );
        for (const r of allowedRoots) console.log(`  ${r}`);
        console.log(
          resolveElectron()
            ? "Electron runtime: installed"
            : "Electron runtime: will download on first start",
        );
      } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
      }
      return;

    case "say":
      await speak(
        process.argv.slice(3).join(" ") || "Good evening. Alchemist is online.",
      );
      return;

    case "stop": {
      const pid = runningPid();
      if (!pid) {
        console.log("Alchemist is not running.");
        return;
      }
      process.kill(pid);
      fs.rmSync(pidFile, { force: true });
      console.log("Alchemist stopped.");
      return;
    }

    case "start": {
      if (runningPid()) {
        console.log("Alchemist is already running. Press Ctrl+Alt+A to talk.");
        return;
      }

      try {
        validateConfig();
      } catch {
        console.error("Alchemist is not set up yet. Run: alchemist setup");
        process.exitCode = 1;
        return;
      }

      if (!config.groqKey) {
        console.log(
          "Warning: no Groq key, so voice input will not work. Run: alchemist setup",
        );
      }

      const electronPath = ensureElectron();
      if (!electronPath) {
        console.error(
          "Could not install the Electron runtime. Check your internet connection and try again.",
        );
        process.exitCode = 1;
        return;
      }

      const child = spawn(electronPath, [root], {
        cwd: root,
        detached: true,
        stdio: "ignore",
      });
      child.unref();

      console.log("Alchemist is running in the background.");
      console.log("Press Ctrl+Alt+A to talk. Run 'alchemist stop' to quit.");
      return;
    }

    default:
      console.error(`Unknown command: ${command}`);
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});