// The about modal's diagrams: the real rules and the real bot on a small 12 x 8 board, from one
// position where the shortest path to the egg runs down a dead-end corridor.
//   greedy: a bot that just follows the shortest path eats the egg and is stuck
//   check:  the real bot sends a copy ahead, sees the trap, and takes the long way round
//   loop:   the endgame loop being built around a snake, two cells at a time, then followed
import { withBoard, step, dirTo } from "./game.mjs";
import { decide, pathTo, LOOP_ROOM } from "./bot.mjs";
import { buildLoop, loopMove } from "./cycle.mjs";
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

// The loop diagram: a snake coiled in the middle of the small board. The real loop builder runs
// on it with a trace, which this replays: the starting loop, then each 2x2 detour. Then the snake
// follows the finished loop with the real shortcut rule.
function loopDiagram(cv, cap) {
  const snake = [at(5, 4), at(4, 4), at(3, 4), at(3, 3), at(3, 2), at(4, 2), at(5, 2), at(6, 2), at(7, 2), at(8, 2), at(8, 3), at(8, 4), at(8, 5), at(7, 5)];
  const egg = at(10, 6);
  const trace = [];
  let loop = null;
  withBoard(BW, BH, () => { for (let sd = 1; !loop && sd < 20; sd++) { trace.length = 0; loop = buildLoop(snake, sd, trace); } });
  const SPLICE_RATE = 12, edits = trace.slice(1);
  const BUILD = edits.length / SPLICE_RATE;
  const T_START = 2.2, T_FULL = 1.8, FOLLOW = 60, T_END = 1.2;
  const total = T_START + BUILD + T_FULL + FOLLOW / RATE + T_END;
  let w = 0, ctx = null, t0 = 0;
  return (now) => {
    const nw = Math.min(440, cv.parentElement.clientWidth || 440);
    if (nw !== w) { w = nw; ctx = fitCanvas(cv, w, BW, BH); }
    if (!t0) t0 = now;
    const time = ((now - t0) / 1000) % total;
    // the loop so far, as next-links
    const next = new Map();
    const start = trace[0].start;
    start.forEach((c, i) => next.set(c, start[(i + 1) % start.length]));
    const shown = Math.min(edits.length, Math.max(0, Math.floor((time - T_START) * SPLICE_RATE)));
    for (let i = 0; i < shown; i++) {
      const e = edits[i];
      if (e.splice) { const [a, f, g2, b] = e.splice; next.set(a, f); next.set(f, g2); next.set(g2, b); }
      else { const [a, b, c, f] = e.swap; next.set(a, f); next.set(f, c); next.delete(b); }
    }
    const lastEdit = shown > 0 && time < T_START + BUILD + 0.3 ? edits[shown - 1].splice?.slice(1, 3) : null;
    // after it's built: follow it
    let game = { snake, egg, dir: "LEFT", seed: 5, alive: true, won: false, eaten: 0, steps: 0, sinceEat: 0 }, prev = null, tt = 1;
    const followT = time - (T_START + BUILD + T_FULL);
    if (followT > 0) {
      const steps = Math.min(FOLLOW, Math.floor(followT * RATE));
      withBoard(BW, BH, () => {
        for (let i = 0; i < steps && game.alive && !game.won; i++) {
          prev = game.snake;
          const n = loopMove(loop, game.snake, game.egg, LOOP_ROOM);
          game = step(game, dirTo(game.snake[0], n));
        }
      });
      tt = steps < FOLLOW ? Math.min(1, followT * RATE - steps) : 1;
    }
    const under = (g, c, center) => {
      g.save();
      g.strokeStyle = followT > 0 ? "rgba(185, 163, 255, .35)" : "#b9a3ff"; g.lineWidth = c * 0.12; g.lineJoin = "round";
      g.beginPath();
      let cell = start[0];
      for (let k = 0; k <= next.size; k++) { const [x, y] = center(cell); k ? g.lineTo(x, y) : g.moveTo(x, y); cell = next.get(cell); }
      g.stroke();
      if (lastEdit) { // the two cells the latest detour took in
        g.fillStyle = "rgba(185, 163, 255, .35)";
        for (const c2 of lastEdit) { const [x, y] = center(c2); g.beginPath(); g.roundRect(x - c * 0.42, y - c * 0.42, c * 0.84, c * 0.84, c * 0.15); g.fill(); }
      }
      g.restore();
    };
    withBoard(BW, BH, () => drawBoard(ctx, w, { game, prev, t: tt, under, round: 10 }));
    const caption = time < T_START ? "Start: the body, plus the shortest way from the head back to the tail"
      : time < T_START + BUILD ? "Grow it two cells at a time, with 2×2 detours"
      : followT <= 0 ? "Every cell is on the loop"
      : "Then follow it, cutting corners only well short of the tail";
    if (cap.textContent !== caption) cap.textContent = caption;
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
    ], (g) => decide(g, { useLoop: false })));
  const ring = loopDiagram(el.querySelector('[data-dia="loop"]'), el.querySelector('[data-cap="loop"]'));
  let raf = 0;
  const loop = (now) => { greedy(now); check(now); ring(now); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
}
