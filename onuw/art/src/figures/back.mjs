import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, fringe, sparkle, rect, card } from "../brush.mjs";
// The card back: a full moon with a howling wolf against it, inside a double frame with stars.
const { card: bg, ink } = ROLE_COLORS.back;
const moonC = "#d9cfa6";
const wolf = [
  blob([[214, 460], [222, 400], [236, 360], [248, 330], [256, 300], [262, 270], [274, 246, "c"], [282, 262], [292, 250, "c"], [296, 272], [306, 290], [318, 300, "c"], [306, 310], [296, 330], [300, 370], [312, 420], [320, 460]]),
];
const muzzle0 = blob([[262, 270], [268, 240], [276, 226, "c"], [282, 248], [262, 280]]);
const rock0 = blob([[110, 474], [190, 462], [250, 466], [330, 460], [400, 480], [404, 540], [96, 540]]);
export default card({ bg, ink, layers: [
  { d: rect(250, 350, 452, 652, 0, 26), fill: ink }, { d: rect(250, 350, 440, 640, 0, 22), fill: "bg" },
  { d: rect(250, 350, 412, 612, 0, 16), fill: ink }, { d: rect(250, 350, 404, 604, 0, 14), fill: "bg" },
  ...[[70, 70], [430, 70], [70, 630], [430, 630]].map(([x, y]) => ({ d: sparkle(x, y, 22), fill: moonC })),
  [[110, 170, 10], [390, 200, 14], [130, 560, 9], [380, 590, 11], [250, 110, 12]].map(([x, y, r]) => ({ d: sparkle(x, y, r), fill: moonC })),
  { d: `M250 380m-130 0a130 130 0 1 0 260 0a130 130 0 1 0 -260 0z`, fill: moonC },
  { d: `M210 330m-18 0a18 18 0 1 0 36 0a18 18 0 1 0 -36 0zM300 430m-26 0a26 26 0 1 0 52 0a26 26 0 1 0 -52 0zM310 300m-10 0a10 10 0 1 0 20 0a10 10 0 1 0 -20 0z`, fill: "#c4b98d" },
  // a line of pine tops across the bottom of the moon
  { group: [...[-1, 0, 1, 2, 3, 4, 5, 6].map((i) => { const x = 112 + i * 40, h = 70 + ((i * 37) % 3) * 22, y = 500;
    return blob([[x, y - h, "c"], [x + 12, y - h * .6], [x + 6, y - h * .6], [x + 20, y - h * .25], [x + 12, y - h * .25], [x + 26, y, "c"], [x - 26, y, "c"], [x - 12, y - h * .25], [x - 20, y - h * .25], [x - 6, y - h * .6], [x - 12, y - h * .6]]); }),
    rect(250, 506, 330, 20, 0, 8)], fill: "#10173a" },
]});
