import { spawn, type ChildProcess } from "node:child_process";

const SCRIPT = `
Add-Type -AssemblyName System.Speech
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$v = $s.GetInstalledVoices() |
  Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq 'en-GB' } |
  Select-Object -First 1
if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }
$text = [Console]::In.ReadToEnd()
$s.Speak($text)
`;

const encoded = Buffer.from(SCRIPT, "utf16le").toString("base64");

let current: ChildProcess | undefined;

export function speak(text: string): Promise<void> {
  stopSpeaking();

  return new Promise((resolve) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
      { stdio: ["pipe", "ignore", "ignore"], windowsHide: true },
    );

    current = child;
    child.on("close", () => resolve());
    child.on("error", () => resolve());
    child.stdin.end(text);
  });
}

export function stopSpeaking(): void {
  current?.kill();
  current = undefined;
}