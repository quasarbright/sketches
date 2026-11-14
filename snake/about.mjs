// The about modal's diagrams: the real rules and the real bot on a small 12 x 8 board, from one
// position where the shortest path to the egg runs down a dead-end corridor.
//   greedy: a bot that just follows the shortest path eats the egg and is stuck
//   check:  the real bot sends a copy ahead, sees the trap, and takes the long way round
import { withBoard, step, dirTo } from "./game.mjs";
import { decide, pathTo } from "./bot.mjs";
import { drawBoard, fitCanvas } from "./render.mjs";

const BW = 12, BH = 8, RATE = 6; // steps a second
const at = (x, y) => y * BW + x;

// the head at the open end of a corridor between the body and the top wall, the egg at the far
// end; the body runs on round the board, so it's still lining the corridor when the head arrives
function start() {
  const snake = [at(9, 0)];
  for (let x = 9; x >= 0; x--) snake.push(at(x, 1));
  for (let y = 2; y < BH; y++) snake.push(at(0, y));
  for (let x = 1; x < BW; x++) snake.push(at(x, BH - 1));
  for (let y = BH - 2; y >= 3; y--) snake.push(at(BW - 1, y));
  for (let x = BW - 2; x >= 6; x--) snake.push(at(x, 3));
  return { snake, egg: at(0, 0), dir: "UP", seed: 11, alive: true, won: false, eaten: 0, steps: 0, sinceEat: 0 };
}

const greedyPlan = (g) => { const path = pathTo(g.snake, g.egg); return { kind: "egg", path, dir: path ? dirTo(g.snake[0], path[0]) : g.dir }; };

// Each diagram is a little script: hold on a state, or play steps, with a caption for each part.
function makeDiagram(cv, cap, script) {
  let w = 0, ctx = null;
  const size = () => {
    const nw = Math.min(440, cv.parentElement.clientWidth || 440);
    if (nw !== w) { w = nw; ctx = fitCanvas(cv, w, BW, BH); }
  };
  let s = script(), last = 0, acc = 0;
  return (now) => {
    size();
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    acc += dt;
    let frame = s.frame(acc);
    while (frame.done) { acc -= frame.used; frame = s.next(acc); if (frame === null) { s = script(); acc = 0; frame = s.frame(0); } }
    withBoard(BW, BH, () => drawBoard(ctx, w, { game: frame.game, prev: frame.prev, t: frame.t, plan: frame.plan, dead: !frame.game.alive, round: 10 }));
    if (cap.textContent !== frame.caption) cap.textContent = frame.caption;
  };
}

// A script runs through parts: { hold: seconds } shows the state as it is; { play: done } steps
// at RATE until done(game) is true. Each part has a caption (a string or a function of the plan).
function script(parts, choose) {
  return () => {
    let game = start(), prev = null, plan = withBoard(BW, BH, () => choose(game)), i = 0, stepT = 0;
    const view = (t, caption) => ({ game, prev, t, plan, caption: typeof caption === "function" ? caption(plan) : caption });
    const api = {
      frame(time) {
        const part = parts[i];
        if (part.hold !== undefined) return time >= part.hold ? { done: true, used: part.hold } : view(1, part.caption);
        // play: one step every 1/RATE seconds
        while (time - stepT >= 1 / RATE) {
          stepT += 1 / RATE;
          if (!game.alive || part.play(game)) return { done: true, used: stepT };
          withBoard(BW, BH, () => {
            prev = game.snake;
            game = step(game, plan.dir);
            if (game.alive) plan = choose(game);
          });
        }
        return view(Math.min(1, (time - stepT) * RATE), part.caption);
      },
      next(time) {
        i++; stepT = 0;
        if (i >= parts.length) return null;
        return api.frame(time);
      },
    };
    return api;
  };
}

export function setupAbout(el) {
  const greedy = makeDiagram(el.querySelector('[data-dia="greedy"]'), el.querySelector('[data-cap="greedy"]'),
    script([
      { hold: 1.6, caption: "The shortest path to the egg" },
      { play: (g) => g.eaten > 0, caption: "The shortest path to the egg" },
      { play: () => false, caption: "It eats the egg…" },
      { hold: 2.2, caption: "…and has nowhere to go" },
    ], greedyPlan));
  const check = makeDiagram(el.querySelector('[data-dia="check"]'), el.querySelector('[data-cap="check"]'),
    script([
      { hold: 3, caption: "The copy eats the egg and is boxed in, with no way to its tail" },
      { play: (g) => g.eaten > 0, caption: (p) => p.kind === "egg" ? "The egg is safe now: it goes the long way round, arriving after the body has left the corner" : "So it follows its tail instead" },
      { play: (g) => g.sinceEat >= 6, caption: "It eats the egg and still has a way out" },
      { hold: 1.6, caption: "It eats the egg and still has a way out" },
    ], decide));
  let raf = 0;
  const loop = (now) => { greedy(now); check(now); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
}
