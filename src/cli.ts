#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { speak } from "./voice/output.js";
import { allowedRoots, fullAccess } from "./tools/safety.js";

async function main(): Promise<void> {
  const command = process.argv[2] ?? "start";

  if (command === "--help" || command === "help") {
    console.log(`
Alchemist Personal Assistant

Usage:
  alchemist start           Launch Alchemist (press Ctrl+Alt+A to talk)
  alchemist say <text>      Speak a line of text (voice test)
  alchemist doctor          Check configuration
  alchemist help            Show this help
`);
    return;
  }

  if (command === "doctor") {
    try {
      const { validateConfig } = await import("./config.js");
      validateConfig();
      console.log("Configuration looks good.");
      console.log(
        fullAccess ? "Access mode: FULL" : "Access mode: approved folders",
      );
      console.log(
        config.groqKey
          ? "Speech recognition: Groq Whisper"
          : "Speech recognition: MISSING (set GROQ_API_KEY)",
      );
      for (const root of allowedRoots) console.log(`  ${root}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
    return;
  }

  if (command === "say") {
    await speak(
      process.argv.slice(3).join(" ") || "Good evening. Alchemist is online.",
    );
    return;
  }

  if (command === "start") {
    const require = createRequire(import.meta.url);
    const electronPath = require("electron") as unknown as string;
    const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );

    const child = spawn(electronPath, [root], {
      cwd: root,
      detached: true,
      stdio: "ignore",
    });
    child.unref();

    console.log("Alchemist is running in the background.");
    console.log('Press Ctrl+Alt+A to talk. Say "quit Alchemist" to stop it.');
    return;
  }

  console.error(`Unknown command: ${command}`);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});