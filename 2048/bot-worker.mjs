// Runs Mike's search off the main thread, so the page never stalls while the bot thinks.
import { chooseAction } from "./minimax.mjs";

self.onmessage = (e) => {
  const { id, board, seed, depth } = e.data;
  const t0 = performance.now();
  const r = chooseAction({ board, seed }, depth);
  self.postMessage({ id, board, seed, depth, move: r.move, values: r.values, nodes: r.nodes, ms: performance.now() - t0 });
};
