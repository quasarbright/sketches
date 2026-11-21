import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, fringe, claws, eye, paw, card } from "../brush.mjs";
// The pack leader: a huge werewolf with its head thrown back, howling at the full moon, claws out at its sides.
// Drawn facing right, then mirrored so it faces left (the plain Werewolf faces right).
const { card: bg, ink } = ROLE_COLORS.packleader;
const moon = `M462 100m-30 0a30 30 0 1 0 60 0a30 30 0 1 0 -60 0z`;
const tailPath = [[244, 396], [202, 410], [172, 444], [160, 490], [170, 536]];
const tail = [brush(tailPath, [18, 42, 48, 30, 0]),
  ...fringe(tailPath, { n: 11, len: [16, 30], w: 13, side: 1, lean: .75, seed: 5, from: .15, to: .8 }),
  ...fringe(tailPath, { n: 11, len: [16, 30], w: 13, side: -1, lean: .75, seed: 6, from: .15, to: .8 })];
const leg = (dx, s = 1) => [brush([[276 + dx, 392], [318 + dx, 452], [266 + dx, 514], [288 + dx, 576]], [84 * s, 54 * s, 22, 18]), paw(294 + dx, 594, { s: 21 })];
const farArm = [brush([[254, 262], [222, 320], [204, 376], [196, 404]], [42, 32, 26, 22]), ...claws([192, 420], 105, { size: 1, spread: 80, curl: -14, len: 42 })];
const torso = blob([[236, 230], [298, 208], [344, 228], [362, 276], [352, 334], [324, 384], [292, 414], [256, 418], [234, 388], [222, 326], [222, 270]]);
const neck = brush([[294, 240], [314, 200], [326, 170]], [100, 84, 66]);
// a great bristling ruff from the back of the skull down over the shoulders
const ruff = [...fringe([[290, 166], [264, 200], [242, 244], [230, 300], [236, 350]], { n: 14, len: [22, 44], w: 20, side: 1, lean: .5, seed: 41 }),
  ...fringe([[350, 196], [362, 236], [366, 280]], { n: 6, len: [16, 30], w: 16, side: -1, lean: .55, seed: 42 })];
// head thrown back, jaws open: the upper jaw and skull, then the lower jaw, with a gap of sky between them
const head = blob([[292, 206], [280, 166], [290, 128], [316, 104], [348, 86], [380, 62], [402, 44], [414, 50], [414, 64], [406, 74], [392, 94], [372, 118], [352, 140], [338, 168], [328, 200]]);
const jaw = blob([[322, 196], [338, 170], [358, 150], [384, 128], [404, 114], [410, 120, "c"], [400, 138], [380, 162], [360, 190], [342, 212]]);
const ears = [blob([[296, 150, "c"], [268, 130], [250, 116, "c"], [288, 108], [316, 118]])];
const arm = [brush([[332, 256], [370, 306], [380, 360], [394, 396]], [48, 34, 26, 22]), ...claws([398, 412], 75, { size: 1.05, spread: 80, curl: 14, len: 44 })];
const cuts = [
  { d: eye(0, 0, { len: 24, h: 11 }), fill: "bg", transform: "translate(334 122) rotate(-40)" },
  ...[[396, 80, 38], [378, 102, 40], [392, 126, -142], [374, 144, -140]].map(([x, y, a]) => ({ d: blob([[-4, 0], [4, 0], [0, 12, "c"]]), fill: ink, transform: `translate(${x} ${y}) rotate(${a})` })), // fangs
  { d: brush([[296, 138], [282, 122]], [6, 0]), fill: "bg" },                                                         // inner ear
  ...[brush([[310, 276], [318, 320], [310, 364]], [4, 5, 1]), brush([[334, 280], [342, 316], [336, 352]], [3, 4, 1]),  // chest fur
    brush([[356, 98], [394, 66]], [3, 1])].map((d) => ({ d, fill: "bg" })),                                          // nose ridge
];
export default card({ bg, ink, transform: "translate(500 0) scale(-1 1) translate(50 61) scale(.84)", layers: [{ d: moon }, tail, { group: farArm }, leg(-46, .9), { d: torso }, ruff, { d: neck },
  ears, { d: head }, { d: jaw }, { group: leg(0), halo: 4, roots: [[270, 392, 44]] }, cuts,
  { group: arm, halo: 4, roots: [[330, 254, 34]] }] });
