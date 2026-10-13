import * as fs from "node:fs/promises";
import * as path from "node:path";
import { exec, spawn } from "node:child_process";
import { resolveSafe } from "./safety.js";

export type Confirm = (question: string) => Promise<boolean>;

export const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "list_directory",
      description: "List the files and folders inside a directory.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute directory path" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the text content of a file.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute file path" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Create a file, or overwrite an existing one, with the given content. Creates parent folders as needed.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute file path" },
          content: { type: "string", description: "Full file content" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_folder",
      description: "Create a folder.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute folder path" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_app",
      description:
        "Open any installed application by name, such as code, msedge, chrome, notepad, calc, spotify, explorer. The optional path is a file or folder to open with it.",
      parameters: {
        type: "object",
        properties: {
          app: { type: "string" },
          path: {
            type: "string",
            description: "Optional absolute file or folder path",
          },
        },
        required: ["app"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_url",
      description: "Open a website in the default browser.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "http or https URL" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description:
        "Run a Windows terminal command and return its output. The user must approve every command.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" },
          cwd: {
            type: "string",
            description: "Optional absolute working directory",
          },
        },
        required: ["command"],
      },
    },
  },
];

type Args = Record<string, unknown>;

function str(args: Args, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value) {
    throw new Error(`Missing argument: ${key}`);
  }
  return value;
}

function launch(command: string, args: string[]): void {
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.on("error", () => {});
  child.unref();
}

export async function runTool(
  name: string,
  args: Args,
  confirm: Confirm,
): Promise<string> {
  try {
    switch (name) {
      case "list_directory": {
        const dir = resolveSafe(str(args, "path"));
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const lines = entries
          .slice(0, 200)
          .map((e) => `${e.isDirectory() ? "[dir] " : "[file]"} ${e.name}`);
        return lines.join("\n") || "(empty directory)";
      }

      case "read_file": {
        const file = resolveSafe(str(args, "path"));
        const text = await fs.readFile(file, "utf8");
        return text.length > 20000
          ? text.slice(0, 20000) + "\n...[truncated]"
          : text;
      }

      case "write_file": {
        const file = resolveSafe(str(args, "path"));
        const content = str(args, "content");

        let exists = true;
        await fs.access(file).catch(() => (exists = false));

        const verb = exists ? "OVERWRITE" : "create";
        const ok = await confirm(
          `Alchemist wants to ${verb} ${file} (${content.length} characters). Allow?`,
        );
        if (!ok) return "The user declined. Nothing was written.";

        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, content, "utf8");
        return `Wrote ${file}.`;
      }

      case "create_folder": {
        const dir = resolveSafe(str(args, "path"));
        const ok = await confirm(
          `Alchemist wants to create the folder ${dir}. Allow?`,
        );
        if (!ok) return "The user declined. No folder was created.";
        await fs.mkdir(dir, { recursive: true });
        return `Created ${dir}.`;
      }

      case "open_app": {
        const app = str(args, "app");
        if (!/^[\w .\-]+$/.test(app)) {
          return "Error: that application name is not valid.";
        }
        const target =
          typeof args.path === "string" && args.path
            ? resolveSafe(args.path)
            : undefined;
        launch("cmd.exe", ["/c", "start", "", app, ...(target ? [target] : [])]);
        return `Asked Windows to open ${app}${target ? ` at ${target}` : ""}.`;
      }

      case "open_url": {
        const url = str(args, "url");
        if (!/^https?:\/\//i.test(url)) {
          return "Error: only http and https links are allowed.";
        }
        launch("explorer.exe", [url]);
        return `Opened ${url} in the default browser.`;
      }

      case "run_command": {
        const command = str(args, "command");
        const cwd =
          typeof args.cwd === "string" && args.cwd
            ? resolveSafe(args.cwd)
            : undefined;

        if (
          /\b(format\s+[a-z]:|diskpart|bcdedit|reg\s+delete|cipher\s+\/w)\b/i.test(
            command,
          )
        ) {
          return "Error: that command is blocked for safety.";
        }

        const ok = await confirm(
          `Alchemist wants to run: ${command}${cwd ? `  (in ${cwd})` : ""}. Allow?`,
        );
        if (!ok) return "The user declined. The command was not run.";

        return await new Promise<string>((resolve) => {
          exec(
            command,
            { cwd, timeout: 30000, windowsHide: true, maxBuffer: 1024 * 1024 },
            (error, stdout, stderr) => {
              const out = `${stdout}${stderr}`.trim().slice(0, 8000);
              resolve(
                error ? `Failed: ${error.message}\n${out}` : out || "(no output)",
              );
            },
          );
        });
      }

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : String(error)}`;
  }
}