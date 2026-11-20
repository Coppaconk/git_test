importScripts("presets.js");

chrome.runtime.onInstalled.addListener(() => chrome.storage.local.remove("enabled")); // v1 setting

// Per-tab badge, reported by the top frame's content script.
function setBadge(tabId, on) {
  chrome.action.setBadgeText({ tabId, text: on ? "ON" : "" }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#d22" }).catch(() => {});
}

function toB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

// Fetch an image with the extension's host permission (no CORS limits) and return its luma.
async function lumaFromUrl(url, max) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const bmp = await createImageBitmap(await res.blob());
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
  const ctx = new OffscreenCanvas(w, h).getContext("2d");
  ctx.drawImage(bmp, 0, 0, w, h);
  const luma = fcLumaFromRGBA(ctx.getImageData(0, 0, w, h).data);
  const out = { w, h, srcW: bmp.width, srcH: bmp.height, b64: toB64(luma) };
  bmp.close();
  return out;
}

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (msg.type === "status" && sender.tab) setBadge(sender.tab.id, msg.on);
  if (msg.type === "luma") {
    lumaFromUrl(msg.url, msg.max || 1024).then(send, (e) => send({ error: String(e) }));
    return true;
  }
});

chrome.commands.onCommand.addListener(async (cmd, tab) => {
  tab = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!tab) return;
  const type = cmd === "cycle-mode" ? "cycleMode" : "toggleSite";
  chrome.tabs.sendMessage(tab.id, { type }, { frameId: 0 }).catch(() => {});
});
