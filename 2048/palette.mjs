// Tile colors, shared by the board and the about-modal diagrams: a spectrum that climbs as
// tiles double. [background, numeral]
export const TILE = {
  2: ["#3b3470", "#dcd6ff"], 4: ["#4b3f98", "#ece8ff"], 8: ["#3266dc", "#ffffff"],
  16: ["#1d9fd0", "#ffffff"], 32: ["#16bfa4", "#06241f"], 64: ["#7fd44a", "#132608"],
  128: ["#ffd23f", "#3a2600"], 256: ["#ff9f2e", "#3a1600"], 512: ["#ff5b5b", "#ffffff"],
  1024: ["#ff3d9a", "#ffffff"], 2048: ["#b04dff", "#ffffff"], 4096: ["#fff6dc", "#4a1f8a"],
};
const BEYOND = ["#fff6dc", "#3a1670"];
export const tileColors = (v) => TILE[v] || BEYOND;
export const tileColor = (v) => tileColors(v)[0];
// font size for a numeral, as a fraction of the tile's width
export const numeralScale = (v) => [0, 0.46, 0.46, 0.37, 0.29, 0.235, 0.2][String(v).length] || 0.17;
