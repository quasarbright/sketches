// Mike's 2048 AI, ported from minimax.py + aiGame.py (quasarbright/2048).
//
// Despite the name there is no opponent and no chance node: spawns come from the seed, so
// the game is deterministic and the search is a plain depth-limited max over moves.
//   value(game, 0) = score(game)
//   value(game, d) = max over all four directions of value(game after that move, d - 1)
// "All four" includes moves that don't change the board (Python: getAllMoves), which leave the
// game as it is, so standing still is always an option inside the search. At the root only
// legal moves are tried (Python: getLegalMoves), in shuffled order, and the first best wins:
//   chooseAction(game, maxDepth) = argmax over legal a of value(game after a, maxDepth)
// so the search looks maxDepth + 1 moves ahead. main.py uses depth 5.
//
// The memo is keyed on (board, depth), like the Python's (AIGame, depth): AIGame hashes and
// compares by board only, not by seed. Kept as is.

import { DIRECTIONS, move, legalMoves, score } from "./game.mjs";

export const DEFAULT_DEPTH = 5; // Python: main.py, depth = 5

function shuffled(arr, random) {
  // Python: random.shuffle (Fisher-Yates from the end)
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Returns { move, values: { UP: v, ... } for each legal move, nodes }.
// opts.shuffle (default true) breaks ties randomly like the Python; false keeps
// UP, DOWN, LEFT, RIGHT order, which the tests use to replay the Python move for move.
export function chooseAction(game, maxDepth = DEFAULT_DEPTH, opts = {}) {
  const { shuffle = true, random = Math.random } = opts;
  const memo = new Map();
  let nodes = 0;
  function value(g, depth) {
    const key = g.board.join(",") + "|" + depth;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    nodes++;
    let ans;
    if (depth === 0) ans = score(g.board);
    else {
      ans = -Infinity;
      for (const d of DIRECTIONS) {
        const v = value(move(g, d), depth - 1);
        if (v > ans) ans = v; // Python: max([...])
      }
    }
    memo.set(key, ans);
    return ans;
  }
  let actions = legalMoves(game);
  if (!actions.length) return { move: null, values: {}, nodes };
  if (shuffle) actions = shuffled(actions, random);
  const values = {};
  let best = null, bestV = -Infinity;
  for (const a of actions) {
    const v = value(move(game, a), maxDepth);
    values[a] = v;
    if (best === null || v > bestV) { best = a; bestV = v; } // Python: max(actions, key=...) keeps the first best
  }
  return { move: best, values, nodes };
}
