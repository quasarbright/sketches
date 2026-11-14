// Family tree drawer: every snake is a horizontal line from the step it was born to the step it
// died (or now). A split starts a new line that branches off its parent's. Children nest right
// under their parent, newest closest, so branches never cross. Hovering a line shows that snake's
// genes at that moment and lights its whole line of descent back to its founder.
//
// It redraws every frame in step with the pit: time scrolls continuously with the pit's tween, and
// when a birth or death reshuffles the rows, lines slide to their new rows (a new branch slides out
// of its parent's line) instead of jumping.

import { GENES } from "./sim.js";

export function createTreeView({ canvas, tip, getWorld, onHover }) {
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 1;
  let windowSteps = 3000, windowShown = 3000, showDead = false;
  let mouse = null, hover = null, tipKey = "";
  let layout = null, layoutKey = "";
  const disp = new Map(); // id -> displayed row (eases toward the layout's row)
  let rhShown = 0, lastFrame = 0;

  const M = { left: 14, right: 18, top: 10, bottom: 24 };
  const col = (h, a, l = 58) => `hsla(${h.toFixed(0)},45%,${l}%,${a})`;

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }

  // Rows only change when the sim steps, so the layout is rebuilt once per step, not per frame.
  function build(world) {
    const now = world.step, t0 = Math.max(0, now - windowSteps - 1);
    const living = world.livingAncestry();
    const nodes = [];
    for (const n of world.tree.values()) {
      if ((n.died < 0 ? now : n.died) < t0) continue;
      if (!living.has(n.id) && !showDead) continue;
      nodes.push(n);
    }
    const ids = new Set(nodes.map((n) => n.id)), kids = new Map();
    for (const n of nodes) if (ids.has(n.parent)) (kids.get(n.parent) || kids.set(n.parent, []).get(n.parent)).push(n);
    const rowOf = new Map(), rowNode = [];
    const place = (n) => {
      rowOf.set(n.id, rowNode.length); rowNode.push(n);
      const ks = kids.get(n.id);
      if (ks) for (const c of ks.sort((a, b) => b.born - a.born)) place(c);
    };
    for (const n of nodes.filter((n) => !ids.has(n.parent)).sort((a, b) => a.born - b.born || a.id - b.id)) place(n);
    // a new line starts on its parent's row and slides out from there
    for (const n of rowNode) if (!disp.has(n.id)) disp.set(n.id, disp.has(n.parent) ? disp.get(n.parent) : rowOf.get(n.id));
    for (const id of disp.keys()) if (!rowOf.has(id)) disp.delete(id);
    layout = { living, rowOf, rowNode, rh: Math.min(10, (H - M.top - M.bottom) / Math.max(1, rowNode.length)) };
    if (!rhShown) rhShown = layout.rh;
  }

  // ancestry of the hovered snake: id -> the step its descendant line branched off it
  function ancestry(tree) {
    const m = new Map();
    if (!hover) return m;
    let id = hover.id, until = hover.at;
    while (id >= 0 && tree.has(id)) { m.set(id, until); const n = tree.get(id); until = n.born; id = n.parent; }
    return m;
  }

  function niceStep(x) {
    const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, x)))), f = x / p;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
  }

  // `t` is the pit's progress through the step on screen, so the tree's "now" matches the pit
  function frame(nowMs, t) {
    if (!W) resize();
    const world = getWorld();
    const key = `${world.step}|${showDead}|${windowSteps}|${H}`;
    if (key !== layoutKey) { layoutKey = key; build(world); }
    const dt = lastFrame ? Math.min(100, nowMs - lastFrame) : 16; lastFrame = nowMs;
    const ease = 1 - Math.exp(-dt / 110);
    for (const [id, r] of disp) disp.set(id, r + (layout.rowOf.get(id) - r) * ease);
    rhShown += (layout.rh - rhShown) * ease;
    windowShown += (windowSteps - windowShown) * ease;

    // the pit shows the step before the sim's latest, plus its tween
    const T = Math.max(0, world.step - 1 + t), t0 = Math.max(0, T - windowShown);
    const span = Math.max(1, T - t0), plotW = W - M.left - M.right;
    const X = (s) => M.left + ((s - t0) / span) * plotW;
    const Y = (id) => M.top + (disp.get(id) + 0.5) * rhShown;
    const rh = rhShown;

    // hover: the line nearest the pointer, among those alive at that x
    let newHover = null;
    if (mouse) {
      const at = t0 + ((mouse.x - M.left) / plotW) * span;
      let best = Math.max(4, rh * 0.75);
      for (const n of layout.rowNode) {
        if (n.born > T) continue;
        const end = n.died < 0 || n.died > T ? T : n.died;
        if (at < n.born - 4 * span / plotW || at > end + 8 * span / plotW) continue;
        const d = Math.abs(Y(n.id) - mouse.y);
        if (d < best) { best = d; newHover = { id: n.id, at: Math.max(n.born, Math.min(end, at)) }; }
      }
    }
    if ((newHover && newHover.id) !== (hover && hover.id)) onHover(newHover ? newHover.id : -1);
    hover = newHover;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const anc = ancestry(world.tree), dim = anc.size > 0, living = layout.living;
    const lw = Math.max(1, Math.min(2.2, rh * 0.45));
    ctx.lineCap = "round";
    const sStep = span / plotW; // steps per pixel

    const drawNode = (n, lit) => {
      if (n.born > T) return;
      const y = Y(n.id), alive = n.died < 0 || n.died > T, end = alive ? T : n.died;
      if (end < t0) return;
      const isLive = living.has(n.id);
      const base = dim ? (isLive ? 0.3 : 0.1) : (isLive ? 1 : 0.25);
      const until = anc.get(n.id);
      const hasParent = disp.has(n.parent) && n.born >= t0;
      if (hasParent) {
        const py = Y(n.parent), x0 = X(n.born), x1 = x0 + 7;
        ctx.strokeStyle = col(n.history[0].hue, lit ? 1 : base);
        ctx.lineWidth = lit ? lw + 1.5 : (isLive ? lw : 1);
        ctx.beginPath(); ctx.moveTo(x0, py); ctx.bezierCurveTo(x0 + 4, py, x1 - 4, y, x1, y); ctx.stroke();
      }
      const segs = n.history;
      for (let i = 0; i < segs.length; i++) {
        if (segs[i].step > T) break;
        let s0 = i === 0 ? n.born : segs[i].step;
        const s1 = i + 1 < segs.length && segs[i + 1].step <= T ? segs[i + 1].step : end;
        if (s1 < t0) continue;
        s0 = Math.max(s0, t0);
        if (i === 0 && hasParent) s0 = Math.min(s1, s0 + 7 * sStep);
        const parts = lit && until !== undefined
          ? [[s0, Math.min(s1, until), 1, lw + 1.5], [Math.max(s0, until), s1, 0.35, lw]]
          : [[s0, s1, base, isLive ? lw : 1]];
        for (const [a, b, alpha, width] of parts) {
          if (b <= a) continue;
          ctx.strokeStyle = col(segs[i].hue, alpha); ctx.lineWidth = width;
          ctx.beginPath(); ctx.moveTo(X(a), y); ctx.lineTo(X(b), y); ctx.stroke();
        }
        // a dot where it split (its genes, and so its color, changed there)
        if (i > 0 && segs[i].step >= t0 && (isLive || lit) && rh >= 3) {
          ctx.fillStyle = col(segs[i].hue, lit ? 1 : base, 72);
          ctx.beginPath(); ctx.arc(X(segs[i].step), y, lit ? 3 : Math.min(2.4, rh * 0.4), 0, Math.PI * 2); ctx.fill();
        }
      }
      let last = segs[0].hue;
      for (const h of segs) if (h.step <= T) last = h.hue;
      if (alive) {
        ctx.fillStyle = col(last, dim && !lit ? 0.4 : 1, 62);
        ctx.beginPath(); ctx.arc(X(T), y, Math.min(lit ? 4.5 : 3.2, rh * 0.5 + 1), 0, Math.PI * 2); ctx.fill();
      } else if (isLive || lit) {
        const k = Math.min(3, rh * 0.4);
        ctx.strokeStyle = col(last, lit ? 1 : base); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(X(n.died), y - k); ctx.lineTo(X(n.died), y + k); ctx.stroke();
      }
    };
    // dead ends first, then living lines, then the hovered ancestry on top
    for (const n of layout.rowNode) if (!living.has(n.id) && !anc.has(n.id)) drawNode(n, false);
    for (const n of layout.rowNode) if (living.has(n.id) && !anc.has(n.id)) drawNode(n, false);
    for (const n of layout.rowNode) if (anc.has(n.id)) drawNode(n, true);

    // time axis
    ctx.fillStyle = "#a39580"; ctx.font = "11px 'Spline Sans Mono', monospace";
    const tick = niceStep(span / 5);
    ctx.textAlign = "center";
    for (let s = Math.ceil(t0 / tick) * tick; s <= T; s += tick) {
      const x = X(s);
      if (x < M.left + 20 || x > W - M.right - 70) continue;
      ctx.fillText(s, x, H - 6);
    }
    ctx.textAlign = "right"; ctx.fillText(`step ${Math.floor(T)}`, W - M.right, H - 6);

    showTip(world);
  }

  function showTip(world) {
    if (!hover || !mouse) { tip.hidden = true; tipKey = ""; return; }
    const n = world.tree.get(hover.id);
    if (!n) { tip.hidden = true; return; }
    let seg = n.history[0];
    for (const h of n.history) if (h.step <= hover.at) seg = h;
    const at = Math.round(hover.at), key = `${n.id}|${seg.step}|${at}|${n.died}`;
    if (key !== tipKey) {
      tipKey = key;
      const alive = n.died < 0, s = alive ? world.snakes.find((x) => x.id === n.id) : null;
      const splits = n.history.length - 1;
      const status = alive ? `alive, ${s ? s.body.length : "?"} long` : `died at step ${n.died}`;
      tip.innerHTML =
        `<div class="tree-tip-head"><span class="pit-swatch" style="background:hsl(${seg.hue.toFixed(0)} 45% 55%)"></span>snake ${n.id}</div>` +
        `<div class="tree-tip-meta">born step ${n.born}, ${status}, split ${splits} time${splits === 1 ? "" : "s"}</div>` +
        `<div class="tree-tip-meta">genes at step ${at}:</div>` +
        `<div class="tree-tip-genes">` + GENES.map((g) => {
          const v = seg.genes[g.key], f = (v - g.min) / (g.max - g.min);
          return `<span>${g.key}</span><span class="bar"><i style="width:${(f * 100).toFixed(1)}%"></i></span><span class="val">${g.max > 1 ? v.toFixed(1) : v.toFixed(2)}</span>`;
        }).join("") + `</div>`;
    }
    tip.hidden = false;
    const tw = tip.offsetWidth, th = tip.offsetHeight, vw = document.documentElement.clientWidth;
    let x = mouse.cx + 14, y = mouse.cy - th - 12;
    if (x + tw > vw - 8) x = mouse.cx - tw - 14;
    if (x < 8) x = 8;
    if (y < 8) y = mouse.cy + 16;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }

  function onMove(e) {
    const r = canvas.getBoundingClientRect();
    mouse = { x: e.clientX - r.left, y: e.clientY - r.top, cx: e.clientX, cy: e.clientY };
  }
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerdown", onMove);
  canvas.addEventListener("pointerleave", () => { mouse = null; });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const now = getWorld().step;
    windowSteps = Math.max(200, Math.min(Math.max(200, now), windowSteps * Math.exp(e.deltaY * 0.0015)));
  }, { passive: false });

  return {
    frame,
    resize() { resize(); layoutKey = ""; },
    setShowDead(v) { showDead = v; },
    close() { mouse = null; hover = null; tip.hidden = true; onHover(-1); },
    reset() { mouse = null; hover = null; tip.hidden = true; onHover(-1); disp.clear(); rhShown = 0; windowSteps = windowShown = 3000; layoutKey = ""; },
  };
}
