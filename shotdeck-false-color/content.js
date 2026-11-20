(() => {
  if (window.__sdfcLoaded) return;
  window.__sdfcLoaded = true;

  const SVG_NS = "http://www.w3.org/2000/svg";
  const IS_TOP = window === window.top;
  const ROOT = document.documentElement;
  // Settings are per top-level site, so iframes follow the page they're in.
  const HOST = (() => {
    try {
      const a = location.ancestorOrigins;
      if (a && a.length) return new URL(a[a.length - 1]).hostname;
    } catch (e) { /* ignore */ }
    return location.hostname || location.protocol;
  })();
  const CAND_SEL = "img, video, canvas, .sdfc-bgc";
  const LUMA = "0.2126 0.7152 0.0722 0 0";
  const MAX_PIXELS = 1024;
  const ZEBRA_TILE = "data:image/svg+xml," + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='8' height='8'>" +
    "<rect width='8' height='8' fill='#fff'/>" +
    "<path d='M-2 2L2-2M0 8L8 0M6 10L10 6' stroke='#000' stroke-width='2.2'/></svg>");

  let S = structuredClone(FC_DEFAULTS);
  let on = false;
  const ui = {};
  let observer = null, pendingNodes = new Set(), scanTimer = 0, intervalId = 0, scannedOnce = false;
  let lastMouse = null, rafPending = false, hoverEl = null, splitEl = null, scopeEl = null, scopeStale = false;

  const alive = () => { try { return !!chrome.runtime.id; } catch (e) { return false; } };
  const isOurs = (e) => !!(e.closest && e.closest("[data-sdfc-ui]"));

  // ---------------------------------------------------------------- SVG filters
  // Everything is done with SVG filters applied through CSS, so it never needs to
  // read pixels and works on cross-origin CDN images.
  function svgEl(tag, attrs = {}, children = []) {
    const e = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    children.forEach((c) => e.appendChild(c));
    return e;
  }

  const lumaNode = (result) => svgEl("feColorMatrix", {
    in: "SourceGraphic", type: "matrix", values: `${LUMA} ${LUMA} ${LUMA} 0 0 0 1 0`, result
  });

  const transfer = (input, result, funcs) => svgEl("feComponentTransfer", { in: input, result },
    Object.entries(funcs).map(([ch, attrs]) => svgEl("feFunc" + ch, attrs)));

  function effectNodes() {
    if (S.mode === "luma") return [lumaNode("fx")];

    if (S.mode === "zebra") {
      return [
        svgEl("feColorMatrix", { in: "SourceGraphic", type: "matrix",
          values: `0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${LUMA}`, result: "la" }),
        transfer("la", "mask", { A: { type: "discrete", tableValues: fcStepTable(S.zebraLevel / 100) } }),
        svgEl("feImage", { href: ZEBRA_TILE, x: 0, y: 0, width: 8, height: 8, result: "tile" }),
        svgEl("feTile", { in: "tile", result: "stripes" }),
        svgEl("feComposite", { in: "stripes", in2: "mask", operator: "in", result: "z" }),
        svgEl("feMerge", { result: "fx" }, [
          svgEl("feMergeNode", { in: "SourceGraphic" }), svgEl("feMergeNode", { in: "z" })])
      ];
    }

    if (S.mode === "peaking") {
      const t = FC_PEAKING[S.peaking] || FC_PEAKING.medium;
      return [
        lumaNode("l"),
        svgEl("feConvolveMatrix", { in: "l", order: 3, kernelMatrix: "0 -1 0 -1 4 -1 0 -1 0",
          preserveAlpha: "true", edgeMode: "duplicate", result: "e1" }),
        svgEl("feConvolveMatrix", { in: "l", order: 3, kernelMatrix: "0 1 0 1 -4 1 0 1 0",
          preserveAlpha: "true", edgeMode: "duplicate", result: "e2" }),
        svgEl("feComposite", { in: "e1", in2: "e2", operator: "arithmetic", k1: 0, k2: 1, k3: 1, k4: 0, result: "e" }),
        svgEl("feColorMatrix", { in: "e", type: "matrix",
          values: "0 0 0 0 1 0 0 0 0 0.1 0 0 0 0 0.1 1 0 0 0 0", result: "ea" }),
        transfer("ea", "edges", { A: { type: "discrete", tableValues: fcStepTable(t) } }),
        transfer("l", "base", { R: { type: "linear", slope: 0.8 }, G: { type: "linear", slope: 0.8 }, B: { type: "linear", slope: 0.8 } }),
        svgEl("feMerge", { result: "fx" }, [
          svgEl("feMergeNode", { in: "base" }), svgEl("feMergeNode", { in: "edges" })])
      ];
    }

    const t = fcBuildTables(fcGetBands(S));
    return [
      lumaNode("l"),
      transfer("l", "fx", {
        R: { type: "discrete", tableValues: t.r },
        G: { type: "discrete", tableValues: t.g },
        B: { type: "discrete", tableValues: t.b }
      })
    ];
  }

  function buildFilter(id, split) {
    const f = svgEl("filter", { id, "color-interpolation-filters": "sRGB",
      filterUnits: "objectBoundingBox", x: 0, y: 0, width: 1, height: 1 });
    effectNodes().forEach((n) => f.appendChild(n));
    if (split) {
      // Left of the split: effect. Right: original. Plus a 1px divider line.
      const clip = svgEl("feFlood", { "flood-color": "#000", x: 0, y: 0, width: 0, height: 100000, result: "clip" });
      const line = svgEl("feFlood", { "flood-color": "#fff", x: -1, y: 0, width: 1, height: 100000, result: "line" });
      f.append(clip,
        svgEl("feComposite", { in: "fx", in2: "clip", operator: "in", result: "fxc" }),
        line,
        svgEl("feMerge", {}, [svgEl("feMergeNode", { in: "SourceGraphic" }),
          svgEl("feMergeNode", { in: "fxc" }), svgEl("feMergeNode", { in: "line" })]));
      ui.splitClip = clip; ui.splitLine = line;
    }
    return f;
  }

  function ensureSvg() {
    if (ui.svg && ui.svg.isConnected) return;
    ui.svg = svgEl("svg", { "aria-hidden": "true", width: 0, height: 0, "data-sdfc-ui": "" });
    ui.svg.style.cssText = "position:absolute!important;width:0!important;height:0!important;overflow:hidden!important;pointer-events:none!important";
    (document.body || ROOT).appendChild(ui.svg);
  }

  function renderFilters() {
    ensureSvg();
    ui.svg.replaceChildren(buildFilter("sdfc-main", false), buildFilter("sdfc-split", true));
  }

  function setSplit(px) {
    if (!ui.splitClip) return;
    ui.splitClip.setAttribute("width", Math.max(0, px));
    ui.splitLine.setAttribute("x", px - 0.5);
  }

  function clearSplit() {
    if (splitEl) splitEl.classList.remove("sdfc-split");
    splitEl = null;
  }

  // ---------------------------------------------------------------- targets
  function isBgCandidate(e) {
    if (e === document.body || e === ROOT || isOurs(e)) return false;
    const bg = getComputedStyle(e).backgroundImage;
    if (!bg || !bg.includes("url(")) return false;
    return !e.querySelector("img, video, canvas"); // avoid double filtering
  }

  function markBg(root) {
    if (!root || root.nodeType !== 1) return;
    if (isBgCandidate(root)) root.classList.add("sdfc-bgc");
    root.querySelectorAll("*").forEach((e) => { if (isBgCandidate(e)) e.classList.add("sdfc-bgc"); });
  }

  function updateTargets() {
    const min = Number(S.minSize) || 0;
    document.querySelectorAll(CAND_SEL).forEach((e) => {
      if (isOurs(e)) return;
      let want;
      if (S.scope === "picked") want = e.classList.contains("sdfc-picked");
      else {
        const r = e.getBoundingClientRect();
        want = r.width >= min && r.height >= min;
      }
      if (want !== e.classList.contains("sdfc-t")) e.classList.toggle("sdfc-t", want);
    });
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      const nodes = pendingNodes; pendingNodes = new Set();
      nodes.forEach((n) => n.isConnected && markBg(n));
      updateTargets();
      if (observer) observer.takeRecords(); // drop records caused by our own class changes
    }, 200);
  }

  function startWatch() {
    if (observer) return;
    observer = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "attributes") pendingNodes.add(m.target);
        m.addedNodes.forEach((n) => n.nodeType === 1 && pendingNodes.add(n));
      }
      scheduleScan();
    });
    observer.observe(ROOT, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class", "src"] });
    document.addEventListener("load", scheduleScan, true);
    window.addEventListener("resize", scheduleScan);
    intervalId = setInterval(updateTargets, 1500);
  }

  function stopWatch() {
    if (observer) observer.disconnect();
    observer = null;
    clearTimeout(scanTimer);
    clearInterval(intervalId);
    document.removeEventListener("load", scheduleScan, true);
    window.removeEventListener("resize", scheduleScan);
  }

  function mediaAt(x, y, lazyBg) {
    for (const e of document.elementsFromPoint(x, y)) {
      if (isOurs(e)) continue;
      if (e.matches(CAND_SEL)) return e;
      if (lazyBg && isBgCandidate(e)) { e.classList.add("sdfc-bgc"); return e; }
    }
    return null;
  }

  // ---------------------------------------------------------------- pixel data (readout + scopes)
  const lumaCache = new Map();    // url -> { status, data }
  const liveCache = new WeakMap(); // video/canvas -> { t, status, data }

  function urlFor(e) {
    if (e.tagName === "IMG") return e.currentSrc || e.src || null;
    const m = /url\(["']?(.*?)["']?\)/.exec(getComputedStyle(e).backgroundImage || "");
    return m ? m[1] : null;
  }

  function grabDirect(src, w, h) {
    if (!w || !h) return null;
    const s = Math.min(1, MAX_PIXELS / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
    const c = document.createElement("canvas");
    c.width = cw; c.height = ch;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    try {
      ctx.drawImage(src, 0, 0, cw, ch);
      return { w: cw, h: ch, srcW: w, srcH: h, luma: fcLumaFromRGBA(ctx.getImageData(0, 0, cw, ch).data) };
    } catch (err) {
      return null; // cross-origin (tainted)
    }
  }

  async function loadFromUrl(e, url) {
    if (e.tagName === "IMG" && e.complete && e.naturalWidth) {
      const d = grabDirect(e, e.naturalWidth, e.naturalHeight);
      if (d) return d;
    }
    if (!alive()) return null;
    const r = await chrome.runtime.sendMessage({ type: "luma", url, max: MAX_PIXELS }).catch(() => null);
    if (!r || r.error) return null;
    const bin = atob(r.b64), luma = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) luma[i] = bin.charCodeAt(i);
    return { w: r.w, h: r.h, srcW: r.srcW, srcH: r.srcH, luma };
  }

  function getLuma(e) {
    if (e.tagName === "VIDEO" || e.tagName === "CANVAS") {
      let ent = liveCache.get(e);
      if (!ent || performance.now() - ent.t > 500) {
        const w = e.tagName === "VIDEO" ? e.videoWidth : e.width;
        const h = e.tagName === "VIDEO" ? e.videoHeight : e.height;
        const data = grabDirect(e, w, h);
        ent = { t: performance.now(), status: data ? "ready" : "fail", data };
        liveCache.set(e, ent);
      }
      return ent;
    }
    const url = urlFor(e);
    if (!url) return { status: "fail" };
    let ent = lumaCache.get(url);
    if (!ent) {
      ent = { status: "loading" };
      lumaCache.set(url, ent);
      if (lumaCache.size > 40) lumaCache.delete(lumaCache.keys().next().value);
      loadFromUrl(e, url).then((data) => {
        ent.status = data ? "ready" : "fail";
        ent.data = data;
        scopeStale = true;
        scheduleHover();
      });
    }
    return ent;
  }

  // Map a viewport point to 0..1 image coordinates, honouring object-fit / background-size.
  function mapPoint(e, x, y, nw, nh) {
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    const px = (p) => parseFloat(cs[p]) || 0;
    const l = px("borderLeftWidth") + px("paddingLeft"), t = px("borderTopWidth") + px("paddingTop");
    const cw = r.width - l - px("borderRightWidth") - px("paddingRight");
    const ch = r.height - t - px("borderBottomWidth") - px("paddingBottom");
    let fit = "fill";
    if (e.tagName === "IMG") fit = cs.objectFit;
    else if (e.tagName === "VIDEO") fit = cs.objectFit === "fill" ? "contain" : cs.objectFit;
    else if (e.tagName !== "CANVAS") fit = /cover|contain/.exec(cs.backgroundSize)?.[0] || "fill";
    let dw = cw, dh = ch;
    if (fit !== "fill" && nw && nh) {
      let s = fit === "cover" ? Math.max(cw / nw, ch / nh) : Math.min(cw / nw, ch / nh);
      if (fit === "none") s = 1;
      if (fit === "scale-down") s = Math.min(1, s);
      dw = nw * s; dh = nh * s;
    }
    const u = (x - r.left - l - (cw - dw) / 2) / dw;
    const v = (y - r.top - t - (ch - dh) / 2) / dh;
    return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? { u, v } : null;
  }

  function naturalSize(e, data) {
    if (e.tagName === "IMG") return [e.naturalWidth || data.srcW, e.naturalHeight || data.srcH];
    if (e.tagName === "VIDEO") return [e.videoWidth, e.videoHeight];
    if (e.tagName === "CANVAS") return [e.width, e.height];
    return [data.srcW, data.srcH];
  }

  // ---------------------------------------------------------------- on-page UI
  function uiDiv(id) {
    let d = document.getElementById(id);
    if (!d) {
      d = document.createElement("div");
      d.id = id;
      d.setAttribute("data-sdfc-ui", "");
      ROOT.appendChild(d);
    }
    return d;
  }

  function addRow(parent, color, label, right, stripes) {
    const row = document.createElement("div"); row.className = "r";
    const sw = document.createElement("span"); sw.className = "s";
    sw.style.background = stripes ? "repeating-linear-gradient(45deg,#000 0 2px,#fff 2px 5px)" : color;
    const lab = document.createElement("span"); lab.textContent = label;
    row.append(sw, lab);
    if (right != null) { const p = document.createElement("span"); p.className = "p"; p.textContent = right; row.appendChild(p); }
    parent.appendChild(row);
  }

  function keyLabel(k) { return k === " " ? "Space" : k; }

  function renderLegend() {
    const show = on && S.legend && IS_TOP;
    if (!show) { document.getElementById("sdfc-legend")?.remove(); return; }
    const d = uiDiv("sdfc-legend");
    d.replaceChildren();
    const title = document.createElement("span"); title.className = "t";
    title.textContent = S.mode === "falsecolor" ? "False Color · " + fcPresetName(S) : FC_MODES[S.mode];
    d.appendChild(title);
    if (S.mode === "falsecolor") {
      for (const b of [...fcGetBands(S)].reverse()) addRow(d, b.color, b.label, `${b.from}–${b.to}%`);
    } else if (S.mode === "zebra") {
      addRow(d, null, `Above ${S.zebraLevel}%`, null, true);
    } else if (S.mode === "peaking") {
      addRow(d, "#ff1a1a", `In-focus edges (${S.peaking})`);
    }
    const hints = [`Hold ${keyLabel(S.holdKey)} for original`];
    if (S.scope === "picked") hints.push("Alt+click an image to pick it");
    if (S.split) hints.push("Split view follows the mouse");
    const h = document.createElement("span"); h.className = "h"; h.textContent = hints.join(" · ");
    d.appendChild(h);
  }

  function hideTip() { const t = document.getElementById("sdfc-tip"); if (t) t.style.display = "none"; }

  function showTip(x, y, color, text, sub) {
    const t = uiDiv("sdfc-tip");
    t.replaceChildren();
    const row = document.createElement("div"); row.className = "r";
    if (color) { const sw = document.createElement("span"); sw.className = "s"; sw.style.background = color; row.appendChild(sw); }
    const lab = document.createElement("span"); lab.textContent = text; row.appendChild(lab);
    if (sub) { const p = document.createElement("span"); p.className = "p"; p.textContent = sub; row.appendChild(p); }
    t.appendChild(row);
    t.style.display = "block";
    const w = t.offsetWidth, h = t.offsetHeight;
    t.style.left = Math.min(x + 16, innerWidth - w - 4) + "px";
    t.style.top = Math.min(y + 18, innerHeight - h - 4) + "px";
  }

  function readout(e, x, y) {
    const ent = getLuma(e);
    if (ent.status === "loading") return showTip(x, y, null, "Reading pixels…");
    if (ent.status !== "ready") return showTip(x, y, null, "No pixel access for this image");
    const d = ent.data;
    const [nw, nh] = naturalSize(e, d);
    const p = mapPoint(e, x, y, nw, nh);
    if (!p) return hideTip();
    const px = Math.min(d.w - 1, Math.floor(p.u * d.w)), py = Math.min(d.h - 1, Math.floor(p.v * d.h));
    const v = d.luma[py * d.w + px], pct = (v / 255) * 100;
    const band = S.mode === "falsecolor" ? fcBandFor(fcGetBands(S), pct) : null;
    const stops = fcStopsFromGrey(v);
    const stopTxt = Number.isFinite(stops) ? `≈ ${stops >= 0 ? "+" : ""}${stops.toFixed(1)} st vs 18% grey` : "";
    showTip(x, y, band ? band.color : `rgb(${v},${v},${v})`,
      `${pct.toFixed(1)}%${band && band.label ? " · " + band.label : ""}`, stopTxt);
  }

  function renderScopePanel() {
    if (!(on && S.scopes !== "off")) { document.getElementById("sdfc-scope")?.remove(); ui.scopeCanvas = null; return; }
    const d = uiDiv("sdfc-scope");
    if (!ui.scopeCanvas || !d.contains(ui.scopeCanvas)) {
      d.replaceChildren();
      ui.scopeTitle = document.createElement("span"); ui.scopeTitle.className = "t";
      ui.scopeCanvas = document.createElement("canvas");
      ui.scopeCanvas.width = 256; ui.scopeCanvas.height = 128;
      d.append(ui.scopeTitle, ui.scopeCanvas);
    }
    drawScope();
  }

  function drawScope() {
    const c = ui.scopeCanvas;
    if (!c) return;
    const ctx = c.getContext("2d"), W = 256, H = 128;
    const name = S.scopes === "waveform" ? "Waveform" : "Histogram";
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    const ent = scopeEl && scopeEl.isConnected ? getLuma(scopeEl) : null;
    let status = "";
    if (!ent) status = "hover an image";
    else if (ent.status === "loading") status = "loading…";
    else if (ent.status !== "ready") status = "no pixel access";
    ui.scopeTitle.textContent = status ? `${name} · ${status}` : name;
    if (status) return;
    const { w, h, luma } = ent.data;

    if (S.scopes === "waveform") {
      const acc = new Uint32Array(W * H);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const col = Math.floor((x * W) / w), row = H - 1 - Math.floor((luma[y * w + x] * (H - 1)) / 255);
          acc[row * W + col]++;
        }
      }
      let max = 1;
      for (let i = 0; i < acc.length; i++) if (acc[i] > max) max = acc[i];
      const img = ctx.createImageData(W, H), lm = Math.log1p(max);
      for (let i = 0; i < acc.length; i++) {
        const a = acc[i] ? Math.log1p(acc[i]) / lm : 0;
        img.data[i * 4] = 80 * a; img.data[i * 4 + 1] = 40 + 215 * a; img.data[i * 4 + 2] = 80 * a; img.data[i * 4 + 3] = acc[i] ? 255 : 0;
      }
      ctx.putImageData(img, 0, 0);
      ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.font = "9px system-ui";
      for (const lv of [0, 18, 50, 100]) {
        const y = Math.round(H - 1 - (lv / 100) * (H - 1)) + 0.5;
        ctx.fillRect(0, y, W, 0.5);
        ctx.fillText(lv === 18 ? "18" : String(lv), 2, Math.max(9, Math.min(H - 2, y - 2)));
      }
    } else {
      const bins = new Uint32Array(256);
      for (let i = 0; i < luma.length; i++) bins[luma[i]]++;
      let max = 1;
      for (let i = 1; i < 255; i++) if (bins[i] > max) max = bins[i];
      const bands = S.mode === "falsecolor" ? fcGetBands(S) : [];
      for (let i = 0; i < 256; i++) {
        const hgt = Math.min(H - 6, ((bins[i] / max) * (H - 6)));
        const band = fcBandFor(bands, (i / 255) * 100);
        ctx.fillStyle = band ? band.color : (i <= 2 || i >= 253) && bins[i] ? "#f44" : "#bbb";
        ctx.fillRect(i, H - 6 - hgt, 1, hgt);
      }
      // scale strip along the bottom
      for (let i = 0; i < 256; i++) {
        const band = fcBandFor(bands, (i / 255) * 100);
        ctx.fillStyle = band ? band.color : `rgb(${i},${i},${i})`;
        ctx.fillRect(i, H - 4, 1, 4);
      }
      ctx.fillStyle = "rgba(255,255,255,.25)";
      for (const lv of [25, 50, 75]) ctx.fillRect(Math.round((lv / 100) * 255), 0, 1, H - 6);
    }
  }

  // ---------------------------------------------------------------- hover
  function scheduleHover() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(onHover);
  }

  function onHover() {
    rafPending = false;
    if (!on || !lastMouse) return;
    const { x, y } = lastMouse;
    const t = mediaAt(x, y, false);
    hoverEl = t;

    if (S.split && t && t.classList.contains("sdfc-t")) {
      if (splitEl !== t) { clearSplit(); splitEl = t; t.classList.add("sdfc-split"); }
      const r = t.getBoundingClientRect();
      setSplit((x - r.left) * (r.width ? t.offsetWidth / r.width : 1));
    } else clearSplit();

    if (S.readout && t) readout(t, x, y); else hideTip();

    if (S.scopes !== "off" && t) {
      const live = t.tagName === "VIDEO" || t.tagName === "CANVAS";
      if (t !== scopeEl || scopeStale || live) { scopeEl = t; scopeStale = false; drawScope(); }
    } else if (scopeStale) { scopeStale = false; drawScope(); }
  }

  document.addEventListener("mousemove", (e) => {
    lastMouse = { x: e.clientX, y: e.clientY };
    if (on) scheduleHover();
  }, { capture: true, passive: true });

  document.addEventListener("mouseout", (e) => {
    if (!e.relatedTarget) { hoverEl = null; hideTip(); clearSplit(); }
  }, true);

  window.addEventListener("scroll", () => { if (on && lastMouse) scheduleHover(); }, { capture: true, passive: true });

  // ---------------------------------------------------------------- pick (Alt+click)
  document.addEventListener("click", (e) => {
    if (!on || S.scope !== "picked" || !e.altKey) return;
    const t = mediaAt(e.clientX, e.clientY, true);
    if (!t) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    t.classList.toggle("sdfc-picked");
    updateTargets();
  }, true);

  // ---------------------------------------------------------------- hold to compare
  const editable = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  const holdMatch = (e) => S.holdKey && e.key && e.key.toLowerCase() === String(S.holdKey).toLowerCase();

  window.addEventListener("keydown", (e) => {
    if (!on || e.ctrlKey || e.metaKey || e.altKey || !holdMatch(e) || editable(e.target)) return;
    ROOT.classList.add("sdfc-hold");
    if (S.holdKey === " ") e.preventDefault();
  }, true);
  window.addEventListener("keyup", (e) => { if (holdMatch(e)) ROOT.classList.remove("sdfc-hold"); }, true);
  window.addEventListener("blur", () => ROOT.classList.remove("sdfc-hold"));

  // ---------------------------------------------------------------- state
  function apply() {
    on = fcSiteOn(S, HOST);
    if (on) {
      renderFilters();
      if (!scannedOnce && document.body) { markBg(document.body); scannedOnce = true; }
      updateTargets();
      startWatch();
      ROOT.classList.add("sdfc-on");
      if (lastMouse) scheduleHover();
    } else {
      ROOT.classList.remove("sdfc-on", "sdfc-hold");
      stopWatch();
      hideTip();
      clearSplit();
    }
    renderLegend();
    renderScopePanel();
    if (IS_TOP && alive()) chrome.runtime.sendMessage({ type: "status", on }).catch(() => {});
  }

  chrome.storage.local.get(FC_DEFAULTS, (s) => { S = { ...FC_DEFAULTS, ...s }; apply(); });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [k, v] of Object.entries(changes)) S[k] = v.newValue === undefined ? FC_DEFAULTS[k] : v.newValue;
    apply();
  });

  chrome.runtime.onMessage.addListener((msg, sender, send) => {
    if (msg.type === "toggleSite" && IS_TOP) {
      chrome.storage.local.set({ sites: fcSetSite(S.sites, HOST, !on, S.allSites) });
    } else if (msg.type === "cycleMode" && IS_TOP) {
      const modes = Object.keys(FC_MODES);
      const next = modes[(modes.indexOf(S.mode) + 1) % modes.length];
      const patch = { mode: next };
      if (!on) patch.sites = fcSetSite(S.sites, HOST, true, S.allSites);
      chrome.storage.local.set(patch);
    } else if (msg.type === "clearPicked") {
      document.querySelectorAll(".sdfc-picked").forEach((e) => e.classList.remove("sdfc-picked"));
      updateTargets();
    } else if (msg.type === "getState" && IS_TOP) {
      send({ host: HOST, on });
    }
  });
})();
