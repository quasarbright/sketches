// Snake Pit simulation core. No DOM here, so it runs in node for tuning and tests.
//
// The world is a walled grid. Every step each snake moves one cell, choosing between turning left,
// going straight, or turning right by scoring each option with its genes. Eating food adds a cell.
// Every move costs energy in proportion to how sharp the snake's senses are; each full unit of
// spent energy kills its tail tip. A snake that splits hands mutated copies of its genes to both
// halves. That's the whole evolutionary loop: no fitness function, just who lasts long enough to split.

// Gene ranges. The first four are the "brain": they cost energy to run.
export const GENES = [
  { key: "appetite", min: 0, max: 1, costly: true },  // pull toward food
  { key: "sight",    min: 0, max: 20, costly: true }, // how far away food can be seen, in cells
  { key: "caution",  min: 0, max: 1, costly: true },  // push away from walls and bodies ahead
  { key: "wariness", min: 0, max: 10, costly: true }, // how far ahead danger can be seen, in cells
  { key: "maturity", min: 4, max: 40, costly: false },// length where splitting gets likely
  { key: "jitter",   min: 0, max: 1, costly: false }, // randomness in each choice
];

// Tuned headlessly (see tune.mjs): with these, populations settle instead of booming or dying out.
export const DEFAULTS = {
  drainBase: 0.02,     // energy spent per move by a snake with no senses at all
  drainBrain: 0.06,    // extra energy per move per unit of brain size (normalized gene length)
  splitRate: 0.02,     // split chance per step at maturity length; scales with (length / maturity)²
  foodRate: 1,         // food spawned per step, per 1000 grid cells
  mutation: 0.06,      // mutation size, as a fraction of each gene's range
  minSplit: 12,        // shortest snake that can split
  startSnakes: 30,
  startLength: 8,
  startFoodDensity: 0.03,
  treeKeepDead: 4000,  // dead snakes with no living descendants stay in the family tree this many steps
};

// directions: 0 up, 1 right, 2 down, 3 left
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

function gauss(rand) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function randomGenes(rand) {
  const g = {};
  for (const { key, min, max } of GENES) g[key] = min + rand() * (max - min);
  return g;
}

export function mutateGenes(genes, size, rand) {
  const g = {};
  for (const { key, min, max } of GENES) {
    const v = genes[key] + gauss(rand) * size * (max - min);
    g[key] = Math.min(max, Math.max(min, v));
  }
  return g;
}

// Length of the brain-gene vector, each gene scaled to 0..1. Ranges 0..2.
export function brainSize(genes) {
  let s = 0;
  for (const { key, min, max, costly } of GENES) {
    if (!costly) continue;
    const n = (genes[key] - min) / (max - min);
    s += n * n;
  }
  return Math.sqrt(s);
}

// Hue from genes, so children look like their parents and families read as color patches.
export function geneHue(genes) {
  const n = (k) => {
    const d = GENES.find((g) => g.key === k);
    return (genes[k] - d.min) / (d.max - d.min);
  };
  const x = n("appetite") - n("caution") + 0.4 * (n("jitter") - 0.5);
  const y = n("sight") - n("wariness") + 0.4 * (n("maturity") - 0.5);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export class World {
  constructor(cols, rows, opts = {}) {
    this.cols = cols;
    this.rows = rows;
    this.p = { ...DEFAULTS, ...opts };
    this.rand = opts.rand || Math.random;
    this.reset();
  }

  reset() {
    const { cols, rows } = this;
    this.occ = new Int32Array(cols * rows); // snake id + 1, or 0
    this.food = new Uint8Array(cols * rows);
    this.foodCount = 0;
    this.snakes = [];
    this.nextId = 0;
    this.step = 0;
    this.foodDebt = 0;
    this.events = []; // { type: "shed"|"die"|"split"|"eat", ... } since the renderer last drained them
    this.stats = { births: 0, deaths: 0, starved: 0, trapped: 0 };
    this.tree = new Map();
    for (let i = 0; i < this.p.startSnakes; i++) this.spawnRandomSnake(randomGenes(this.rand));
    const n = Math.round(cols * rows * this.p.startFoodDensity);
    for (let i = 0; i < n; i++) this.spawnFood();
  }

  idx(x, y) { return y * this.cols + x; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.cols && y < this.rows; }

  spawnFood() {
    for (let tries = 0; tries < 20; tries++) {
      const i = Math.floor(this.rand() * this.cols * this.rows);
      if (!this.occ[i] && !this.food[i]) { this.food[i] = 1; this.foodCount++; return i; }
    }
    return -1;
  }

  dropFood(i) {
    if (!this.food[i]) { this.food[i] = 1; this.foodCount++; }
  }

  spawnRandomSnake(genes) {
    // a straight snake somewhere empty
    for (let tries = 0; tries < 50; tries++) {
      const dir = Math.floor(this.rand() * 4);
      const m = this.p.startLength + 1;
      const x = m + Math.floor(this.rand() * (this.cols - 2 * m));
      const y = m + Math.floor(this.rand() * (this.rows - 2 * m));
      const body = [];
      let ok = true;
      for (let k = 0; k < this.p.startLength; k++) {
        const bx = x - DX[dir] * k, by = y - DY[dir] * k;
        const i = this.idx(bx, by);
        if (this.occ[i]) { ok = false; break; }
        body.push(i);
      }
      if (!ok) continue;
      return this.addSnake(body, dir, genes, 0, 0, -1);
    }
    return null;
  }

  addSnake(body, dir, genes, energy, generation, founder) {
    const s = {
      id: this.nextId, founder: founder >= 0 ? founder : this.nextId, body, dir, genes, energy, generation,
      hue: geneHue(genes), drain: this.p.drainBase + this.p.drainBrain * brainSize(genes),
      alive: true, trail: [], born: this.step, parent: -1,
    };
    this.nextId++;
    // family tree: every snake that ever lived, with its genes after each split
    this.tree.set(s.id, { id: s.id, parent: -1, born: this.step, died: -1, history: [{ step: this.step, genes, hue: s.hue }] });
    for (const i of body) { this.occ[i] = s.id + 1; if (this.food[i]) { this.food[i] = 0; this.foodCount--; } }
    this.snakes.push(s);
    return s;
  }

  // Score one candidate move. Blocked cells are never chosen unless all three are blocked.
  score(s, dir, head) {
    const g = s.genes;
    const hx = head % this.cols, hy = (head / this.cols) | 0;
    const x = hx + DX[dir], y = hy + DY[dir];
    if (!this.inBounds(x, y) || this.occ[this.idx(x, y)]) return -Infinity;

    let total = 0;
    // food: nearest food the snake can see (from its head), pulled toward from the candidate cell
    if (s.target >= 0) {
      const fx = s.target % this.cols, fy = (s.target / this.cols) | 0;
      const d = Math.abs(fx - x) + Math.abs(fy - y);
      total += g.appetite / (1 + d);
    }
    // danger: how far you could keep going in that direction before hitting a wall or a body
    const reach = Math.floor(g.wariness);
    if (reach > 0) {
      let k = 1;
      for (; k <= reach; k++) {
        const ax = x + DX[dir] * k, ay = y + DY[dir] * k;
        if (!this.inBounds(ax, ay) || this.occ[this.idx(ax, ay)]) break;
      }
      if (k <= reach) total -= g.caution / k;
    }
    total += g.jitter * 0.5 * this.rand();
    return total;
  }

  findTarget(s) {
    // nearest visible food from the head (Euclidean radius = sight)
    const r = Math.floor(s.genes.sight);
    s.target = -1;
    if (r <= 0) return;
    const hx = s.body[0] % this.cols, hy = (s.body[0] / this.cols) | 0;
    let best = Infinity;
    const x0 = Math.max(0, hx - r), x1 = Math.min(this.cols - 1, hx + r);
    const y0 = Math.max(0, hy - r), y1 = Math.min(this.rows - 1, hy + r);
    const r2 = s.genes.sight * s.genes.sight;
    for (let y = y0; y <= y1; y++) {
      const row = y * this.cols;
      for (let x = x0; x <= x1; x++) {
        if (!this.food[row + x]) continue;
        const d2 = (x - hx) * (x - hx) + (y - hy) * (y - hy);
        if (d2 <= r2 && d2 < best) { best = d2; s.target = row + x; }
      }
    }
  }

  kill(s, cause) {
    if (!s.alive) return;
    s.alive = false;
    this.stats.deaths++;
    if (cause === "starved") this.stats.starved++; else this.stats.trapped++;
    for (const i of s.body) this.occ[i] = 0;
    const at = s.body.length ? s.body[0] : s.lastHead;
    this.events.push({ type: "die", body: s.body.slice(), hue: s.hue, cause });
    this.tree.get(s.id).died = this.step;
    if (at >= 0) this.dropFood(at);
    s.body = [];
  }

  moveSnake(s) {
    const head = s.body[0];
    this.findTarget(s);
    const options = [(s.dir + 3) % 4, s.dir, (s.dir + 1) % 4];
    let bestDir = s.dir, best = -Infinity;
    for (const d of options) {
      const v = this.score(s, d, head);
      if (v > best) { best = v; bestDir = d; }
    }
    if (best === -Infinity) { this.kill(s, "trapped"); return; }

    s.dir = bestDir;
    const nx = (head % this.cols) + DX[bestDir], ny = ((head / this.cols) | 0) + DY[bestDir];
    const ni = this.idx(nx, ny);
    s.body.unshift(ni);
    // cells the tail left this step, nearest the new tail first, so the renderer can slide it out
    s.trail = [];
    this.occ[ni] = s.id + 1;
    if (this.food[ni]) {
      this.food[ni] = 0; this.foodCount--;
      this.events.push({ type: "eat", at: ni, hue: s.hue });
    } else {
      const t = s.body.pop();
      this.occ[t] = 0;
      s.trail.push(t);
    }

    // metabolism: every move spends energy; each full unit kills the tail tip
    s.energy += s.drain;
    while (s.energy >= 1 && s.body.length) {
      s.energy -= 1;
      const t = s.body.pop();
      this.occ[t] = 0;
      s.trail.unshift(t);
      s.lastHead = s.body.length ? s.body[0] : t;
      this.events.push({ type: "shed", at: t, hue: s.hue });
    }
    if (!s.body.length) this.kill(s, "starved");
  }

  maybeSplit(s) {
    const n = s.body.length;
    if (n < this.p.minSplit) return;
    // rises with the square of length / maturity: half as long as maturity = a quarter the chance
    const r = n / s.genes.maturity;
    const chance = Math.min(0.5, this.p.splitRate * r * r);
    if (this.rand() >= chance) return;

    const h = Math.ceil(n / 2);
    const front = s.body.slice(0, h);
    const back = s.body.slice(h).reverse(); // old tail tip becomes the new head
    for (const i of back) this.occ[i] = 0;
    s.body = front;
    s.trail = [];
    const parentGenes = s.genes;
    s.genes = mutateGenes(parentGenes, this.p.mutation, this.rand);
    s.hue = geneHue(s.genes);
    s.drain = this.p.drainBase + this.p.drainBrain * brainSize(s.genes);
    s.generation++;

    const b0 = back[0], b1 = back[1];
    const dx = (b0 % this.cols) - (b1 % this.cols), dy = ((b0 / this.cols) | 0) - ((b1 / this.cols) | 0);
    const dir = dy === -1 ? 0 : dx === 1 ? 1 : dy === 1 ? 2 : 3;
    const child = this.addSnake(back, dir, mutateGenes(parentGenes, this.p.mutation, this.rand), s.energy, s.generation, s.founder);
    this.stats.births++;
    child.parent = s.id;
    this.tree.get(child.id).parent = s.id;
    this.tree.get(s.id).history.push({ step: this.step, genes: s.genes, hue: s.hue });
    this.events.push({ type: "split", at: front[front.length - 1], child: child.id, parent: s.id });
  }

  tick() {
    this.step++;
    // random order so no snake always gets first pick
    const order = this.snakes.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const s of order) if (s.alive) this.moveSnake(s);
    for (const s of order) if (s.alive) this.maybeSplit(s);
    this.snakes = this.snakes.filter((s) => s.alive);

    if (this.step % 250 === 0) this.pruneTree();

    this.foodDebt += (this.p.foodRate * this.cols * this.rows) / 1000;
    while (this.foodDebt >= 1) { this.foodDebt -= 1; this.spawnFood(); }
  }

  // Ancestors of the living, walking up from each living snake.
  livingAncestry() {
    const set = new Set();
    for (const s of this.snakes) {
      let id = s.id;
      while (id >= 0 && !set.has(id)) { set.add(id); id = this.tree.get(id)?.parent ?? -1; }
    }
    return set;
  }

  // Forget dead branches that left no living descendants once they're old enough.
  pruneTree() {
    const keep = this.livingAncestry(), cutoff = this.step - this.p.treeKeepDead;
    for (const [id, n] of this.tree) if (!keep.has(id) && n.died >= 0 && n.died < cutoff) this.tree.delete(id);
  }

  geneMeans() {
    const m = {};
    for (const { key } of GENES) m[key] = 0;
    if (!this.snakes.length) return m;
    for (const s of this.snakes) for (const { key } of GENES) m[key] += s.genes[key];
    for (const { key } of GENES) m[key] /= this.snakes.length;
    return m;
  }
}
