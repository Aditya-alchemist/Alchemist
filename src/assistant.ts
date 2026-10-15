import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { OpenRouter } from "@openrouter/sdk";
import { config, validateConfig } from "./config.js";
import { allowedRoots, fullAccess } from "./tools/safety.js";
import { runTool, toolDefinitions, type Confirm } from "./tools/index.js";

function knownFolder(name: string): string {
  const home = os.homedir();
  const onedrive = path.join(home, "OneDrive", name);
  return fs.existsSync(onedrive) ? onedrive : path.join(home, name);
}

function buildSystemPrompt(): string {
  return `
You are Alchemist, a refined personal AI assistant.
Speak in polished, natural British English.
Be composed, helpful, concise, and accurate.
Reply in plain conversational prose. Do not use markdown,
bullet points, headings or asterisks, because your replies
will be read aloud.

You have tools for listing and reading files, writing files,
creating folders, opening applications and websites, searching the web,
and running terminal commands. Writing files and running commands require
the user's confirmation, which the system handles for you.
${
  fullAccess
    ? "You may access any location on this computer except protected credential and system folders."
    : `You may only access these approved folders:\n${allowedRoots.join("\n")}`
}
Always use absolute paths. Use list_directory to find things rather
than guessing. When asked to create a file, write the complete
content with write_file.

The user's Desktop folder is ${knownFolder("Desktop")}.
The user's Documents folder is ${knownFolder("Documents")}.
Use create_folder to make folders and write_file to make files.
Do not use run_command for anything the other tools can do.

Your replies are spoken aloud in a small popup, so keep them to one or two
short sentences. After completing an action, say "Done." with at most a few
extra words.
To search in a browser, use open_url with a search URL such as
https://www.google.com/search?q=blockchain, and set the browser if one was named.
When asked to open the first, second or Nth site or result, call web_search
with the same query as the earlier search, then open that result's url with
open_url in the same browser.

Never claim to have done something unless a tool result confirms it.
If a tool reports an error or a declined request, say so plainly.
Today's date is ${new Date().toDateString()}.
`;
}

// Loosely typed on purpose: tool messages carry extra fields.
type Message = Record<string, any>;

const MAX_TOOL_ROUNDS = 8;

export class AlchemistAssistant {
  private client: OpenRouter | undefined;
  private messages: Message[] = [];

  constructor(private confirm: Confirm) {
    this.resetConversation();
  }

  private getClient(): OpenRouter {
    validateConfig();
    this.client ??= new OpenRouter({
      apiKey: config.apiKey,
      appTitle: "Alchemist Personal Assistant",
    });
    return this.client;
  }

  // Keep recent turns, but never start in the middle of a tool exchange.
  private trimHistory(): void {
    if (this.messages.length <= 31) return;

    const system = this.messages[0]!;
    let rest = this.messages.slice(-30);
    const firstUser = rest.findIndex((m) => m.role === "user");
    rest = firstUser === -1 ? [] : rest.slice(firstUser);
    this.messages = [system, ...rest];
  }

  async ask(input: string): Promise<string> {
    const text = input.trim();
    if (!text) throw new Error("Please provide a message.");

    const checkpoint = this.messages.length;
    this.messages.push({ role: "user", content: text });
    this.trimHistory();

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await this.getClient().chat.send({
          chatRequest: {
            model: config.model,
            messages: this.messages as any,
            tools: toolDefinitions as any,
            temperature: 0.5,
            maxTokens: 800,
            stream: false,
          },
        });

        if (!("choices" in response)) {
          throw new Error("Received a streaming response unexpectedly.");
        }

        const message = response.choices[0]?.message as Message | undefined;
        if (!message) throw new Error("The model returned no response.");

        const toolCalls: Message[] = message.toolCalls ?? [];

        if (toolCalls.length === 0) {
          const answer =
            typeof message.content === "string" ? message.content.trim() : "";
          if (!answer) throw new Error("The model returned no text response.");
          this.messages.push({ role: "assistant", content: answer });
          return answer;
        }

        this.messages.push({
          role: "assistant",
          content: typeof message.content === "string" ? message.content : "",
          toolCalls,
        });

        for (const call of toolCalls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(call.function.arguments || "{}");
          } catch {
            // Empty args; the tool will report what is missing.
          }

          console.log(`  [tool] ${call.function.name}`);
          const result = await runTool(call.function.name, args, this.confirm);

          this.messages.push({
            role: "tool",
            toolCallId: call.id,
            content: result,
          });
        }
      }

      throw new Error("Too many tool steps in a single request.");
    } catch (error) {
      // Roll back the whole failed exchange.
      this.messages.length = Math.min(checkpoint, this.messages.length);
      throw error;
    }
  }

  resetConversation(): void {
    this.messages = [{ role: "system", content: buildSystemPrompt() }];
  }
}