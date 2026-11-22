import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, rect, sparkle, eye, card } from "../brush.mjs";
// The copycat: a cat sitting upright, tail curled round its feet, one paw resting on a card it has slid out
// of the center to copy. Facing right.
const { card: bg, ink } = ROLE_COLORS.copycat;
const body = blob([[196, 560], [192, 470], [206, 390], [236, 330], [276, 312], [310, 330], [326, 390], [334, 470], [340, 560]]);
const head = blob([[236, 300], [244, 254], [272, 232], [306, 236], [330, 258], [336, 290], [322, 318], [292, 330], [256, 326]]);
const ears = [blob([[244, 262, "c"], [240, 210, "c"], [276, 238]]), blob([[296, 236], [324, 204, "c"], [330, 262, "c"]])];
const tailPath = [[206, 540], [150, 560], [130, 596], [190, 610], [300, 604], [360, 592]];
const tail = brush(tailPath, [30, 26, 22, 20, 16, 6]);
const foreleg = [brush([[312, 420], [334, 500], [352, 548]], [30, 24, 20]), blob([[340, 540], [372, 536], [380, 556], [344, 560]])];
const cardShape = rect(394, 560, 84, 56, -6, 6);
const cuts = [
  eye(298, 276, { len: 26, h: 12, a: -6 }),                                     // almond cat eye
  brush([[318, 300], [326, 304], [334, 300]], [2, 3, 1]),                       // mouth
  brush([[326, 296], [360, 288]], [2, 0]), brush([[326, 302], [362, 304]], [2, 0]),   // whiskers
  brush([[250, 238], [252, 226]], [6, 0]), brush([[318, 232], [322, 220]], [6, 0]),   // inner ears
  brush([[300, 400], [316, 470], [322, 540]], [3, 5, 2]),                       // chest line
];
// slit pupil, drawn back in ink over the eye cut
const slit = blob([[300, 267, "c"], [303, 276], [300, 285, "c"], [297, 276]]);
const cardFace = rect(394, 560, 66, 40, -6, 4);
export default card({ bg, ink, transform: "translate(-20 -40)", layers: [sparkle(120, 200, 12), sparkle(420, 330, 10), { d: body }, { d: head }, ears, tail, cuts.map((d) => ({ d, fill: "bg" })), { d: slit },
  { group: [cardShape], halo: 4 }, { d: cardFace, fill: "bg" }, blob([[394, 548], [402, 560], [394, 572], [386, 560]]), { group: foreleg, halo: 4, roots: [[312, 420, 22]] }] });
