import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, fringe, sparkle, card } from "../brush.mjs";
// The night owl: a big-eyed owl on a gnarled branch, up all night under the moon and exhausted: heavy drooping lids, bags under the eyes.
const { card: bg, ink } = ROLE_COLORS.nightowl;
const moon = `M368 128a54 54 0 1 0 38 92a44 44 0 1 1 -38 -92z`;
const branch = [brush([[40, 470], [160, 452], [280, 462], [400, 446], [470, 420]], [30, 28, 26, 22, 12]), brush([[330, 456], [380, 500], [410, 540]], [18, 12, 4]), brush([[120, 458], [96, 420], [84, 392]], [14, 8, 2])];
const leaves = [[84, 392, -30], [410, 540, 60], [470, 420, 0]].map(([x, y, a]) => blob([[x, y], [x + 22 * Math.cos((a - 30) * Math.PI / 180), y + 22 * Math.sin((a - 30) * Math.PI / 180)], [x + 40 * Math.cos(a * Math.PI / 180), y + 40 * Math.sin(a * Math.PI / 180), "c"], [x + 22 * Math.cos((a + 30) * Math.PI / 180), y + 22 * Math.sin((a + 30) * Math.PI / 180)]]));
const body = blob([[200, 250], [250, 226], [302, 250], [324, 320], [320, 400], [296, 452], [250, 466], [206, 452], [182, 400], [180, 320]]);
const wing = blob([[300, 270], [330, 300], [340, 380], [330, 450], [312, 486, "c"], [300, 420], [292, 340]]);
const tail = blob([[226, 452], [276, 452], [270, 500, "c"], [250, 488], [232, 502, "c"]]);
const head = blob([[184, 182], [206, 160], [250, 150], [294, 160], [316, 182], [320, 230], [300, 262], [250, 274], [200, 262], [180, 230]]);
const tufts = [blob([[192, 172], [176, 122, "c"], [218, 160]]), blob([[308, 172], [324, 122, "c"], [282, 160]])];
const talons = [[230, 462], [270, 462]].map(([x, y]) => [-14, 0, 14].map((d) => brush([[x, y - 8], [x + d, y + 6], [x + d * 1.2, y + 18]], [9, 7, 0]))).flat();
const breast = fringe([[220, 300], [250, 310], [282, 300]], { n: 0 });
const cuts = [
  `M226 214m-26 0a26 26 0 1 0 52 0a26 26 0 1 0 -52 0z`, `M276 214m-26 0a26 26 0 1 0 52 0a26 26 0 1 0 -52 0z`,   // eye whites
  brush([[206, 250], [226, 258], [244, 250]], [3, 4, 2]), brush([[258, 250], [276, 258], [296, 250]], [2, 4, 3]),   // bags
  blob([[244, 236], [258, 236], [251, 256, "c"]]),
  ...[[226, 320], [262, 330], [216, 360], [252, 370], [288, 360], [236, 404], [272, 404]].map(([x, y]) => brush([[x - 12, y - 4], [x, y + 4], [x + 12, y - 4]], [3, 4, 3])), // chest feathers
  brush([[304, 300], [316, 380], [312, 450]], [3, 4, 1]),
];
export default card({ bg, ink, transform: "translate(0 10)", layers: [{ d: moon }, sparkle(110, 140, 16), sparkle(150, 230, 9), sparkle(430, 300, 11), branch, leaves, { d: tail }, { d: body }, { d: wing }, tufts, { d: head },
  { group: talons }, cuts.map((d) => ({ d, fill: "bg" })), { d: `M226 228m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0zM276 228m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0z` }, { d: `M199 224A27 27 0 1 1 253 217ZM249 217A27 27 0 1 1 303 224Z` }] });
