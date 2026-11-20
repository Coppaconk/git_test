// Shared settings, presets and helpers (used by content script, popup, options and background).
// Levels are percent of signal (0–100, like IRE) on Rec.709 luma of the encoded sRGB values.

const FC_PRESETS = {
  arri: {
    name: "ARRI-style (classic)",
    bands: [
      { from: 0,   to: 2.5, color: "#8a2be2", label: "Black clip" },
      { from: 2.5, to: 4,   color: "#1e5cff", label: "Just above black" },
      { from: 38,  to: 42,  color: "#00c040", label: "18% grey" },
      { from: 52,  to: 56,  color: "#ff6ec7", label: "+1 stop (skin)" },
      { from: 97,  to: 99,  color: "#ffe600", label: "Near clip" },
      { from: 99,  to: 100, color: "#ff0000", label: "White clip" }
    ]
  },
  spectrum: {
    name: "Full spectrum",
    bands: [
      { from: 0,  to: 2,   color: "#6a0dad", label: "Crushed" },
      { from: 2,  to: 10,  color: "#0a1fb4", label: "Deep shadow" },
      { from: 10, to: 20,  color: "#1e78ff", label: "Shadow" },
      { from: 20, to: 35,  color: "#00b4b4", label: "Low mid" },
      { from: 35, to: 45,  color: "#00c040", label: "Mid grey" },
      { from: 45, to: 55,  color: "#8c8c8c", label: "Mid" },
      { from: 55, to: 65,  color: "#ff6ec7", label: "Skin / +1 stop" },
      { from: 65, to: 80,  color: "#d2d2d2", label: "High mid" },
      { from: 80, to: 90,  color: "#ffe600", label: "Highlight" },
      { from: 90, to: 97,  color: "#ff8c00", label: "Bright" },
      { from: 97, to: 100, color: "#ff0000", label: "Clip" }
    ]
  },
  clipping: {
    name: "Clipping only",
    bands: [
      { from: 0,  to: 2,   color: "#1e5cff", label: "Black clip" },
      { from: 98, to: 100, color: "#ff0000", label: "White clip" }
    ]
  }
};

const FC_MODES = {
  falsecolor: "False color",
  zebra: "Zebras",
  luma: "Luma (greyscale)",
  peaking: "Focus peaking"
};

// Edge-strength threshold for focus peaking (lower = more edges shown).
const FC_PEAKING = { low: 0.3, medium: 0.18, high: 0.1 };

const FC_DEFAULTS = {
  allSites: false,        // default for sites without their own setting
  sites: {},              // per-site overrides: { "shotdeck.com": true }
  mode: "falsecolor",
  preset: "arri",
  customBands: FC_PRESETS.arri.bands.map((b) => ({ ...b })),
  legend: true,
  scope: "all",           // "all" images, or only "picked" (Alt+click)
  minSize: 64,            // ignore images smaller than this (px), "all" scope only
  holdKey: "`",           // hold to see the original
  split: false,           // split view that follows the mouse
  readout: false,         // hover readout of luma %
  scopes: "off",          // "off" | "histogram" | "waveform"
  zebraLevel: 95,
  peaking: "medium"
};

function fcHexToRgb(hex) {
  const n = parseInt(String(hex).replace("#", ""), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
}

function fcCleanBands(bands) {
  return (Array.isArray(bands) ? bands : [])
    .map((b) => ({
      from: Math.max(0, Math.min(100, Number(b.from))),
      to: Math.max(0, Math.min(100, Number(b.to))),
      color: /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : "#ff00ff",
      label: String(b.label || "")
    }))
    .filter((b) => Number.isFinite(b.from) && Number.isFinite(b.to) && b.to > b.from)
    .sort((a, b) => a.from - b.from);
}

function fcGetBands(S) {
  if (S.preset === "custom") return fcCleanBands(S.customBands);
  return (FC_PRESETS[S.preset] || FC_PRESETS.arri).bands;
}

function fcPresetName(S) {
  return S.preset === "custom" ? "Custom" : (FC_PRESETS[S.preset] || FC_PRESETS.arri).name;
}

function fcBandFor(bands, pct) {
  return bands.find((b) => pct >= b.from && (pct < b.to || (b.to >= 100 && pct <= 100))) || null;
}

// Discrete lookup tables (one per channel) mapping luma -> band colour, or grey outside bands.
function fcBuildTables(bands, steps = 400) {
  const withRgb = bands.map((b) => ({ ...b, rgb: fcHexToRgb(b.color) }));
  const r = [], g = [], b = [];
  for (let k = 0; k < steps; k++) {
    const pct = ((k + 0.5) / steps) * 100;
    const band = fcBandFor(withRgb, pct);
    const grey = (k + 0.5) / steps;
    const c = band ? band.rgb : [grey, grey, grey];
    r.push(c[0]); g.push(c[1]); b.push(c[2]);
  }
  const fmt = (a) => a.map((v) => v.toFixed(4)).join(" ");
  return { r: fmt(r), g: fmt(g), b: fmt(b) };
}

// 0 below the threshold, 1 at/above (threshold 0..1).
function fcStepTable(threshold, steps = 400) {
  const out = [];
  for (let k = 0; k < steps; k++) out.push((k + 0.5) / steps >= threshold ? 1 : 0);
  return out.join(" ");
}

// Returns a new per-site map with host set to value; drops overrides that match the default.
function fcSetSite(sites, host, value, allSites) {
  const next = { ...(sites || {}) };
  if (value === !!allSites) delete next[host]; else next[host] = value;
  return next;
}

function fcSiteOn(S, host) {
  return S.sites && host in S.sites ? !!S.sites[host] : !!S.allSites;
}

// Rec.709 luma (0–255) from RGBA bytes.
function fcLumaFromRGBA(rgba) {
  const n = rgba.length >> 2, out = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    out[i] = Math.round(0.2126 * rgba[j] + 0.7152 * rgba[j + 1] + 0.0722 * rgba[j + 2]);
  }
  return out;
}

// Approximate stops relative to 18% grey, treating the value as sRGB-encoded.
function fcStopsFromGrey(v255) {
  const c = v255 / 255;
  const lin = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  if (lin <= 0) return -Infinity;
  return Math.log2(lin / 0.18);
}
