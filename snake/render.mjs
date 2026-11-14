// Drawing the board: the snake as one rounded tube shaded by age, the egg, and the bot's plan.
// Used by the game and by the about modal's diagrams, which show a window of a real board.
import { W, H, DELTA, xy } from "./game.mjs";

export const COLORS = {
  well: "#121a24", check: "#16202c",
  head: [126, 240, 168], mid: [47, 191, 113], tail: [23, 96, 61],
  egg: "#ffd66b", eggShade: "#d9a93a",
  bot: "#b9a3ff", danger: "#ff5a6e",
};

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
// head bright, tail dark: k = 0 at the head, 1 at the tail
export function bodyColor(k) {
  return rgb(k < 0.5 ? mix(COLORS.head, COLORS.mid, k * 2) : mix(COLORS.mid, COLORS.tail, (k - 0.5) * 2));
}

// Sizes a canvas for `cols` x `rows` cells at `cssW` px wide, sharp on hi-dpi screens.
export function fitCanvas(cv, cssW, cols = W, rows = H) {
  const d = Math.max(1, devicePixelRatio || 1), cssH = cssW * rows / cols;
  cv.width = Math.round(cssW * d); cv.height = Math.round(cssH * d);
  cv.style.width = cssW + "px"; cv.style.height = cssH + "px";
  const g = cv.getContext("2d");
  g.setTransform(d, 0, 0, d, 0, 0);
  return g;
}

// view: the window of the board to show, { x0, y0, cols, rows }; the whole board by default.
// opts:
//   game          the state to draw
//   prev          the snake one step earlier, and t in [0, 1] how far through the step to draw
//                 (the head slides into its cell and the tail out of its old one)
//   plan          what the bot thought (bot.mjs decide), drawn over the board
//   dead          draw the crash
//   alpha         for the whole snake (the about diagrams fade a copy)
export function drawBoard(g, cssW, { game, prev = null, t = 1, plan = null, dead = false, view = null, round = 14 } = {}) {
  const v = view || { x0: 0, y0: 0, cols: W, rows: H };
  const c = cssW / v.cols, cssH = c * v.rows;
  const center = (cell) => { const [x, y] = xy(cell); return [(x - v.x0 + 0.5) * c, (y - v.y0 + 0.5) * c]; };

  g.save();
  g.clearRect(0, 0, cssW, cssH);
  g.beginPath(); g.roundRect(0, 0, cssW, cssH, round); g.clip();
  g.fillStyle = COLORS.well; g.fillRect(0, 0, cssW, cssH);
  g.fillStyle = COLORS.check;
  for (let y = 0; y < v.rows; y++) for (let x = (y + v.x0 + v.y0) % 2; x < v.cols; x += 2) g.fillRect(x * c, y * c, c, c);

  if (plan) drawPlanUnder(g, c, center, plan);
  if (game.egg >= 0) drawEgg(g, c, center(game.egg));
  drawSnake(g, c, center, game.snake, prev, t);
  if (plan) drawPlanOver(g, c, center, game.snake, plan, prev, t);
  drawEyes(g, c, center, game, prev, t, dead);
  if (dead) drawCrash(g, c, center, game);
  g.restore();
}

// where the head is drawn: sliding from the previous head's cell into the current one
function headPoint(center, snake, prev, t) {
  const [hx, hy] = center(snake[0]);
  if (!prev || t >= 1 || snake.length < 2) return [hx, hy];
  const [nx, ny] = center(snake[1]);
  return [nx + (hx - nx) * t, ny + (hy - ny) * t];
}

function tubePoints(center, snake, prev, t) {
  const pts = [headPoint(center, snake, prev, t)];
  for (let i = 1; i < snake.length; i++) pts.push(center(snake[i]));
  // the tail end slides out of the cell it just left (unless the snake just grew)
  if (prev && t < 1) {
    const oldTail = prev[prev.length - 1], tail = snake[snake.length - 1];
    if (oldTail !== tail) {
      const [ox, oy] = center(oldTail), [tx, ty] = center(tail);
      pts.push([ox + (tx - ox) * t, oy + (ty - oy) * t]);
    }
  }
  return pts;
}

export function drawSnake(g, c, center, snake, prev = null, t = 1, { alpha = 1, color = null, width = 0.72 } = {}) {
  const pts = tubePoints(center, snake, prev, t);
  g.save();
  g.globalAlpha = alpha;
  g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = c * width;
  if (pts.length === 1) { g.fillStyle = color || bodyColor(0); g.beginPath(); g.arc(pts[0][0], pts[0][1], c * width / 2, 0, 7); g.fill(); }
  // tail to head, so the head end sits on top; one short segment per cell, each its own shade
  const n = pts.length;
  for (let i = n - 1; i > 0; i--) {
    g.strokeStyle = color || bodyColor((i - 0.5) / Math.max(1, n - 1));
    g.beginPath(); g.moveTo(pts[i][0], pts[i][1]); g.lineTo(pts[i - 1][0], pts[i - 1][1]); g.stroke();
  }
  g.restore();
}

function drawEyes(g, c, center, game, prev, t, dead) {
  const [hx, hy] = headPoint(center, game.snake, prev, t);
  const [dx, dy] = DELTA[game.dir];
  const fx = hx + dx * c * 0.12, fy = hy + dy * c * 0.12;
  for (const s of [-1, 1]) {
    const ex = fx - dy * s * c * 0.17, ey = fy + dx * s * c * 0.17;
    g.fillStyle = "#0c1a12";
    g.beginPath(); g.arc(ex, ey, c * 0.09, 0, 7); g.fill();
    if (dead) { // little x eyes
      g.strokeStyle = "#ffffff"; g.lineWidth = Math.max(1, c * 0.04);
      const r = c * 0.05;
      g.beginPath(); g.moveTo(ex - r, ey - r); g.lineTo(ex + r, ey + r); g.moveTo(ex + r, ey - r); g.lineTo(ex - r, ey + r); g.stroke();
    } else {
      g.fillStyle = "#ffffff";
      g.beginPath(); g.arc(ex + dx * c * 0.03, ey + dy * c * 0.03, c * 0.035, 0, 7); g.fill();
    }
  }
}

export function drawEgg(g, c, [x, y]) {
  g.save();
  g.fillStyle = "rgba(0,0,0,.35)";
  g.beginPath(); g.ellipse(x, y + c * 0.3, c * 0.24, c * 0.07, 0, 0, 7); g.fill();
  const grad = g.createRadialGradient(x - c * 0.1, y - c * 0.14, c * 0.02, x, y, c * 0.4);
  grad.addColorStop(0, "#fff3c4"); grad.addColorStop(0.45, COLORS.egg); grad.addColorStop(1, COLORS.eggShade);
  g.fillStyle = grad;
  // a little narrower at the top, like an egg
  g.beginPath();
  g.moveTo(x, y - c * 0.36);
  g.bezierCurveTo(x + c * 0.24, y - c * 0.36, x + c * 0.3, y + c * 0.08, x + c * 0.27, y + c * 0.14);
  g.bezierCurveTo(x + c * 0.22, y + c * 0.36, x - c * 0.22, y + c * 0.36, x - c * 0.27, y + c * 0.14);
  g.bezierCurveTo(x - c * 0.3, y + c * 0.08, x - c * 0.24, y - c * 0.36, x, y - c * 0.36);
  g.fill();
  g.restore();
}

// under the snake: the cells a doomed copy could still reach, and the copy itself
function drawPlanUnder(g, c, center, plan) {
  if (plan.trapped && plan.kind !== "egg") {
    g.fillStyle = "rgba(255, 90, 110, .28)";
    for (const cell of [...plan.trapped, plan.ghost[0]]) {
      const [x, y] = center(cell);
      g.beginPath(); g.roundRect(x - c * 0.46, y - c * 0.46, c * 0.92, c * 0.92, c * 0.18); g.fill();
    }
  }
  if (plan.ghost && plan.kind !== "egg") {
    drawSnake(g, c, center, plan.ghost, null, 1, { alpha: 0.32, color: COLORS.bot, width: 0.5 });
  }
}

// over the snake: the path it's taking
function drawPlanOver(g, c, center, snake, plan, prev, t) {
  const from = headPoint(center, snake, prev, t);
  g.save();
  g.lineCap = "round"; g.lineJoin = "round";
  const line = (cells, color, dash, width) => {
    if (!cells?.length) return;
    g.strokeStyle = color; g.lineWidth = c * width; g.setLineDash(dash);
    g.beginPath(); g.moveTo(from[0], from[1]);
    for (const cell of cells) { const [x, y] = center(cell); g.lineTo(x, y); }
    g.stroke();
  };
  if (plan.kind === "egg" || plan.kind === "gamble") line(plan.path, plan.kind === "egg" ? COLORS.bot : COLORS.danger, [0, c * 0.42], 0.16);
  else {
    if (plan.path) line(plan.path, "rgba(255, 90, 110, .8)", [0, c * 0.42], 0.12); // the path it turned down
    if (plan.chase) line(plan.chase, COLORS.bot, [c * 0.5, c * 0.32], 0.12);
  }
  g.restore();
}

function drawCrash(g, c, center, game) {
  const [x, y] = center(game.snake[0]);
  const [dx, dy] = DELTA[game.dir];
  const bx = x + dx * c * 0.5, by = y + dy * c * 0.5; // where it hit: the edge of the head's cell
  g.save();
  g.strokeStyle = COLORS.danger; g.lineWidth = c * 0.12; g.lineCap = "round";
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    g.beginPath(); g.moveTo(bx + Math.cos(a) * c * 0.22, by + Math.sin(a) * c * 0.22);
    g.lineTo(bx + Math.cos(a) * c * 0.48, by + Math.sin(a) * c * 0.48); g.stroke();
  }
  g.restore();
}
