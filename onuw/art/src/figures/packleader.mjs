import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, fringe, claws, eye, pupil, paw, card } from "../brush.mjs";
// The pack leader: a huge hunched werewolf, shoulders bunched, head low and thrust forward in a snarl,
// long arms hanging with the claws spread. Drawn facing right, then mirrored so it faces left.
const { card: bg, ink } = ROLE_COLORS.packleader;
const tailPath = [[200, 392], [160, 410], [128, 444], [112, 486], [116, 528]];
const tail = [brush(tailPath, [18, 40, 46, 30, 0]),
  ...fringe(tailPath, { n: 11, len: [16, 28], w: 13, side: 1, lean: .75, seed: 5, from: .15, to: .8 }),
  ...fringe(tailPath, { n: 11, len: [16, 28], w: 13, side: -1, lean: .75, seed: 6, from: .15, to: .8 })];
const leg = (dx, s = 1) => [brush([[226 + dx, 392], [278 + dx, 458], [222 + dx, 520], [236 + dx, 580]], [96 * s, 58 * s, 24, 19]), paw(242 + dx, 596, { s: 21 })];
// a massive hunched back rising to a hump of muscle over the shoulders
const torso = blob([[196, 360], [214, 300], [250, 248], [300, 220], [352, 226], [392, 262], [400, 312], [376, 352], [336, 386], [280, 412], [226, 416], [200, 396]]);
const hackles = fringe([[218, 300], [252, 254], [300, 222], [348, 222], [384, 246]], { n: 15, len: [20, 40], w: 20, side: -1, lean: .55, seed: 41 });
const chest = fringe([[396, 300], [380, 344], [350, 378]], { n: 6, len: [14, 26], w: 16, side: -1, lean: .5, seed: 43 });
// the head low and forward, ears pinned back, jaws parted in a snarl
const head = blob([[356, 252], [372, 224], [400, 212], [428, 222], [452, 236], [482, 250, "c"], [478, 264], [452, 266], [428, 270], [404, 286], [376, 290], [358, 276]]);
const jaw = blob([[396, 284], [424, 278], [452, 280], [470, 284, "c"], [456, 296], [428, 304], [404, 304]]);
const ears = [blob([[378, 230, "c"], [352, 212], [336, 204, "c"], [366, 198], [394, 214]])];
const farArm = [brush([[300, 268], [276, 340], [272, 410], [282, 450]], [48, 36, 28, 22]), ...claws([284, 466], 95, { size: 1, spread: 80, curl: -12, len: 40 })];
const arm = [brush([[360, 290], [392, 360], [404, 420], [416, 460]], [56, 40, 30, 24]), ...claws([420, 476], 80, { size: 1.15, spread: 84, curl: 14, len: 46 })];
const cuts = [
  eye(420, 238, { len: 27, h: 10 }),                                            // scowling eye
  brush([[386, 222], [410, 226], [434, 236]], [3, 4, 1]),                        // heavy brow ridge
  brush([[448, 244], [468, 250]], [3, 1]),                                       // snout wrinkle
  brush([[362, 210], [348, 206]], [6, 0]),                                       // inner ear
  brush([[292, 300], [300, 350], [290, 392]], [4, 5, 1]), brush([[338, 300], [346, 340], [334, 374]], [3, 4, 1]),  // muscle lines
  brush([[380, 296], [386, 336]], [3, 1]),
];
// fangs in the gap between the jaws
const fangs = [[440, 268, 0], [458, 266, 0], [430, 284, 180], [448, 284, 180]].map(([x, y, a]) => ({ d: blob([[-4, 0], [4, 0], [0, 13, "c"]]), transform: `translate(${x} ${y}) rotate(${a})` }));
export default card({ bg, ink, transform: "translate(13 0) translate(500 0) scale(-1 1) translate(-26 -16)", layers: [tail, { group: farArm }, leg(-56, .9), { d: torso }, hackles, chest, ears,
  { d: jaw }, { d: head }, fangs, { group: leg(0), halo: 4, roots: [[230, 396, 62], [262, 440, 40]] }, cuts.map((d) => ({ d, fill: "bg" })),
  { group: arm, halo: 4, roots: [[360, 290, 38]] }, { d: pupil(420, 238, { len: 27, h: 10 }) }] });
