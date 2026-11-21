import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, sparkle, rect, card } from "../brush.mjs";
// The card back, drawn like the role cards: one flat color, a full moon and a line of pines, a few stars.
const { card: bg, ink } = ROLE_COLORS.back;
const pines = [-1, 0, 1, 2, 3, 4, 5, 6].map((i) => { const x = 112 + i * 40, h = 70 + ((i * 37) % 3) * 22, y = 500;
  return blob([[x, y - h, "c"], [x + 12, y - h * .6], [x + 6, y - h * .6], [x + 20, y - h * .25], [x + 12, y - h * .25], [x + 26, y, "c"], [x - 26, y, "c"], [x - 12, y - h * .25], [x - 20, y - h * .25], [x - 6, y - h * .6], [x - 12, y - h * .6]]); });
export default card({ bg, ink, layers: [
  [[110, 170, 14], [390, 200, 18], [130, 580, 10], [380, 600, 12], [250, 120, 12]].map(([x, y, r]) => sparkle(x, y, r)),
  `M250 380m-130 0a130 130 0 1 0 260 0a130 130 0 1 0 -260 0z`,
  { group: [...pines, rect(250, 506, 330, 20, 0, 8)], fill: "bg", halo: 0 },
]});
