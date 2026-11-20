const DEFAULTS = { enabled: false, preset: "arri", legend: true };

async function updateBadge() {
  const { enabled } = await chrome.storage.local.get(DEFAULTS);
  await chrome.action.setBadgeText({ text: enabled ? "ON" : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#d22" });
}

chrome.runtime.onInstalled.addListener(updateBadge);
chrome.runtime.onStartup.addListener(updateBadge);
chrome.storage.onChanged.addListener((c, area) => {
  if (area === "local" && "enabled" in c) updateBadge();
});

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== "toggle-false-color") return;
  const { enabled } = await chrome.storage.local.get(DEFAULTS);
  await chrome.storage.local.set({ enabled: !enabled });
});
