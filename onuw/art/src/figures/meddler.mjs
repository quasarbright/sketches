import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, rect, card, minicard } from "../brush.mjs";
// The meddler (the troublemaker): a jester juggling two players' cards, swapping them hand to hand.
const { card: bg, ink } = ROLE_COLORS.meddler;
const legs = [brush([[236, 420], [224, 500], [216, 580]], [38, 30, 24]), blob([[216, 572], [172, 568], [152, 548, "c"], [170, 584], [224, 592]]),
  brush([[276, 420], [290, 500], [298, 580]], [38, 30, 24]), blob([[294, 572], [338, 568], [358, 548, "c"], [340, 584], [292, 592]])];
const torso = blob([[214, 286], [256, 266], [298, 286], [306, 340], [300, 400], [292, 436], [220, 436], [212, 380], [206, 340]]);
const head = blob([[230, 214], [256, 204], [282, 214], [290, 240], [280, 264], [256, 272], [232, 264], [222, 240]]);
const hat = [brush([[236, 216], [206, 190], [176, 196], [164, 222]], [32, 24, 16, 6]), brush([[256, 208], [254, 166], [276, 140], [302, 144]], [30, 22, 14, 6]),
  brush([[276, 216], [306, 192], [336, 198], [346, 222]], [32, 24, 16, 6]), blob([[226, 222, "c"], [240, 202], [272, 202], [288, 222, "c"], [256, 230]])];
const bells = [[160, 230], [306, 142], [350, 230]].map(([x, y]) => `M${x} ${y}m-10 0a10 10 0 1 0 20 0a10 10 0 1 0 -20 0z`);
// both hands up, palms open, mid-toss
const arms = [brush([[218, 300], [180, 336], [168, 290]], [30, 24, 20]), blob([[154, 284], [160, 268], [180, 270], [182, 290], [166, 296]]),
  brush([[296, 300], [334, 336], [346, 290]], [30, 24, 20]), blob([[332, 290], [334, 270], [354, 268], [360, 284], [348, 296]])];
const cards = [[160, 176, -28], [354, 150, 24]];
// the juggling arcs: up from one hand, over the hat, down to the other
const arcs = [brush([[150, 258], [136, 232], [134, 214]], [2, 4, 1]), brush([[192, 140], [246, 100], [312, 108]], [2, 5, 1]),
  brush([[372, 186], [378, 230], [362, 262]], [1, 4, 2])];
const cuts = [
  brush([[238, 240], [250, 238]], [3, 3]), brush([[262, 238], [274, 240]], [3, 3]),   // eyes
  brush([[240, 252], [256, 260], [272, 252]], [3, 4, 3]),                             // grin
  brush([[224, 300], [256, 370], [290, 430]], [4, 5, 3]), brush([[290, 300], [256, 370], [222, 430]], [4, 5, 3]), // diamond pattern
];
export default card({ bg, ink, transform: "translate(15 20) scale(.94)", layers: [legs, { d: torso }, hat, bells, { d: head }, cuts.map((d) => ({ d, fill: "bg" })),
  { group: arms, halo: 4, roots: [[218, 300, 22], [296, 300, 22]] }, arcs,
  cards.map(([x, y, a]) => minicard(x, y, a, 1 / .94))] });
