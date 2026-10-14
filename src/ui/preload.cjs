const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("alchemist", {
  transcribe: (data, mime) => ipcRenderer.invoke("transcribe", data, mime),
  ask: (text) => ipcRenderer.invoke("ask", text),
  speak: (text) => ipcRenderer.invoke("speak", text),
  stopSpeaking: () => ipcRenderer.send("stop-speaking"),
  close: () => ipcRenderer.send("close"),
  quit: () => ipcRenderer.send("quit"),
  confirmReply: (ok) => ipcRenderer.send("confirm-reply", ok),
  onStart: (cb) => ipcRenderer.on("start", () => cb()),
  onStop: (cb) => ipcRenderer.on("stop", () => cb()),
  onConfirm: (cb) => ipcRenderer.on("confirm", (_event, q) => cb(q)),
});