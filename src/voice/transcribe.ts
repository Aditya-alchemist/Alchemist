import * as fs from "node:fs/promises";
import { config } from "../config.js";

export async function transcribe(file: string): Promise<string | null> {
  try {
    const audio = await fs.readFile(file);

    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(audio)], { type: "audio/wav" }),
      "speech.wav",
    );
    form.append("model", "whisper-large-v3-turbo");
    form.append("language", "en");
    form.append("temperature", "0");
    form.append("response_format", "json");
    // A vocabulary hint helps with names and commands.
    form.append(
      "prompt",
      "Alchemist, VS Code, Visual Studio Code, Edge, Brave, Notepad, " +
        "TypeScript, GitHub, open, create a file, folder, Desktop.",
    );

    const response = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${config.groqKey}` },
        body: form,
      },
    );

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`Transcription failed (${response.status}): ${detail}`);
    }

    const data = (await response.json()) as { text?: string };
    const text = data.text?.trim();
    return text ? text : null;
  } finally {
    await fs.rm(file, { force: true });
  }
}