import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, rect, sparkle, boot, card, minicard } from "../brush.mjs";
// The unveiler: a villager flipping a big card face up with a flourish, the card mid-turn in the air above
// his hand and its face showing. Facing right.
const { card: bg, ink } = ROLE_COLORS.unveiler;
const legs = [brush([[236, 470], [226, 530], [218, 586]], [32, 28, 24]), boot(218, 598, { s: 22 }), brush([[270, 470], [286, 530], [296, 586]], [32, 28, 24]), boot(298, 598, { s: 22 })];
const tunic = blob([[214, 276], [262, 264], [294, 292], [302, 380], [312, 470], [322, 498, "c"], [288, 492], [256, 502], [222, 492], [188, 500, "c"], [196, 430], [200, 350]]);
const neck = brush([[258, 236], [260, 266]], [24, 28]);
const head = blob([[232, 208], [246, 188], [272, 182], [292, 196], [298, 216], [310, 230, "c"], [298, 234], [300, 246], [294, 252], [294, 262], [278, 270], [254, 266], [238, 250]]);
const hair = blob([[228, 222], [232, 192], [256, 176], [284, 178], [296, 194], [270, 196], [254, 212], [250, 240], [236, 244]]);
// near arm flung up and out, palm open, having just tossed the card
const arm = [brush([[284, 290], [330, 280], [362, 236]], [28, 22, 18]), blob([[352, 222], [374, 214], [382, 234], [360, 244]])];
const flip = [brush([[336, 196], [344, 150], [366, 110]], [2, 4, 1]), brush([[440, 196], [454, 160], [446, 120]], [2, 4, 1])];
const cuts = [
  brush([[282, 214], [294, 214]], [4, 3]),                                     // eye, wide
  brush([[286, 254], [296, 256]], [3, 2]),                                     // mouth open in "ta-da"
  brush([[240, 340], [232, 420], [222, 492]], [3, 5, 2]), brush([[278, 340], [288, 420], [294, 492]], [3, 5, 2]),
  brush([[204, 400], [306, 396]], [5, 5]),
];
export default card({ bg, ink, transform: "translate(-30 6)", layers: [sparkle(120, 170, 12), sparkle(120, 400, 9), flip, legs, { d: tunic }, neck, { d: head }, { d: hair }, cuts.map((d) => ({ d, fill: "bg" })),
  { group: arm, halo: 4, roots: [[284, 290, 22]] }, minicard(394, 150, 24)] });
