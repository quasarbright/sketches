import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, rect, sparkle, card, minicard } from "../brush.mjs";
// The imp: a small grinning creature with long pointed ears, crouched on its haunches and holding a card in
// each hand, caught in the act of swapping them. Arcs show the cards changing hands. Facing right.
const { card: bg, ink } = ROLE_COLORS.imp;
const body = blob([[196, 470], [206, 410], [236, 370], [280, 360], [318, 380], [332, 430], [326, 480], [300, 520], [240, 526], [204, 510]]);
const legs = [brush([[230, 500], [196, 540], [214, 574]], [40, 26, 18]), blob([[196, 566], [236, 562], [244, 580], [192, 584]]),
  brush([[300, 500], [338, 538], [322, 574]], [40, 26, 18]), blob([[306, 566], [348, 562], [356, 580], [302, 584]])];
const tail = brush([[200, 490], [150, 500], [130, 540], [150, 566]], [16, 10, 6, 2]);
const tailTip = blob([[150, 556], [164, 572], [146, 586, "c"], [136, 566]]);
const head = blob([[226, 330], [236, 290], [268, 270], [304, 276], [326, 300], [330, 334], [314, 360], [276, 370], [240, 360]]);
const ears = [blob([[236, 306], [150, 260, "c"], [242, 290]]), blob([[312, 290], [384, 236, "c"], [320, 312]])];
const nose = blob([[322, 312], [346, 326, "c"], [324, 334]]);
// arms out to both sides, a card in each hand
const armL = [brush([[236, 400], [190, 380], [160, 340]], [22, 18, 14]), blob([[146, 330], [166, 324], [172, 342], [152, 348]])];
const armR = [brush([[306, 400], [356, 384], [384, 346]], [22, 18, 14]), blob([[376, 334], [396, 328], [402, 346], [382, 352]])];
const arcs = [brush([[180, 250], [270, 206], [366, 246]], [2, 4, 2]), blob([[358, 236], [376, 250, "c"], [354, 256]]),
  brush([[364, 400], [274, 440], [184, 398]], [2, 4, 2]), blob([[192, 390], [174, 396, "c"], [194, 410]])];
const cuts = [
  blob([[278, 300], [298, 296], [292, 310]]), blob([[302, 302], [316, 298], [312, 310]]),     // narrowed eyes
  brush([[270, 338], [294, 350], [322, 342]], [2, 4, 1]),                                     // wide grin
  ...[[282, 344], [298, 348], [312, 346]].map(([x, y]) => blob([[x - 3, y - 2], [x + 3, y - 2], [x, y + 5, "c"]])),   // teeth
  brush([[260, 420], [270, 470]], [3, 1]),
];
export default card({ bg, ink, transform: "translate(-24 -30)", layers: [arcs, tail, tailTip, legs, { d: body }, ears, { d: head }, { d: nose }, cuts.map((d) => ({ d, fill: "bg" })),
  { group: [...armL, ...armR], halo: 3, roots: [[236, 400, 16], [306, 400, 16]] }, minicard(150, 300, -18), minicard(398, 298, 16)] });
