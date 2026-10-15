import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { configFile, readStored, saveConfig } from "./config.js";

function mask(key?: string): string {
  return key ? `${key.slice(0, 4)}...${key.slice(-3)}` : "";
}

export async function runSetup(): Promise<void> {
  const current = readStored();
  const rl = readline.createInterface({ input: stdin, output: stdout });

  const ask = async (question: string, hint = ""): Promise<string> =>
    (await rl.question(hint ? `${question} [${hint}] ` : `${question} `)).trim();

  console.log("\nAlchemist setup\n");
  console.log(`Settings are saved in plain text at:\n  ${configFile}\n`);
  console.log("Press Enter to keep a value shown in brackets.\n");

  const openrouterKey =
    (await ask(
      "OpenRouter API key (create one at https://openrouter.ai/keys):",
      mask(current.openrouterKey),
    )) || current.openrouterKey;

  const model =
    (await ask(
      "Model (must support tool calling):",
      current.model ?? "openrouter/free",
    )) ||
    current.model ||
    "openrouter/free";

  const groqKey =
    (await ask(
      "Groq API key for speech recognition (https://console.groq.com):",
      mask(current.groqKey),
    )) || current.groqKey;

  const accessAnswer = (
    await ask(
      "File access: 1 = Desktop and Documents only, 2 = whole computer:",
      current.access === "full" ? "2" : "1",
    )
  ).trim();
  const access: "full" | "folders" =
    (accessAnswer || (current.access === "full" ? "2" : "1")) === "2"
      ? "full"
      : "folders";

  console.log(
    "\nBy default Alchemist asks before writing files or running commands.",
  );
  console.log(
    "'Always allow' skips those questions. Speech recognition can mishear,",
  );
  console.log("so only enable it if you accept that risk.");
  const autoAnswer = (
    await ask(
      "Always allow actions without asking? (yes/no):",
      current.autoApprove ? "yes" : "no",
    )
  ).toLowerCase();
  const autoApprove = autoAnswer
    ? /^y/.test(autoAnswer)
    : Boolean(current.autoApprove);

  rl.close();

  saveConfig({
    ...(openrouterKey ? { openrouterKey } : {}),
    model,
    ...(groqKey ? { groqKey } : {}),
    access,
    autoApprove,
  });

  console.log("\nSaved. Start Alchemist with:  alchemist start");
  if (!groqKey) {
    console.log("Note: without a Groq key, voice input will not work.");
  }
}