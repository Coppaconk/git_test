const $ = (id) => document.getElementById(id);

for (const [key, p] of Object.entries(FC_PRESETS)) {
  const o = document.createElement("option");
  o.value = key; o.textContent = p.name;
  $("preset").appendChild(o);
}

function renderLegend(presetKey) {
  const list = $("legendList");
  list.replaceChildren();
  const preset = FC_PRESETS[presetKey] || FC_PRESETS.arri;
  for (const b of [...preset.bands].reverse()) {
    const row = document.createElement("div"); row.className = "r";
    const sw = document.createElement("span"); sw.className = "s"; sw.style.background = b.color;
    const lab = document.createElement("span"); lab.textContent = b.label;
    const pct = document.createElement("span"); pct.className = "p"; pct.textContent = `${b.from}–${b.to}%`;
    row.append(sw, lab, pct);
    list.appendChild(row);
  }
}

chrome.storage.local.get(FC_DEFAULTS, (s) => {
  $("enabled").checked = s.enabled;
  $("preset").value = s.preset;
  $("legend").checked = s.legend;
  renderLegend(s.preset);
});

$("enabled").addEventListener("change", (e) => chrome.storage.local.set({ enabled: e.target.checked }));
$("legend").addEventListener("change", (e) => chrome.storage.local.set({ legend: e.target.checked }));
$("preset").addEventListener("change", (e) => {
  chrome.storage.local.set({ preset: e.target.value });
  renderLegend(e.target.value);
});
