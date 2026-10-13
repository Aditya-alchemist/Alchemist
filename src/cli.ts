#!/usr/bin/env node

import * as readline from "node:readline";
import { AlchemistAssistant } from "./assistant.js";
import { speak, stopSpeaking } from "./voice/output.js";
import { listenOnce, watchHotkey, type Listening } from "./voice/input.js";
import { allowedRoots, fullAccess } from "./tools/safety.js";

async function main(): Promise<void> {
  const command = process.argv[2] ?? "start";

  if (command === "--help" || command === "help") {
    console.log(`
Alchemist Personal Assistant

Usage:
  alchemist start           Start Alchemist (type, or press Ctrl+Alt+A to speak)
  alchemist say <text>      Speak a line of text (voice test)
  alchemist doctor          Check configuration
  alchemist help            Show this help
`);
    return;
  }

  if (command === "doctor") {
    const { validateConfig } = await import("./config.js");

    try {
      validateConfig();
      console.log("Configuration looks good.");
      console.log(
        fullAccess ? "Access mode: FULL" : "Access mode: approved folders",
      );
      for (const root of allowedRoots) console.log(`  ${root}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }

    return;
  }

  if (command === "say") {
    const text =
      process.argv.slice(3).join(" ") || "Good evening. Alchemist is online.";
    await speak(text);
    return;
  }

  if (command !== "start") {
    console.error(`Unknown command: ${command}`);
    process.exitCode = 1;
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "You > ",
  });

  let pendingConfirm: ((ok: boolean) => void) | undefined;
  let busy = false;
  let listening: Listening | undefined;

  const confirm = (question: string): Promise<boolean> =>
    new Promise((resolve) => {
      console.log(`\n  ** ${question}`);
      console.log("  (type yes/no, or press Ctrl+Alt+A and say it)");
      void speak(question);
      pendingConfirm = resolve;
      rl.setPrompt("Confirm (yes/no) > ");
      rl.prompt();
    });

  const alchemist = new AlchemistAssistant(confirm);

  async function handleInput(input: string): Promise<void> {
    if (pendingConfirm) {
      const ok = /^(y|yes|yeah|yep|confirm|go ahead|do it|proceed)\b/i.test(
        input,
      );
      const resolve = pendingConfirm;
      pendingConfirm = undefined;
      rl.setPrompt("You > ");
      resolve(ok);
      return;
    }

    if (input.toLowerCase() === "exit") {
      rl.close();
      return;
    }

    if (!input) {
      rl.prompt();
      return;
    }

    if (busy) {
      console.log("  (still working on the previous request)");
      return;
    }

    stopSpeaking();
    busy = true;

    try {
      const answer = await alchemist.ask(input);
      console.log(`\nAlchemist > ${answer}\n`);
      busy = false;
      rl.prompt();
      await speak(answer);
    } catch (error) {
      busy = false;
      console.error(
        "\nAlchemist error:",
        error instanceof Error ? error.message : error,
        "\n",
      );
      rl.prompt();
    }
  }

  function toggleListening(): void {
    if (listening) {
      listening.cancel();
      listening = undefined;
      console.log("\n  (stopped listening)");
      rl.prompt();
      return;
    }

    stopSpeaking();
    console.log("\n  Listening... speak now (Ctrl+Alt+A again to cancel)");

    const current = listenOnce();
    listening = current;

    void current.result.then((text) => {
      if (listening !== current) return; // cancelled
      listening = undefined;

      if (text) {
        console.log(`You (voice) > ${text}`);
        void handleInput(text);
      } else {
        console.log("  (didn't catch anything)");
        rl.prompt();
      }
    });
  }

  const hotkey = watchHotkey(toggleListening, () =>
    console.log(
      "  Could not register Ctrl+Alt+A. Another app may be using it; type instead.",
    ),
  );

  console.log(
    "Alchemist online. Type, or press Ctrl+Alt+A to speak. 'exit' to quit.",
  );
  console.log(
    fullAccess ? "Access mode: FULL\n" : "Access mode: approved folders\n",
  );
  rl.prompt();

  rl.on("line", (line) => {
    void handleInput(line.trim());
  });

  rl.on("close", () => {
    listening?.cancel();
    hotkey.kill();
    stopSpeaking();
    console.log("\nAlchemist offline. Goodbye.");
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});