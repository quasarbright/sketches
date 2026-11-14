// Family tree drawer: every snake is a horizontal line from the step it was born to the step it
// died (or now). A split starts a new line that branches off its parent's. Children nest right
// under their parent, newest closest, so branches never cross. Hovering a line shows that snake's
// genes at that moment and lights its whole line of descent back to its founder.

import { GENES } from "./sim.js";

export function createTreeView({ canvas, tip, getWorld, onHover }) {
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 1;
  let windowSteps = 3000, showDead = false, hover = null, mouse = null;
  let layout = null;

  const M = { left: 14, right: 18, top: 10, bottom: 24 };

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }

  function build() {
    const world = getWorld(), now = world.step, t0 = Math.max(0, now - windowSteps);
    const living = world.livingAncestry();
    const nodes = [];
    for (const n of world.tree.values()) {
      const end = n.died < 0 ? now : n.died;
      if (end < t0) continue;
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
    const rows = Math.max(1, rowNode.length);
    const rh = Math.min(10, (H - M.top - M.bottom) / rows);
    layout = { now, t0, living, rowOf, rowNode, rh, alive: new Set(world.snakes.map((s) => s.id)) };
  }

  const X = (t) => M.left + ((t - layout.t0) / Math.max(1, layout.now - layout.t0)) * (W - M.left - M.right);
  const Y = (r) => M.top + (r + 0.5) * layout.rh;
  const col = (h, a, l = 58) => `hsla(${h.toFixed(0)},45%,${l}%,${a})`;

  // ancestry of the hovered snake: id -> the step its descendant line branched off it
  function ancestry() {
    const m = new Map();
    if (!hover) return m;
    const tree = getWorld().tree;
    let id = hover.id, until = hover.at;
    while (id >= 0 && tree.has(id)) { m.set(id, until); const n = tree.get(id); until = n.born; id = n.parent; }
    return m;
  }

  function draw() {
    if (!W) resize();
    build();
    const { now, t0, living, rowOf, rowNode, rh } = layout;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const anc = ancestry(), dim = anc.size > 0;
    const lw = Math.max(1, Math.min(2.2, rh * 0.45));
    ctx.lineCap = "round";

    const drawNode = (n, lit) => {
      const r = rowOf.get(n.id), y = Y(r), end = n.died < 0 ? now : n.died;
      const isLive = living.has(n.id);
      const base = dim ? (isLive ? 0.3 : 0.1) : (isLive ? 1 : 0.25);
      const until = anc.get(n.id);
      // branch-off curve from the parent's line
      if (rowOf.has(n.parent) && n.born >= t0) {
        const py = Y(rowOf.get(n.parent)), x0 = X(n.born), x1 = x0 + 7;
        ctx.strokeStyle = col(n.history[0].hue, lit ? 1 : base);
        ctx.lineWidth = lit ? lw + 1.5 : (isLive ? lw : 1);
        ctx.beginPath(); ctx.moveTo(x0, py); ctx.bezierCurveTo(x0 + 4, py, x1 - 4, y, x1, y); ctx.stroke();
      }
      const segs = n.history;
      for (let i = 0; i < segs.length; i++) {
        let s0 = i === 0 ? n.born : segs[i].step, s1 = i + 1 < segs.length ? segs[i + 1].step : end;
        if (s1 < t0) continue;
        s0 = Math.max(s0, t0);
        if (i === 0 && rowOf.has(n.parent) && n.born >= t0) s0 = Math.min(s1, s0 + 7 * (now - t0) / (W - M.left - M.right));
        const parts = lit && until !== undefined ? [[s0, Math.min(s1, until), 1, lw + 1.5], [Math.max(s0, until), s1, 0.35, lw]] : [[s0, s1, base, isLive ? lw : 1]];
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
      const last = segs[segs.length - 1].hue;
      if (n.died < 0) {
        ctx.fillStyle = col(last, dim && !lit ? 0.4 : 1, 62);
        ctx.beginPath(); ctx.arc(X(now), y, Math.min(lit ? 4.5 : 3.2, rh * 0.5 + 1), 0, Math.PI * 2); ctx.fill();
      } else if (isLive || lit) {
        ctx.strokeStyle = col(last, lit ? 1 : base); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(X(n.died), y - Math.min(3, rh * 0.4)); ctx.lineTo(X(n.died), y + Math.min(3, rh * 0.4)); ctx.stroke();
      }
    };
    // dead first, then living lines, then the hovered ancestry on top
    for (const n of rowNode) if (!living.has(n.id) && !anc.has(n.id)) drawNode(n, false);
    for (const n of rowNode) if (living.has(n.id) && !anc.has(n.id)) drawNode(n, false);
    for (const n of rowNode) if (anc.has(n.id)) drawNode(n, true);

    // time axis
    ctx.fillStyle = "#a39580"; ctx.font = "11px 'Spline Sans Mono', monospace"; ctx.textBaseline = "alphabetic";
    const span = now - t0, stepSize = niceStep(span / 5);
    for (let t = Math.ceil(t0 / stepSize) * stepSize; t <= now; t += stepSize) {
      const x = X(t);
      if (x > W - M.right - 60) continue;
      ctx.textAlign = "center"; ctx.fillText(t, x, H - 6);
    }
    ctx.textAlign = "right"; ctx.fillText(`step ${now}`, W - M.right, H - 6);
  }

  function niceStep(x) {
    const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, x)))), f = x / p;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
  }

  function pick(mx, my) {
    if (!layout || !layout.rowNode.length) return null;
    const r = Math.floor((my - M.top) / layout.rh);
    const n = layout.rowNode[r];
    if (!n) return null;
    const end = n.died < 0 ? layout.now : n.died;
    const tol = 10;
    if (mx < X(Math.max(n.born, layout.t0)) - tol || mx > X(end) + tol) return null;
    const at = Math.max(n.born, Math.min(end, layout.t0 + ((mx - M.left) / (W - M.left - M.right)) * (layout.now - layout.t0)));
    return { id: n.id, at };
  }

  function showTip() {
    if (!hover || !mouse) { tip.hidden = true; return; }
    const world = getWorld(), n = world.tree.get(hover.id);
    if (!n) { tip.hidden = true; return; }
    let seg = n.history[0];
    for (const h of n.history) if (h.step <= hover.at) seg = h;
    const alive = n.died < 0, s = alive ? world.snakes.find((x) => x.id === n.id) : null;
    const splits = n.history.length - 1;
    const status = alive ? `alive, ${s.body.length} long` : `died at step ${n.died}`;
    tip.innerHTML =
      `<div class="tree-tip-head"><span class="pit-swatch" style="background:hsl(${seg.hue.toFixed(0)} 45% 55%)"></span>snake ${n.id}</div>` +
      `<div class="tree-tip-meta">born step ${n.born}, ${status}, split ${splits} time${splits === 1 ? "" : "s"}</div>` +
      `<div class="tree-tip-meta">genes at step ${Math.round(hover.at)}:</div>` +
      `<div class="tree-tip-genes">` + GENES.map((g) => {
        const v = seg.genes[g.key], f = (v - g.min) / (g.max - g.min);
        return `<span>${g.key}</span><span class="bar"><i style="width:${(f * 100).toFixed(1)}%"></i></span><span class="val">${g.max > 1 ? v.toFixed(1) : v.toFixed(2)}</span>`;
      }).join("") + `</div>`;
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
    const h = pick(mouse.x, mouse.y);
    const changed = (h && h.id) !== (hover && hover.id) || (h && hover && Math.abs(h.at - hover.at) > 0.5);
    hover = h;
    if (changed) { onHover(hover ? hover.id : -1); draw(); }
    showTip();
  }
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerdown", onMove);
  canvas.addEventListener("pointerleave", () => { hover = null; mouse = null; onHover(-1); tip.hidden = true; draw(); });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const now = getWorld().step;
    windowSteps = Math.max(200, Math.min(Math.max(200, now), windowSteps * Math.exp(e.deltaY * 0.0015)));
    draw(); if (mouse) onMove({ clientX: mouse.cx, clientY: mouse.cy });
  }, { passive: false });

  return {
    draw() { draw(); if (hover) showTip(); },
    resize() { resize(); draw(); },
    setShowDead(v) { showDead = v; draw(); },
    reset() { hover = null; tip.hidden = true; onHover(-1); windowSteps = 3000; },
  };
}
