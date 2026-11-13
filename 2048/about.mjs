// The about modal's live diagrams. Each one runs the game's real code (game.mjs, minimax.mjs)
// on the player's current board.
import { move, slide, isLegal, score, scoreParts, pathScore, bestSnake, SNAKE_PATHS, DIRECTIONS } from "./game.mjs";
import { chooseAction } from "./minimax.mjs";
import { tileColors, numeralScale } from "./palette.mjs";

const BOT = "#57e3dc", MUTED = "#a69ed0", FAINT = "#6d6499", TEXT = "#f0ecff";
const ARROW = { UP: "↑", DOWN: "↓", LEFT: "←", RIGHT: "→" };
const fmt = (v) => (Math.abs(v) >= 100 ? v.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) : v.toFixed(3));

// a sorted, snaking board to use when the player's board is still nearly empty
const SAMPLE = [0, 0, 2, 0, 2, 0, 4, 0, 2, 4, 8, 16, 256, 128, 64, 32];

// size a canvas to its CSS width (capped) and the given height; returns a 2D context in CSS px
function frame(cv, maxW, heightFor) {
  const w = Math.min(maxW, cv.parentElement.clientWidth || maxW);
  const h = heightFor(w), d = Math.max(1, devicePixelRatio || 1);
  if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) {
    cv.width = Math.round(w * d); cv.height = Math.round(h * d);
    cv.style.width = w + "px"; cv.style.height = h + "px";
  }
  const g = cv.getContext("2d");
  g.setTransform(d, 0, 0, d, 0, 0);
  g.clearRect(0, 0, w, h);
  return { g, w, h };
}

// a little board: s is its width in px. Returns the center of a cell.
function drawBoard(g, board, x, y, s, { ring = -1, alpha = 1, numbers = true } = {}) {
  const gap = s * 0.04, c = (s - 5 * gap) / 4, r = c * 0.16;
  g.save(); g.globalAlpha = alpha;
  g.fillStyle = "#0b0918"; g.beginPath(); g.roundRect(x, y, s, s, gap * 1.6); g.fill();
  for (let i = 0; i < 16; i++) {
    const cx = x + gap + (i % 4) * (c + gap), cy = y + gap + Math.floor(i / 4) * (c + gap), v = board[i];
    g.fillStyle = v ? tileColors(v)[0] : "#1a1534";
    g.beginPath(); g.roundRect(cx, cy, c, c, r); g.fill();
    if (v && numbers && c >= 13) {
      g.fillStyle = tileColors(v)[1];
      g.font = `${(c * numeralScale(v)).toFixed(1)}px Bungee, "Arial Black", sans-serif`;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(v, cx + c / 2, cy + c / 2 + c * 0.03);
    }
    if (i === ring) {
      g.strokeStyle = "#ffffff"; g.lineWidth = Math.max(2, c * 0.09);
      g.beginPath(); g.roundRect(cx - 2, cy - 2, c + 4, c + 4, r + 2); g.stroke();
    }
  }
  g.restore();
  return (i) => [x + gap + (i % 4) * (c + gap) + c / 2, y + gap + Math.floor(i / 4) * (c + gap) + c / 2];
}

// ---------- 1. the four futures ----------
function drawNext(cv, cap, game) {
  const cols = (cv.parentElement.clientWidth || 440) < 380 ? 2 : 4;
  const { g, w } = frame(cv, 460, (w) => {
    const s = (w - (cols - 1) * 14) / cols;
    return (s + 26) * (4 / cols) + 4;
  });
  const s = (w - (cols - 1) * 14) / cols;
  DIRECTIONS.forEach((d, k) => {
    const x = (k % cols) * (s + 14), y = Math.floor(k / cols) * (s + 26) + 22;
    g.fillStyle = MUTED; g.font = "700 13px Outfit, sans-serif"; g.textAlign = "center"; g.textBaseline = "alphabetic";
    if (!isLegal(game, d)) {
      g.fillText(`${ARROW[d]} ${d.toLowerCase()}: no change`, x + s / 2, y - 7);
      drawBoard(g, game.board, x, y, s, { alpha: 0.3 });
      return;
    }
    const slid = slide(game.board, d), next = move(game, d);
    const at = next.board.findIndex((v, i) => v && !slid[i]);
    g.fillText(`${ARROW[d]} ${d.toLowerCase()}`, x + s / 2, y - 7);
    drawBoard(g, next.board, x, y, s, { ring: at });
  });
  cap.textContent = "After each move the ringed tile appears there, every time.";
}

// ---------- 2. the eight snakes ----------
function snakeDrawer(cv, cap, board, sampleNote) {
  const order = SNAKE_PATHS.map((p) => ({ p, v: pathScore(board, p) }));
  const best = order.reduce((a, b) => (b.v > a.v ? b : a));
  const STEP = 1500, HOLD = 3200;
  return (t) => {
    const { g, w } = frame(cv, 280, (w) => w);
    const cyc = t % (STEP * 8 + HOLD);
    const k = Math.min(8, Math.floor(cyc / STEP));
    const done = k === 8;
    const cur = done ? best : order[k];
    const center = drawBoard(g, board, 0, 0, w, { alpha: 0.55 });
    // draw the path progressively, brightening toward its head
    const grow = done ? 1 : Math.min(1, (cyc % STEP) / (STEP * 0.55));
    const segs = 15 * grow;
    g.lineCap = "round"; g.strokeStyle = BOT; g.lineWidth = Math.max(3, w * 0.022);
    for (let j = 1; j <= Math.ceil(segs); j++) {
      const [x1, y1] = center(cur.p[j - 1]), [x2, y2] = center(cur.p[j]);
      const f = Math.min(1, segs - (j - 1));
      g.globalAlpha = 0.12 + 0.78 * Math.pow(0.5, 15 - j) ** 0.25;
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 + (x2 - x1) * f, y1 + (y2 - y1) * f); g.stroke();
    }
    if (grow >= 1) {
      const [hx, hy] = center(cur.p[15]);
      g.globalAlpha = 1; g.fillStyle = BOT; g.beginPath(); g.arc(hx, hy, g.lineWidth * 1.6, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    const soFar = order.slice(0, k + 1).reduce((a, b) => Math.max(a, b.v), -Infinity);
    cap.textContent = done
      ? `The best of the 8 scores ${fmt(best.v)}.${sampleNote}`
      : `Snake ${k + 1} of 8 scores ${fmt(cur.v)}. Best so far: ${fmt(soFar)}.${sampleNote}`;
  };
}

// ---------- 3. the score's parts ----------
function drawParts(el, board) {
  const p = scoreParts(board);
  const row = (a, b) => `<tr><td style="color:var(--muted);padding:2px 14px 2px 0">${a}</td><td style="font-family:var(--font-mono);text-align:right">${b}</td></tr>`;
  el.innerHTML = `<table style="margin:4px auto 1.2em;font-size:.9rem;border-collapse:collapse">
    ${row("best of the 8 snakes", fmt(p.snake))}
    ${row("no moves left", p.dead ? "÷ 10" : "no")}
    ${row("<b style='color:var(--text)'>score</b>", `<b style="color:var(--bot)">${fmt(p.score)}</b>`)}
  </table>`;
  // sanity: the same number the search uses
  if (p.score !== score(board)) console.warn("about: score mismatch");
}

// ---------- 4. the search, two moves deep ----------
function treeDrawer(cv, cap, game) {
  const root = chooseAction(game, 1, { shuffle: false }); // the bot's own search, cut to 1 + 1 moves
  const groups = DIRECTIONS.map((d) => {
    if (!isLegal(game, d)) return { d, legal: false };
    const after = move(game, d);
    const leaves = DIRECTIONS.map((d2) => ({ d: d2, v: score(move(after, d2).board) }));
    return { d, legal: true, board: after.board, leaves, v: root.values[d] };
  });
  const all = groups.flatMap((gr) => (gr.legal ? gr.leaves.map((l) => l.v) : []));
  const hi = Math.max(...all), lo = Math.min(...all, 0);
  const LEAF = 260, HOLD = 3500, nLeaves = 16, total = nLeaves * LEAF + 900 + HOLD;
  return (t) => {
    const cyc = t % total;
    const shown = Math.min(nLeaves, Math.floor(cyc / LEAF));
    const decided = cyc > nLeaves * LEAF + 300;
    const { g, w, h } = frame(cv, 460, (w) => Math.round(w * 0.36 + 220));
    const colW = w / 4, rootS = Math.min(96, w * 0.22), midS = Math.min(84, colW * 0.74);
    const rootX = w / 2 - rootS / 2, rootY = 4;
    const midY = rootY + rootS + 34, barTop = midY + midS + 26, barH = h - barTop - 40;
    drawBoard(g, game.board, rootX, rootY, rootS, { numbers: rootS > 70 });
    groups.forEach((gr, k) => {
      const cx = colW * k + colW / 2;
      const chosen = decided && gr.d === root.move;
      // edge from the root
      g.strokeStyle = chosen ? BOT : "#3a3168"; g.lineWidth = chosen ? 3 : 2; g.globalAlpha = gr.legal ? 1 : 0.35;
      g.beginPath(); g.moveTo(w / 2, rootY + rootS + 2); g.lineTo(cx, midY - 16); g.stroke();
      g.fillStyle = chosen ? BOT : MUTED; g.font = "700 13px Outfit, sans-serif"; g.textAlign = "center";
      g.fillText(ARROW[gr.d], cx, midY - 4);
      g.globalAlpha = 1;
      if (!gr.legal) {
        g.fillStyle = FAINT; g.font = "600 12px Outfit, sans-serif";
        g.fillText("can't move", cx, midY + midS / 2);
        return;
      }
      drawBoard(g, gr.board, cx - midS / 2, midY, midS, { numbers: midS > 60 });
      // its four follow-ups, as bars
      const bw = Math.min(16, (colW - 18) / 4 - 4);
      const groupDone = shown >= (k + 1) * 4;
      const bestLeaf = gr.leaves.reduce((a, b) => (b.v > a.v ? b : a));
      gr.leaves.forEach((l, j) => {
        const bx = cx - (4 * bw + 3 * 4) / 2 + j * (bw + 4);
        g.fillStyle = "#1d1838"; g.beginPath(); g.roundRect(bx, barTop, bw, barH, 4); g.fill();
        if (k * 4 + j < shown) {
          const f = hi > lo ? (l.v - lo) / (hi - lo) : 0, bh = Math.max(3, barH * f);
          const lit = groupDone && l === bestLeaf;
          g.fillStyle = lit ? (chosen || !decided ? BOT : "#8a83b8") : "#3a3168";
          g.beginPath(); g.roundRect(bx, barTop + barH - bh, bw, bh, 4); g.fill();
        }
        g.fillStyle = FAINT; g.font = "600 10px Outfit, sans-serif";
        g.fillText(ARROW[l.d], bx + bw / 2, barTop + barH + 13);
      });
      if (groupDone) {
        g.fillStyle = chosen ? BOT : TEXT; g.font = "600 11px 'JetBrains Mono', monospace";
        g.fillText(fmt(gr.v), cx, barTop + barH + 30);
      }
    });
    if (shown < nLeaves) {
      const k = Math.floor(shown / 4), j = shown % 4;
      cap.textContent = groups[k].legal ? `Scoring ${ARROW[groups[k].d]} then ${ARROW[DIRECTIONS[j]]}.` : `${ARROW[groups[k].d]} doesn't move anything, so it's skipped.`;
    } else if (!decided) cap.textContent = "Each first move is worth its best follow-up.";
    else cap.textContent = `The best value belongs to ${ARROW[root.move]} ${root.move.toLowerCase()}, so that's the move.`;
  };
}

// returns stop()
export function setupAbout(el, game) {
  const q = (s) => el.querySelector(s);
  drawNext(q('[data-dia="next"]'), q('[data-cap="next"]'), game);
  const tiles = game.board.filter((v) => v).length;
  const board = tiles >= 6 ? game.board : SAMPLE;
  const note = tiles >= 6 ? "" : " (A sample board, since yours is nearly empty.)";
  drawParts(q('[data-dia="parts"]'), board);
  const snakes = snakeDrawer(q('[data-dia="snakes"]'), q('[data-cap="snakes"]'), board, note);
  const tree = treeDrawer(q('[data-dia="tree"]'), q('[data-cap="tree"]'), game);
  let raf = 0, t0 = performance.now(), lastW = 0;
  const tick = (now) => {
    raf = requestAnimationFrame(tick);
    if (!el.isConnected) return stop();
    const w = el.clientWidth;
    if (w !== lastW) { lastW = w; drawNext(q('[data-dia="next"]'), q('[data-cap="next"]'), game); }
    const t = Math.max(0, now - t0); // a frame's timestamp can be a little before t0
    snakes(t); tree(t);
  };
  raf = requestAnimationFrame(tick);
  function stop() { cancelAnimationFrame(raf); }
  return stop;
}
