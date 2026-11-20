const $ = (id) => document.getElementById(id);

for (const [k, p] of Object.entries(FC_PRESETS)) $("copyFrom").add(new Option(p.name, k));

function addRow(b = { from: 0, to: 10, color: "#ff00ff", label: "" }) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="number" class="from" min="0" max="100" step="0.5"></td>
    <td><input type="number" class="to" min="0" max="100" step="0.5"></td>
    <td><input type="color" class="color"></td>
    <td><input type="text" class="label" placeholder="Label"></td>
    <td><button class="del" title="Remove">✕</button></td>`;
  tr.querySelector(".from").value = b.from;
  tr.querySelector(".to").value = b.to;
  tr.querySelector(".color").value = b.color;
  tr.querySelector(".label").value = b.label;
  tr.querySelector(".del").addEventListener("click", () => { tr.remove(); preview(); });
  tr.querySelectorAll("input").forEach((i) => i.addEventListener("input", preview));
  $("rows").appendChild(tr);
}

function readRows() {
  return [...$("rows").children].map((tr) => ({
    from: Number(tr.querySelector(".from").value),
    to: Number(tr.querySelector(".to").value),
    color: tr.querySelector(".color").value,
    label: tr.querySelector(".label").value.trim()
  }));
}

function setRows(bands) { $("rows").replaceChildren(); bands.forEach(addRow); preview(); }

function validate(bands) {
  const clean = fcCleanBands(bands);
  if (clean.length !== bands.length) return "Every band needs From < To, within 0–100.";
  for (let i = 1; i < clean.length; i++) {
    if (clean[i].from < clean[i - 1].to) return `Bands “${clean[i - 1].label || i}” and “${clean[i].label || i + 1}” overlap.`;
  }
  return null;
}

function preview() {
  const c = $("preview"), ctx = c.getContext("2d"), bands = fcCleanBands(readRows());
  for (let x = 0; x < c.width; x++) {
    const pct = (x / (c.width - 1)) * 100, band = fcBandFor(bands, pct), g = Math.round((pct / 100) * 255);
    ctx.fillStyle = band ? band.color : `rgb(${g},${g},${g})`;
    ctx.fillRect(x, 0, 1, c.height);
  }
  const err = validate(readRows());
  $("msg").className = "msg" + (err ? " err" : "");
  $("msg").textContent = err || "";
}

$("add").addEventListener("click", () => { addRow(); preview(); });
$("copy").addEventListener("click", () => setRows(FC_PRESETS[$("copyFrom").value].bands.map((b) => ({ ...b }))));
$("save").addEventListener("click", async () => {
  const rows = readRows(), err = validate(rows);
  if (err) { $("msg").className = "msg err"; $("msg").textContent = err; return; }
  await chrome.storage.local.set({ customBands: fcCleanBands(rows), preset: "custom", mode: "falsecolor" });
  $("msg").className = "msg ok";
  $("msg").textContent = "Saved. The custom scale is now active.";
});

// Hold key
let capturing = false;
$("setKey").addEventListener("click", () => {
  capturing = true;
  $("keyMsg").textContent = "Press a key…";
});
window.addEventListener("keydown", (e) => {
  if (!capturing) return;
  e.preventDefault();
  if (e.key === "Escape") { capturing = false; $("keyMsg").textContent = ""; return; }
  if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
  capturing = false;
  chrome.storage.local.set({ holdKey: e.key });
  $("keyMsg").textContent = "Saved.";
});

$("minSize").addEventListener("change", (e) => {
  chrome.storage.local.set({ minSize: Math.max(0, Number(e.target.value) || 0) });
});

function showKey(k) { $("holdKey").textContent = k === " " ? "Space" : k; }

chrome.storage.onChanged.addListener((c, area) => {
  if (area !== "local") return;
  if (c.holdKey) showKey(c.holdKey.newValue);
  if (c.minSize) $("minSize").value = c.minSize.newValue;
});

chrome.storage.local.get(FC_DEFAULTS, (S) => {
  setRows(S.customBands);
  showKey(S.holdKey);
  $("minSize").value = S.minSize;
});
