import { cpSync } from "node:fs";

cpSync("src/ui", "dist/ui", { recursive: true });