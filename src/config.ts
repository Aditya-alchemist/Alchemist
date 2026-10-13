import "dotenv/config";

export const config = {
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
  model: process.env.OPENROUTER_MODEL ?? "openrouter/free",
  groqKey: process.env.GROQ_API_KEY ?? "",
};

export function validateConfig(): void {
  if (!config.apiKey) {
    throw new Error(
      "Missing OPENROUTER_API_KEY. Add it to your .env file.",
    );
  }
}