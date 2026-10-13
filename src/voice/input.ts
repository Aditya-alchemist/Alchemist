import { spawn, type ChildProcess } from "node:child_process";
import * as readline from "node:readline";

function powershell(script: string): ChildProcess {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return spawn(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
    { stdio: ["ignore", "pipe", "ignore"], windowsHide: true },
  );
}

const HOTKEY_SCRIPT = `
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing -TypeDefinition @"
using System;
using System.Windows.Forms;
using System.Runtime.InteropServices;
public class AlchemistHotkey : Form {
  [DllImport("user32.dll")]
  static extern bool RegisterHotKey(IntPtr h, int id, uint mod, uint vk);
  protected override void SetVisibleCore(bool v) { base.SetVisibleCore(false); }
  public AlchemistHotkey() {
    // Ctrl (2) + Alt (1) + no-repeat (0x4000), key A (0x41)
    bool ok = RegisterHotKey(Handle, 1, 0x4003, 0x41);
    Console.WriteLine(ok ? "READY" : "ERROR");
    Console.Out.Flush();
  }
  protected override void WndProc(ref Message m) {
    if (m.Msg == 0x0312) { Console.WriteLine("HOTKEY"); Console.Out.Flush(); }
    base.WndProc(ref m);
  }
}
"@
[System.Windows.Forms.Application]::Run((New-Object AlchemistHotkey))
`;

export function watchHotkey(
  onPress: () => void,
  onError: () => void,
): ChildProcess {
  const child = powershell(HOTKEY_SCRIPT);
  const rl = readline.createInterface({ input: child.stdout! });
  rl.on("line", (line) => {
    if (line.trim() === "HOTKEY") onPress();
    if (line.trim() === "ERROR") onError();
  });
  child.on("error", onError);
  return child;
}

const LISTEN_SCRIPT = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Speech
try {
  $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine((New-Object System.Globalization.CultureInfo('en-GB')))
} catch {
  $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine
}
$engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
$engine.SetInputToDefaultAudioDevice()
$engine.InitialSilenceTimeout = [TimeSpan]::FromSeconds(8)
$engine.EndSilenceTimeoutAmbiguous = [TimeSpan]::FromSeconds(1.2)
$engine.EndSilenceTimeout = [TimeSpan]::FromSeconds(1.2)
$result = $engine.Recognize()
if ($result -and $result.Text) { Write-Output ("TEXT:" + $result.Text) } else { Write-Output "NONE" }
`;

export interface Listening {
  result: Promise<string | null>;
  cancel: () => void;
}

export function listenOnce(): Listening {
  const child = powershell(LISTEN_SCRIPT);
  let output = "";
  let cancelled = false;

  child.stdout!.on("data", (d) => (output += d.toString()));

  const result = new Promise<string | null>((resolve) => {
    child.on("close", () => {
      if (cancelled) return resolve(null);
      const line = output.split(/\r?\n/).find((l) => l.startsWith("TEXT:"));
      resolve(line ? line.slice(5).trim() : null);
    });
    child.on("error", () => resolve(null));
  });

  return {
    result,
    cancel: () => {
      cancelled = true;
      child.kill();
    },
  };
}