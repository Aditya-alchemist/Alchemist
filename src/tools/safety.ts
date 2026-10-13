import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const fullAccess =
  (process.env.ALCHEMIST_ACCESS ?? "").toLowerCase() === "full";

function candidateRoots(): string[] {
  if (fullAccess) {
    return "CDEFGH".split("").map((d) => `${d}:\\`);
  }

  const fromEnv = process.env.ALCHEMIST_ROOTS;
  if (fromEnv) {
    return fromEnv.split(";").map((s) => s.trim()).filter(Boolean);
  }

  const home = os.homedir();
  return [
    path.join(home, "Desktop"),
    path.join(home, "OneDrive", "Desktop"),
    path.join(home, "Documents"),
    path.join(home, "OneDrive", "Documents"),
  ];
}

export const allowedRoots = candidateRoots()
  .map((r) => path.resolve(r))
  .filter((r) => fs.existsSync(r));

const BLOCKED_SEGMENTS = new Set([
  ".ssh",
  ".aws",
  ".gnupg",
  "appdata",
  "windows",
  "program files",
  "program files (x86)",
]);

export function resolveSafe(input: string): string {
  const resolved = path.resolve(input);

  const inside = allowedRoots.some((root) => {
    const rel = path.relative(root, resolved);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  });

  if (!fullAccess && !inside) {
    throw new Error(
      `Access denied: ${resolved} is outside the approved folders.`,
    );
  }

  const base = path.basename(resolved).toLowerCase();
  const segments = resolved.split(path.sep).map((s) => s.toLowerCase());

  if (
    base.startsWith(".env") ||
    segments.some((s) => BLOCKED_SEGMENTS.has(s))
  ) {
    throw new Error(`Access denied: ${resolved} is a protected location.`);
  }

  return resolved;
}