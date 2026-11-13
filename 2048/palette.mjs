// Tile colors, shared by the board and the about-modal diagrams: a spectrum that climbs as
// tiles double. [background, numeral]
export const TILE = {
  2: ["#3b3470", "#dcd6ff"], 4: ["#4b3f98", "#ece8ff"], 8: ["#3266dc", "#ffffff"],
  16: ["#1d9fd0", "#ffffff"], 32: ["#16bfa4", "#06241f"], 64: ["#7fd44a", "#132608"],
  128: ["#ffd23f", "#3a2600"], 256: ["#ff9f2e", "#3a1600"], 512: ["#ff5b5b", "#ffffff"],
  1024: ["#ff3d9a", "#ffffff"], 2048: ["#b04dff", "#ffffff"], 4096: ["#fff6dc", "#4a1f8a"],
  // past 4096 each tile is drawn by its tier in tiles.css; these are its glow and spark colors
  8192: ["#c79bff", "#3a1670"], 16384: ["#ff6a1f", "#fff8e0"], 32768: ["#39ff9e", "#f2fff6"],
  65536: ["#9fd0ff", "#ffffff"],
};
const BEYOND = ["#8a7dff", "#ffffff"]; // 131072, the largest possible
export const tileColors = (v) => TILE[v] || BEYOND;
export const tileColor = (v) => tileColors(v)[0];
// font size for a numeral, as a fraction of the tile's width
export const numeralScale = (v) => [0, 0.46, 0.46, 0.37, 0.29, 0.235, 0.2][String(v).length] || 0.17;

// the special tiles past 4096, each with its own look in tiles.css
const TIERS = { 8192: "foil", 16384: "molten", 32768: "aurora", 65536: "constellation" };
export const tier = (v) => (v <= 4096 ? null : TIERS[v] || "galaxy");

// style a tile face (a .g-face from tiles.css) for value v at a cell width in px
export function paintFace(face, v, cell) {
  const [bg, fg] = tileColors(v);
  face.textContent = v;
  face.style.setProperty("--tbg", bg);
  face.style.setProperty("--tfg", fg);
  face.style.setProperty("--cell", cell + "px");
  face.style.setProperty("--fs", (cell * numeralScale(v)).toFixed(1) + "px");
  const lv = Math.log2(v);
  face.style.setProperty("--tglow", lv >= 7 ? bg : "transparent");
  face.style.setProperty("--glowR", lv >= 7 ? Math.min(40, (lv - 6) * 5) + "px" : "0px");
  const t = tier(v);
  if (t) face.dataset.tier = t; else delete face.dataset.tier;
  // the constellation tile's layers (textContent above already cleared any old ones)
  if (t === "constellation") for (const k of ["lines", "stars", "meteor"]) {
    const fx = document.createElement("i");
    fx.className = "g-fx"; fx.dataset.fx = k; fx.setAttribute("aria-hidden", "true");
    face.append(fx);
  }
}
