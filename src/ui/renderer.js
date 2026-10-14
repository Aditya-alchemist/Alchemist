const $ = (id) => document.getElementById(id);
const api = window.alchemist;

let token = 0;
let cancelListen = null;

const CLOSE_RE =
  /^\W*(ok(ay)?,? )?(now )?(please )?(close|dismiss|hide|end)( the| this)? (chat|window|conversation)\W*$/i;
const QUIT_RE = /^\W*(quit|shut down|exit) alchemist\W*$/i;
const YES_RE = /^\W*(yes|yeah|yep|sure|go ahead|do it|proceed|confirm|ok|okay)\b/i;
const NO_RE = /^\W*(no|nope|cancel|stop|don'?t)\b/i;

function setStatus(text, mode) {
  $("status").textContent = text;
  $("orb").className = "orb " + mode;
}

function addMsg(who, text) {
  const div = document.createElement("div");
  div.className = "msg " + who;
  div.textContent = text;
  $("log").appendChild(div);
  $("log").scrollTop = $("log").scrollHeight;
}

async function say(text, my) {
  if (my !== token) return;
  setStatus("Speaking...", "speaking");
  await api.speak(text);
}

// Records until you stop talking. Resolves with audio bytes, or null if silent.
function listen() {
  return new Promise(async (resolve) => {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      addMsg("sys", "Microphone unavailable. Check Windows microphone permissions.");
      return resolve(null);
    }

    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);

    const rec = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    const samples = new Float32Array(analyser.fftSize);
    const started = performance.now();
    let timer;
    let voiceFrames = 0;
    let lastVoice = 0;
    let finished = false;

    const finish = (keep) => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      cancelListen = null;
      $("orb").style.setProperty("--lvl", 0);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        ctx.close();
        if (!keep || voiceFrames < 4) return resolve(null);
        resolve(await new Blob(chunks, { type: "audio/webm" }).arrayBuffer());
      };
      if (rec.state !== "inactive") rec.stop();
      else rec.onstop();
    };

    cancelListen = () => finish(false);
    rec.start();

    timer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const v of samples) sum += v * v;
      const rms = Math.sqrt(sum / samples.length);
      const now = performance.now();

      $("orb").style.setProperty("--lvl", Math.min(rms * 8, 1));

      if (rms > 0.015) {
        voiceFrames++;
        lastVoice = now;
      }

      if (voiceFrames >= 4 && now - lastVoice > 1400) finish(true);
      else if (voiceFrames < 4 && now - started > 8000) finish(false);
      else if (now - started > 30000) finish(true);
    }, 80);
  });
}

async function session() {
  const my = ++token;
  $("log").innerHTML = "";
  $("confirm").hidden = true;

  addMsg("bot", "Hey, how can I help?");
  await say("Hey, how can I help?", my);

  let idle = 0;

  while (my === token) {
    setStatus("Listening...", "idle");
    const audio = await listen();
    if (my !== token) return;

    if (!audio) {
      if (++idle >= 3) return api.close();
      continue;
    }
    idle = 0;

    setStatus("Thinking...", "thinking");
    let text;
    try {
      text = await api.transcribe(audio, "audio/webm");
    } catch (error) {
      addMsg("sys", "Voice error: " + (error.message || error));
      continue;
    }
    if (my !== token) return;
    if (!text) continue;

    addMsg("user", text);

    if (CLOSE_RE.test(text)) return api.close();
    if (QUIT_RE.test(text)) return api.quit();

    const reply = await api.ask(text);
    if (my !== token) return;

    addMsg(reply.ok ? "bot" : "sys", reply.text);
    if (reply.ok) await say(reply.text, my);
  }
}

api.onStart(() => {
  session();
});

api.onStop(() => {
  token++;
  if (cancelListen) cancelListen();
  api.stopSpeaking();
  $("confirm").hidden = true;
  setStatus("Ready", "idle");
});

api.onConfirm(async (question) => {
  const my = token;
  let settled = false;

  const settle = (ok) => {
    if (settled) return;
    settled = true;
    $("confirm").hidden = true;
    if (cancelListen) cancelListen();
    api.stopSpeaking();
    api.confirmReply(ok);
  };

  $("confirmText").textContent = question;
  $("confirm").hidden = false;
  $("yes").onclick = () => settle(true);
  $("no").onclick = () => settle(false);

  await say(question, my);

  for (let i = 0; i < 2 && !settled && my === token; i++) {
    setStatus("Say yes or no...", "idle");
    const audio = await listen();
    if (settled || my !== token) return;
    if (!audio) continue;

    try {
      const text = await api.transcribe(audio, "audio/webm");
      if (YES_RE.test(text || "")) return settle(true);
      if (NO_RE.test(text || "")) return settle(false);
    } catch {
      // fall through and try again
    }
  }

  if (my === token) settle(false);
});

$("closeBtn").onclick = () => api.close();
document.addEventListener("keydown", (e) => e.key === "Escape" && api.close());