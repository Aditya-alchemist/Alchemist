import { app, BrowserWindow, globalShortcut, ipcMain, screen } from "electron";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { AlchemistAssistant } from "./assistant.js";
import { speak, stopSpeaking } from "./voice/output.js";
import { transcribe } from "./voice/transcribe.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const HOTKEY = "Control+Alt+A";

let win: BrowserWindow | undefined;
let quitting = false;
let pendingConfirm: ((ok: boolean) => void) | undefined;

const confirm = (question: string): Promise<boolean> =>
  new Promise((resolve) => {
    if (!win || win.isDestroyed()) return resolve(false);
    pendingConfirm?.(false);
    pendingConfirm = resolve;
    win.webContents.send("confirm", question);
  });

const assistant = new AlchemistAssistant(confirm);

function createWindow(): void {
  const { workArea } = screen.getPrimaryDisplay();
  const width = 400;
  const height = 540;

  win = new BrowserWindow({
    width,
    height,
    x: workArea.x + workArea.width - width - 8,
    y: workArea.y + workArea.height - height - 8,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(here, "ui", "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
    },
  });

  win.setAlwaysOnTop(true, "screen-saver");

  const session = win.webContents.session;
  session.setPermissionRequestHandler((_wc, permission, callback) =>
    callback(permission === "media"),
  );
  session.setPermissionCheckHandler((_wc, permission) => permission === "media");

  win.loadFile(path.join(here, "ui", "index.html"));

  win.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      hideOverlay();
    }
  });
}

function showOverlay(): void {
  if (!win) return;
  win.show();
  win.focus();
  win.webContents.send("start");
}

function hideOverlay(): void {
  if (!win) return;
  stopSpeaking();
  pendingConfirm?.(false);
  pendingConfirm = undefined;
  win.webContents.send("stop");
  win.hide();
  assistant.resetConversation(); // each popup is a fresh chat
}

ipcMain.handle("transcribe", async (_event, data: ArrayBuffer, mime: string) =>
  transcribe(Buffer.from(data), mime),
);

ipcMain.handle("ask", async (_event, text: string) => {
  try {
    return { ok: true, text: await assistant.ask(text) };
  } catch (error) {
    return {
      ok: false,
      text: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle("speak", (_event, text: string) => speak(text));
ipcMain.on("stop-speaking", () => stopSpeaking());
ipcMain.on("close", () => hideOverlay());

ipcMain.on("quit", () => {
  quitting = true;
  app.quit();
});

ipcMain.on("confirm-reply", (_event, ok: boolean) => {
  const resolve = pendingConfirm;
  pendingConfirm = undefined;
  resolve?.(Boolean(ok));
});

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win && !win.isVisible()) showOverlay();
  });

  app.whenReady().then(() => {
    createWindow();

    const registered = globalShortcut.register(HOTKEY, () => {
      if (win?.isVisible()) hideOverlay();
      else showOverlay();
    });

    if (registered) {
      console.log("Alchemist is running. Press Ctrl+Alt+A to talk.");
    } else {
      console.error(
        "Could not register Ctrl+Alt+A. Another app may be using it.",
      );
    }
  });
}

app.on("window-all-closed", () => {
  // Keep running in the background; the hotkey brings the popup back.
});

app.on("before-quit", () => {
  quitting = true;
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});