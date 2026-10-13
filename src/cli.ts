#!/usr/bin/env node

import * as readline from "node:readline";
import { AlchemistAssistant } from "./assistant.js";
import { config } from "./config.js";
import { speak, stopSpeaking } from "./voice/output.js";
import { listenOnce, watchHotkey, type Listening } from "./voice/input.js";
import { startRecording, type Recorder } from "./voice/record.js";
import { transcribe } from "./voice/transcribe.js";
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
      console.log(
        config.groqKey
          ? "Speech recognition: Groq Whisper"
          : "Speech recognition: Windows built-in (set GROQ_API_KEY for better accuracy)",
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

  const useWhisper = Boolean(config.groqKey);

  let pendingConfirm: ((ok: boolean) => void) | undefined;
  let busy = false;
  let recorder: Recorder | undefined;
  let fallback: Listening | undefined;

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

  async function toggleWhisper(): Promise<void> {
    if (recorder) {
      const current = recorder;
      recorder = undefined;
      console.log("  Transcribing...");

      try {
        const file = await current.stop();
        if (!file) {
          console.log("  (no speech captured)");
          rl.prompt();
          return;
        }

        const text = await transcribe(file);
        if (!text) {
          console.log("  (didn't catch anything)");
          rl.prompt();
          return;
        }

        console.log(`You (voice) > ${text}`);
        await handleInput(text);
      } catch (error) {
        console.error(
          "\nVoice error:",
          error instanceof Error ? error.message : error,
        );
        rl.prompt();
      }
      return;
    }

    stopSpeaking(); // keep the microphone from hearing Alchemist itself
    recorder = startRecording();
    console.log(
      "\n  Recording... speak, then press Ctrl+Alt+A again to send.",
    );
  }

  function toggleFallback(): void {
    if (fallback) {
      fallback.cancel();
      fallback = undefined;
      console.log("\n  (stopped listening)");
      rl.prompt();
      return;
    }

    stopSpeaking();
    console.log("\n  Listening... speak now (Ctrl+Alt+A again to cancel)");

    const current = listenOnce();
    fallback = current;

    void current.result.then((text) => {
      if (fallback !== current) return;
      fallback = undefined;

      if (text) {
        console.log(`You (voice) > ${text}`);
        void handleInput(text);
      } else {
        console.log("  (didn't catch anything)");
        rl.prompt();
      }
    });
  }

  const hotkey = watchHotkey(
    () => {
      if (useWhisper) void toggleWhisper();
      else toggleFallback();
    },
    () =>
      console.log(
        "  Could not register Ctrl+Alt+A. Another app may be using it; type instead.",
      ),
  );

  console.log(
    "Alchemist online. Type, or press Ctrl+Alt+A to speak. 'exit' to quit.",
  );
  console.log(
    fullAccess ? "Access mode: FULL" : "Access mode: approved folders",
  );
  console.log(
    useWhisper
      ? "Speech recognition: Groq Whisper\n"
      : "Speech recognition: Windows built-in (add GROQ_API_KEY for better accuracy)\n",
  );
  rl.prompt();

  rl.on("line", (line) => {
    void handleInput(line.trim());
  });

  rl.on("close", () => {
    recorder?.cancel();
    fallback?.cancel();
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