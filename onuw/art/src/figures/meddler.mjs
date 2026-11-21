import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, rect, boot, card } from "../brush.mjs";
// The meddler: a hooded trickster creeping on tiptoe, hunched forward, sliding one card out from behind
// its back while the other hand slips a second card forward.
const { card: bg, ink } = ROLE_COLORS.meddler;
const backLeg = [brush([[232, 430], [204, 500], [170, 560]], [40, 32, 24]), boot(164, 578, { s: 24 })];
const frontLeg = [brush([[262, 430], [316, 486], [300, 556]], [42, 32, 24]), boot(306, 578, { s: 24 })];
// a long cloak, hunched over the shoulders
const cloak = blob([[214, 262], [262, 236], [312, 252], [330, 300], [326, 380], [306, 450, "c"], [270, 440], [236, 452], [194, 450, "c"], [196, 380], [198, 310]]);
const hood = blob([[262, 210], [280, 176], [314, 164], [346, 180], [358, 210], [356, 248], [330, 272], [292, 276], [262, 256]]);
const hoodTail = brush([[276, 190], [236, 178], [200, 196], [178, 228]], [40, 28, 16, 4]);
const face = blob([[326, 214], [346, 206], [356, 222], [366, 232, "c"], [354, 236], [352, 252], [334, 262]]);
// hand behind the back with a card; hand forward with a card, held low
const backArm = [brush([[232, 300], [196, 340], [168, 352]], [30, 24, 20]), blob([[150, 340], [170, 336], [176, 356], [156, 362]])];
const foreArm = [brush([[306, 296], [346, 330], [384, 346]], [30, 24, 20]), blob([[378, 334], [400, 332], [406, 352], [384, 358]])];
const cards = [[148, 330, -30], [404, 322, 22]];
const cuts = [
  brush([[338, 222], [352, 226]], [4, 3]),                                     // narrowed eye
  brush([[342, 246], [354, 244]], [3, 2]),                                     // smirk
  brush([[292, 232], [310, 270], [322, 276]], [4, 4, 2]),                      // hood opening
  brush([[236, 300], [226, 380], [228, 446]], [3, 5, 1]), brush([[300, 300], [312, 380], [304, 444]], [3, 5, 1]), // cloak folds
];
export default card({ bg, ink, transform: "translate(-25 0) translate(0 26)", layers: [
  { group: backArm }, cards.slice(0, 1).map(([x, y, a]) => [{ d: rect(x, y, 46, 66, a, 7), halo: 4 }, { d: rect(x, y, 34, 54, a, 5), fill: "bg" }, { d: rect(x, y, 28, 48, a, 4) }]),
  backLeg, { group: frontLeg, halo: 4, roots: [[262, 430, 30]] }, hoodTail, { d: cloak }, { d: hood }, { d: face }, cuts.map((d) => ({ d, fill: "bg" })),
  { group: foreArm, halo: 4, roots: [[306, 296, 22]] },
  cards.slice(1).map(([x, y, a]) => [{ d: rect(x, y, 46, 66, a, 7), halo: 4 }, { d: rect(x, y, 34, 54, a, 5), fill: "bg" }, { d: rect(x, y, 28, 48, a, 4) }]),
] });
