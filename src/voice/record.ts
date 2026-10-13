import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";

function script(file: string): string {
  const safe = file.replace(/'/g, "''");
  return `
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class AlcMci {
  [DllImport("winmm.dll", CharSet = CharSet.Auto)]
  public static extern int mciSendString(string cmd, StringBuilder ret, int len, IntPtr cb);
}
"@
function Mci($c) { [void][AlcMci]::mciSendString($c, $null, 0, [IntPtr]::Zero) }
$f = '${safe}'
Mci 'open new type waveaudio alias alcrec'
Mci 'set alcrec format tag pcm'
Mci 'set alcrec channels 1'
Mci 'set alcrec samplespersec 16000'
Mci 'set alcrec bitspersample 16'
Mci 'set alcrec alignment 2'
Mci 'set alcrec bytespersec 32000'
Mci 'record alcrec'
Write-Output 'RECORDING'
[void][Console]::In.ReadLine()
Mci 'stop alcrec'
Mci ('save alcrec "' + $f + '"')
Mci 'close alcrec'
Write-Output 'SAVED'
`;
}

export interface Recorder {
  /** Stops recording and resolves with a WAV file path, or null if nothing usable. */
  stop: () => Promise<string | null>;
  cancel: () => void;
}

export function startRecording(): Recorder {
  const file = path.join(os.tmpdir(), `alchemist-${Date.now()}.wav`);
  const encoded = Buffer.from(script(file), "utf16le").toString("base64");

  const child = spawn(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
    { stdio: ["pipe", "pipe", "ignore"], windowsHide: true },
  );

  const done = new Promise<void>((resolve) => {
    child.on("close", () => resolve());
    child.on("error", () => resolve());
  });

  // Drain stdout so the process never blocks.
  readline.createInterface({ input: child.stdout! }).on("line", () => {});

  return {
    async stop() {
      child.stdin!.write("stop\n");
      const timer = setTimeout(() => child.kill(), 8000);
      await done;
      clearTimeout(timer);

      try {
        // Under ~0.5 seconds of audio is just a mis-press.
        if (fs.statSync(file).size < 16000) {
          fs.rmSync(file, { force: true });
          return null;
        }
        return file;
      } catch {
        return null;
      }
    },
    cancel() {
      child.kill();
      fs.rmSync(file, { force: true });
    },
  };
}