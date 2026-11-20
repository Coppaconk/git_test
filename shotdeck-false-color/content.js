(() => {
  if (window.__sdfcLoaded) return;
  window.__sdfcLoaded = true;

  const SVG_NS = "http://www.w3.org/2000/svg";
  const FILTER_ID = "sdfc-filter";
  const ON_CLASS = "sdfc-on";
  const BG_CLASS = "sdfc-bg";
  let state = { ...FC_DEFAULTS };
  let svg, funcs, legendEl, observer, scanTimer;

  // --- SVG filter -----------------------------------------------------------
  // Uses a CSS/SVG filter instead of reading pixels, so it works on
  // cross-origin CDN images without canvas "tainting" problems.
  function ensureFilter() {
    if (svg && svg.isConnected) return;
    svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";

    const filter = document.createElementNS(SVG_NS, "filter");
    filter.id = FILTER_ID;
    filter.setAttribute("color-interpolation-filters", "sRGB");
    filter.setAttribute("x", "0"); filter.setAttribute("y", "0");
    filter.setAttribute("width", "1"); filter.setAttribute("height", "1");
    filter.setAttribute("filterUnits", "objectBoundingBox");

    // 1) Convert to Rec.709 luma in every channel.
    const matrix = document.createElementNS(SVG_NS, "feColorMatrix");
    matrix.setAttribute("type", "matrix");
    const L = "0.2126 0.7152 0.0722 0 0";
    matrix.setAttribute("values", `${L} ${L} ${L} 0 0 0 1 0`);

    // 2) Map luma -> colour with discrete lookup tables.
    const transfer = document.createElementNS(SVG_NS, "feComponentTransfer");
    funcs = {};
    for (const ch of ["R", "G", "B"]) {
      const f = document.createElementNS(SVG_NS, "feFunc" + ch);
      f.setAttribute("type", "discrete");
      transfer.appendChild(f);
      funcs[ch] = f;
    }

    filter.append(matrix, transfer);
    svg.appendChild(filter);
    (document.body || document.documentElement).appendChild(svg);

    const style = document.createElement("style");
    style.id = "sdfc-style";
    style.textContent = `
      html.${ON_CLASS} img,
      html.${ON_CLASS} picture,
      html.${ON_CLASS} video,
      html.${ON_CLASS} canvas,
      html.${ON_CLASS} .${BG_CLASS} { filter: url(#${FILTER_ID}) !important; }
      html.${ON_CLASS} picture img { filter: none !important; }
      #sdfc-legend {
        position: fixed; right: 12px; bottom: 12px; z-index: 2147483647;
        background: rgba(10,10,10,.85); color: #eee; font: 11px/1.3 system-ui, sans-serif;
        padding: 8px 10px; border-radius: 8px; pointer-events: none;
        box-shadow: 0 2px 10px rgba(0,0,0,.5); max-width: 220px;
      }
      #sdfc-legend .t { font-weight: 600; margin-bottom: 4px; }
      #sdfc-legend .r { display: flex; align-items: center; gap: 6px; margin: 2px 0; }
      #sdfc-legend .s { width: 12px; height: 12px; border-radius: 2px; flex: none; }
      #sdfc-legend .p { opacity: .7; margin-left: auto; padding-left: 8px; white-space: nowrap; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function updateTables() {
    const t = fcBuildTables(state.preset);
    funcs.R.setAttribute("tableValues", t.r);
    funcs.G.setAttribute("tableValues", t.g);
    funcs.B.setAttribute("tableValues", t.b);
  }

  // --- Background-image elements ------------------------------------------
  function isBgImageEl(el) {
    if (el === document.body || el === document.documentElement) return false;
    if (el.id === "sdfc-legend") return false;
    const bg = getComputedStyle(el).backgroundImage;
    if (!bg || !bg.includes("url(")) return false;
    // Avoid double-filtering: skip containers that hold media elements.
    return !el.querySelector("img, video, canvas, picture");
  }

  function scan(root) {
    if (!root || root.nodeType !== 1) return;
    if (isBgImageEl(root)) root.classList.add(BG_CLASS);
    root.querySelectorAll("*").forEach((el) => {
      if (isBgImageEl(el)) el.classList.add(BG_CLASS);
    });
  }

  function startObserver() {
    if (observer) return;
    let pending = new Set();
    observer = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "attributes") pending.add(m.target);
        m.addedNodes.forEach((n) => n.nodeType === 1 && pending.add(n));
      }
      clearTimeout(scanTimer);
      scanTimer = setTimeout(() => {
        const nodes = pending; pending = new Set();
        nodes.forEach((n) => n.isConnected && scan(n));
      }, 250);
    });
    observer.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"]
    });
  }

  function stopObserver() {
    if (observer) observer.disconnect();
    observer = null;
    clearTimeout(scanTimer);
  }

  // --- Legend --------------------------------------------------------------
  function renderLegend() {
    const show = state.enabled && state.legend && window === window.top;
    if (!show) { legendEl && legendEl.remove(); legendEl = null; return; }
    if (!legendEl) {
      legendEl = document.createElement("div");
      legendEl.id = "sdfc-legend";
    }
    const preset = FC_PRESETS[state.preset] || FC_PRESETS.arri;
    legendEl.replaceChildren();
    const title = document.createElement("div");
    title.className = "t";
    title.textContent = "False Color · " + preset.name;
    legendEl.appendChild(title);
    for (const b of [...preset.bands].reverse()) {
      const row = document.createElement("div"); row.className = "r";
      const sw = document.createElement("span"); sw.className = "s"; sw.style.background = b.color;
      const lab = document.createElement("span"); lab.textContent = b.label;
      const pct = document.createElement("span"); pct.className = "p"; pct.textContent = `${b.from}–${b.to}%`;
      row.append(sw, lab, pct);
      legendEl.appendChild(row);
    }
    if (!legendEl.isConnected) document.documentElement.appendChild(legendEl);
  }

  // --- Apply state ---------------------------------------------------------
  function apply() {
    if (state.enabled) {
      ensureFilter();
      updateTables();
      if (document.body) scan(document.body);
      startObserver();
      document.documentElement.classList.add(ON_CLASS);
    } else {
      document.documentElement.classList.remove(ON_CLASS);
      stopObserver();
    }
    renderLegend();
  }

  chrome.storage.local.get(FC_DEFAULTS, (s) => { state = { ...FC_DEFAULTS, ...s }; apply(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [k, v] of Object.entries(changes)) state[k] = v.newValue;
    apply();
  });
})();
