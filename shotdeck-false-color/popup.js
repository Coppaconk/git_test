const $ = (id) => document.getElementById(id);
let S = structuredClone(FC_DEFAULTS);
let host = null, tabId = null;

for (const [k, name] of Object.entries(FC_MODES)) $("mode").add(new Option(name, k));
for (const [k, p] of Object.entries(FC_PRESETS)) $("preset").add(new Option(p.name, k));
$("preset").add(new Option("Custom", "custom"));

function renderLegend() {
  const list = $("legendList");
  list.replaceChildren();
  for (const b of [...fcGetBands(S)].reverse()) {
    const row = document.createElement("div"); row.className = "r";
    const sw = document.createElement("span"); sw.className = "s"; sw.style.background = b.color;
    const lab = document.createElement("span"); lab.textContent = b.label;
    const pct = document.createElement("span"); pct.className = "p"; pct.textContent = `${b.from}–${b.to}%`;
    row.append(sw, lab, pct);
    list.appendChild(row);
  }
}

function render() {
  $("siteOn").checked = host ? fcSiteOn(S, host) : false;
  $("allSites").checked = !!S.allSites;
  for (const id of ["mode", "preset", "zebraLevel", "peaking", "scope", "scopes"]) $(id).value = S[id];
  for (const id of ["split", "readout", "legend"]) $(id).checked = !!S[id];
  document.querySelectorAll("[data-mode]").forEach((e) => { e.hidden = e.dataset.mode !== S.mode; });
  $("pickedRow").hidden = S.scope !== "picked";
  $("holdHint").textContent = `Hold ${S.holdKey === " " ? "Space" : S.holdKey} on the page to see the original.`;
  renderLegend();
}

const save = (patch) => chrome.storage.local.set(patch);

$("siteOn").addEventListener("change", (e) => save({ sites: fcSetSite(S.sites, host, e.target.checked, S.allSites) }));
$("allSites").addEventListener("change", (e) => save({ allSites: e.target.checked }));
for (const id of ["mode", "preset", "peaking", "scope", "scopes"]) {
  $(id).addEventListener("change", (e) => save({ [id]: e.target.value }));
}
$("zebraLevel").addEventListener("change", (e) => {
  const v = Math.max(1, Math.min(100, Number(e.target.value) || 95));
  save({ zebraLevel: v });
});
for (const id of ["split", "readout", "legend"]) {
  $(id).addEventListener("change", (e) => save({ [id]: e.target.checked }));
}
$("clearPicked").addEventListener("click", () => {
  if (tabId != null) chrome.tabs.sendMessage(tabId, { type: "clearPicked" }).catch(() => {});
});
$("openOptions").addEventListener("click", () => chrome.runtime.openOptionsPage());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  for (const [k, v] of Object.entries(changes)) S[k] = v.newValue === undefined ? FC_DEFAULTS[k] : v.newValue;
  render();
});

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id ?? null;
  // Prefer the content script's answer (it knows the exact host it uses).
  const st = tabId != null ? await chrome.tabs.sendMessage(tabId, { type: "getState" }, { frameId: 0 }).catch(() => null) : null;
  if (st) host = st.host;
  else {
    try {
      const u = new URL(tab.url);
      if (/^(https?|file):$/.test(u.protocol)) host = u.hostname || u.protocol;
    } catch (e) { /* no url */ }
  }
  $("host").textContent = host || "";
  if (!st) {
    $("na").hidden = false;
    if (host) $("na").textContent = "Reload this page to use the extension here.";
    if (!host) $("siteOn").disabled = true;
  }
  S = { ...FC_DEFAULTS, ...(await chrome.storage.local.get(FC_DEFAULTS)) };
  render();
})();
