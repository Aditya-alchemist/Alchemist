import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { config as loadEnv } from "dotenv";

// Development fallback only: a .env in the current folder.
loadEnv({ quiet: true });

export const configDir = path.join(
  process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
  "alchemist",
);
export const configFile = path.join(configDir, "config.json");
export const pidFile = path.join(configDir, "alchemist.pid");

export interface StoredConfig {
  openrouterKey?: string;
  model?: string;
  groqKey?: string;
  access?: "full" | "folders";
  roots?: string[];
  autoApprove?: boolean;
}

export function readStored(): StoredConfig {
  try {
    return JSON.parse(fs.readFileSync(configFile, "utf8")) as StoredConfig;
  } catch {
    return {};
  }
}

export function saveConfig(patch: StoredConfig): void {
  fs.mkdirSync(configDir, { recursive: true });
  const next = { ...readStored(), ...patch };
  fs.writeFileSync(configFile, JSON.stringify(next, null, 2), "utf8");
}

const stored = readStored();
const env = process.env;

export const config = {
  apiKey: stored.openrouterKey || env.OPENROUTER_API_KEY || "",
  model: stored.model || env.OPENROUTER_MODEL || "openrouter/free",
  groqKey: stored.groqKey || env.GROQ_API_KEY || "",
  fullAccess:
    (stored.access ?? env.ALCHEMIST_ACCESS ?? "folders").toLowerCase() ===
    "full",
  roots:
    stored.roots ??
    (env.ALCHEMIST_ROOTS
      ? env.ALCHEMIST_ROOTS.split(";").map((s) => s.trim()).filter(Boolean)
      : []),
  autoApprove:
    stored.autoApprove ?? env.ALCHEMIST_AUTO_APPROVE?.toLowerCase() === "true",
};

export function validateConfig(): void {
  if (!config.apiKey) {
    throw new Error("Missing OpenRouter API key. Run: alchemist setup");
  }
}