import { config } from "../config.js";

export async function transcribe(
  audio: Buffer,
  mime = "audio/webm",
): Promise<string | null> {
  if (!config.groqKey) {
    throw new Error("Missing GROQ_API_KEY. Add it to your .env file.");
  }

  const ext = mime.includes("wav") ? "wav" : "webm";

  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(audio)], { type: mime }),
    `speech.${ext}`,
  );
  form.append("model", "whisper-large-v3-turbo");
  form.append("language", "en");
  form.append("temperature", "0");
  form.append("response_format", "json");
  form.append(
    "prompt",
    "Alchemist, Brave, Edge, Chrome, VS Code, Notepad, GitHub, " +
      "open, search, first site, create a file, close chat.",
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
}