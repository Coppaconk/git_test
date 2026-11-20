// False color presets. Ranges are in percent of signal level (0–100, like IRE),
// measured on Rec.709 luma of the sRGB-encoded pixel values.
// Anything not covered by a band is shown as greyscale luma.
// eslint-disable-next-line no-unused-vars
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

const FC_DEFAULTS = { enabled: false, preset: "arri", legend: true };

function fcHexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
}

// Build discrete transfer tables (one per channel) for an feComponentTransfer.
// The input to each channel is the pixel's luma, so a lookup on luma
// gives us the band colour, or the grey value itself outside any band.
function fcBuildTables(presetKey, steps = 400) {
  const preset = FC_PRESETS[presetKey] || FC_PRESETS.arri;
  const bands = preset.bands.map((b) => ({ ...b, rgb: fcHexToRgb(b.color) }));
  const r = [], g = [], b = [];
  for (let k = 0; k < steps; k++) {
    const pct = ((k + 0.5) / steps) * 100;
    const band = bands.find((x) => pct >= x.from && pct < x.to) ||
      (pct >= 100 - 1e-9 ? bands.find((x) => x.to === 100) : null);
    if (band) {
      r.push(band.rgb[0]); g.push(band.rgb[1]); b.push(band.rgb[2]);
    } else {
      const grey = (k + 0.5) / steps;
      r.push(grey); g.push(grey); b.push(grey);
    }
  }
  const fmt = (a) => a.map((v) => v.toFixed(4)).join(" ");
  return { r: fmt(r), g: fmt(g), b: fmt(b) };
}
