import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, fringe, claws, eye, brow, paw, card } from "../brush.mjs";
// The pack leader: the Werewolf card's figure, bulked up, head thrown back in a howl, claws spread at its sides.
// Drawn facing right like the Werewolf, then mirrored so it faces left.
const { card: bg, ink } = ROLE_COLORS.packleader;
const tailPath = [[238, 392], [196, 404], [166, 438], [154, 484], [164, 530]];
const tail = [brush(tailPath, [18, 42, 50, 32, 0]),
  ...fringe(tailPath, { n: 11, len: [16, 30], w: 13, side: 1, lean: .75, seed: 3, from: .15, to: .8 }),
  ...fringe(tailPath, { n: 11, len: [16, 30], w: 13, side: -1, lean: .75, seed: 4, from: .15, to: .8 })];
const leg = (dx, s = 1) => [brush([[276 + dx, 392], [318 + dx, 452], [264 + dx, 514], [286 + dx, 580]], [92 * s, 58 * s, 24, 20]), paw(292 + dx, 596, { s: 21 })];
const farArm = [brush([[258, 262], [234, 330], [222, 384], [216, 410]], [46, 36, 28, 24]), ...claws([214, 426], 100, { size: 1, spread: 74, curl: -14, len: 40 })];
// a broad barrel chest and heavy shoulders
const torso = blob([[230, 228], [298, 210], [344, 238], [356, 296], [344, 356], [314, 400], [266, 418], [232, 398], [222, 340], [220, 280]]);
const mane = [...fringe([[236, 250], [222, 300], [224, 350], [238, 392]], { n: 8, len: [14, 28], w: 15, side: 1, lean: .6, seed: 14 }),
  ...fringe([[262, 166], [238, 206], [228, 250], [236, 292]], { n: 10, len: [18, 38], w: 19, side: 1, lean: .45, seed: 12 }),
  ...fringe([[336, 232], [354, 272], [350, 324]], { n: 6, len: [14, 28], w: 17, side: -1, lean: .6, seed: 13 })];
const neck = brush([[290, 250], [294, 220], [296, 200]], [80, 62, 50]);
// the Werewolf's head, tipped back 42 degrees about the neck so the muzzle points at the sky
// a wolf's head, not a bird's: flat skull with a brow bump, a long thick muzzle ending in a blunt nose,
// and the lower jaw dropped open in a howl
const head = blob([[246, 196], [252, 166], [272, 152], [302, 150], [320, 160], [334, 172], [372, 174], [390, 174], [398, 180], [400, 190, "c"], [392, 196],
  [372, 198], [352, 204], [372, 210], [388, 212, "c"], [386, 222], [362, 228], [336, 230], [304, 240], [268, 236], [250, 220]]);
const ears = [];
// one ear laid back along the skull, tip up (drawn untilted, at the back of the tipped-back head)
const ear = blob([[230, 200, "c"], [206, 166], [200, 136, "c"], [230, 154], [254, 184]]);
const headCuts = [
  eye(318, 180, { len: 22, h: 6 }),                                            // eyes squeezed narrow mid-howl
  brush([[300, 168], [318, 170], [334, 178]], [2, 4, 1]),                       // heavy brow
  brush([[344, 178], [350, 184]], [3, 1]), brush([[354, 178], [360, 184]], [3, 1]), brush([[364, 178], [370, 184]], [3, 1]), // snarl wrinkles on the muzzle
];
// fangs bared in the open jaws
const fangs = [[384, 196, 10], [368, 198, 9], [380, 210, -8]].map(([x, y, l]) => blob([[x - 3.5, y], [x + 3.5, y], [x, y + l, "c"]]));
const tilt = "rotate(-40 290 214) translate(290 214) scale(1.22) translate(-290 -214)";
const arm = [brush([[318, 256], [344, 320], [352, 380], [360, 410]], [54, 42, 32, 26]), ...claws([364, 426], 80, { size: 1.12, spread: 80, curl: 14, len: 44 })];
const cuts = [
  brush([[284, 268], [290, 306], [282, 346]], [4, 5, 1]), brush([[310, 274], [318, 314], [310, 354]], [3, 4, 1]),   // chest fur
];
export default card({ bg, ink, transform: "translate(500 0) scale(-1 1) translate(-12 -16)", layers: [tail, { group: farArm }, leg(-42, .92), { d: torso }, mane, { d: neck }, { d: ear },
  { group: [...ears, head, ...fangs], transform: tilt }, { group: leg(0), halo: 4, roots: [[272, 392, 46]] },
  cuts.map((d) => ({ d, fill: "bg" })), headCuts.map((d) => ({ d, fill: "bg", transform: tilt })),
  { group: arm, halo: 4, roots: [[318, 256, 34]] }] });
