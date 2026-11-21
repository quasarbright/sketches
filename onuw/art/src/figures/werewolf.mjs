import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, fringe, claws, sparkle, eye, card } from "../brush.mjs";
// A werewolf risen on its hind legs: barrel chest, shaggy mane, a 
// one clawed hand raised. Facing right under a crescent moon.
const { card: bg, ink } = ROLE_COLORS.werewolf;
const moon = `M150 112a46 46 0 1 0 32 78a37 37 0 1 1 -32 -78z`;
const tailPath = [[238, 392], [196, 404], [166, 438], [154, 484], [164, 530]];
const tail = [brush(tailPath, [18, 40, 46, 30, 0]),
  ...fringe(tailPath, { n: 11, len: [16, 30], w: 13, side: 1, lean: .75, seed: 3, from: .15, to: .8 }),
  ...fringe(tailPath, { n: 11, len: [16, 30], w: 13, side: -1, lean: .75, seed: 4, from: .15, to: .8 })];
const cape = blob([[238, 230], [204, 260], [176, 312], [160, 372], [176, 360], [180, 392, "c"], [200, 366], [212, 396, "c"], [226, 360], [240, 380, "c"], [256, 300]]);
const leg = (dx, s = 1) => [brush([[276 + dx, 392], [314 + dx, 452], [262 + dx, 514], [286 + dx, 586]], [78 * s, 50 * s, 22, 18]),
  blob([[266 + dx, 578], [304 + dx, 578], [318 + dx, 594], [264 + dx, 600]]), ...[0, 9, 18].map((d) => brush([[300 + dx + d / 2, 590], [314 + dx + d / 2, 600]], [7, 0]))];
const farArm = [brush([[262, 262], [240, 330], [226, 384]], [36, 28, 22]), ...claws([222, 400], 100, { size: .9, spread: 70, curl: 14, len: 38 })];
const torso = blob([[244, 226], [300, 220], [332, 250], [340, 300], [330, 356], [306, 398], [266, 414], [238, 396], [230, 340], [230, 280]]);
const mane = [...fringe([[244, 250], [232, 300], [232, 350], [244, 392]], { n: 8, len: [14, 26], w: 14, side: 1, lean: .6, seed: 14 }),
  ...fringe([[256, 164], [240, 206], [236, 250], [246, 290]], { n: 10, len: [18, 36], w: 18, side: 1, lean: .45, seed: 12 }),
  ...fringe([[322, 230], [338, 270], [334, 320]], { n: 6, len: [14, 26], w: 16, side: -1, lean: .6, seed: 13 })];
const head = blob([[244, 190], [250, 160], [272, 144], [300, 150], [320, 164], [350, 176], [384, 186, "c"], [382, 204], [352, 216], [324, 220], [300, 234], [268, 234], [250, 216]]);
const ears = [blob([[248, 166, "c"], [246, 130], [254, 116, "c"], [276, 136], [286, 152]]), blob([[268, 154, "c"], [276, 126], [290, 112, "c"], [304, 136], [310, 162]])];
const arm = [brush([[316, 254], [338, 312], [370, 296], [388, 270]], [42, 32, 26, 22]), ...claws([396, 258], -60, { size: 1.05, spread: 80, curl: 16, len: 40 })];
const cuts = [
  eye(328, 182, { len: 20, h: 9, angle: 18 }), brush([[306, 170], [328, 172], [346, 180]], [3, 5, 1]),   // eye and brow
  brush([[338, 198], [362, 197], [376, 194]], [3, 4, 2]),                                                 // mouth
  brush([[256, 148], [256, 126]], [6, 0]), brush([[288, 146], [292, 122]], [7, 0]),                       // inner ears
  brush([[286, 262], [290, 300], [282, 340]], [4, 5, 1]), brush([[306, 270], [314, 310], [306, 350]], [3, 4, 1]),   // chest fur
];
export default card({ bg, ink, transform: "translate(-14 26)", layers: [{ d: moon }, sparkle(96, 236, 12), sparkle(430, 140, 16), sparkle(432, 400, 10),
  tail, { group: farArm }, leg(-40, .9), { d: torso }, mane, ears, { d: head }, { group: leg(0), halo: 4, roots: [[272, 390, 40]] },
  cuts.map((d) => ({ d, fill: "bg" })), { group: arm, halo: 4, roots: [[314, 252, 30]] }] });
