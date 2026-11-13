// The about modal's picture: a board in perfect snake order, with the snake drawn through it.
import { bestSnake } from "./game.mjs";
import { tileColors, numeralScale } from "./palette.mjs";

const BOT = "#57e3dc";
// biggest in the bottom-left corner, then back and forth up the board in decreasing order
const SNAKE = [
  0, 0, 0, 0,
  16, 8, 4, 2,
  32, 64, 128, 256,
  4096, 2048, 1024, 512,
];

function draw(cv) {
  const w = Math.min(280, cv.parentElement.clientWidth || 280), d = Math.max(1, devicePixelRatio || 1);
  cv.width = Math.round(w * d); cv.height = Math.round(w * d);
  cv.style.width = w + "px"; cv.style.height = w + "px";
  const g = cv.getContext("2d");
  g.setTransform(d, 0, 0, d, 0, 0);
  const gap = w * 0.04, c = (w - 5 * gap) / 4, r = c * 0.16;
  const center = (i) => [gap + (i % 4) * (c + gap) + c / 2, gap + Math.floor(i / 4) * (c + gap) + c / 2];
  g.fillStyle = "#0b0918"; g.beginPath(); g.roundRect(0, 0, w, w, gap * 1.6); g.fill();
  const cellAt = (i) => [gap + (i % 4) * (c + gap), gap + Math.floor(i / 4) * (c + gap)];
  SNAKE.forEach((v, i) => {
    const [x, y] = cellAt(i);
    g.fillStyle = v ? tileColors(v)[0] : "#1a1534";
    g.beginPath(); g.roundRect(x, y, c, c, r); g.fill();
  });
  // the snake the score picks for this board, under the numerals, brightening toward its head
  const { path } = bestSnake(SNAKE);
  const from = path.findIndex((i) => SNAKE[i]);
  g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = BOT; g.lineWidth = Math.max(4, w * 0.035);
  for (let k = from + 1; k < 16; k++) {
    const [x1, y1] = center(path[k - 1]), [x2, y2] = center(path[k]);
    g.globalAlpha = 0.35 + 0.5 * (k - from) / (15 - from);
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  }
  g.globalAlpha = 1;
  SNAKE.forEach((v, i) => {
    if (!v) return;
    const [x, y] = cellAt(i);
    g.fillStyle = tileColors(v)[1];
    g.font = `${(c * numeralScale(v)).toFixed(1)}px Bungee, "Arial Black", sans-serif`;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = c * 0.08; g.strokeStyle = tileColors(v)[0];
    g.strokeText(v, x + c / 2, y + c / 2 + c * 0.03); // a halo in the tile's color over the line
    g.fillText(v, x + c / 2, y + c / 2 + c * 0.03);
  });
  // ring the head: where the biggest tile belongs
  const [hx, hy] = cellAt(path[15]);
  g.strokeStyle = BOT; g.lineWidth = Math.max(3, c * 0.07);
  g.beginPath(); g.roundRect(hx - 3, hy - 3, c + 6, c + 6, r + 3); g.stroke();
}

export function setupAbout(el) {
  const cv = el.querySelector('[data-dia="snake"]');
  draw(cv);
  document.fonts?.ready.then(() => cv.isConnected && draw(cv)); // the numerals use the webfont
  return () => {};
}
