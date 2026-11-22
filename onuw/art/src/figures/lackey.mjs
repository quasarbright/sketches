import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, fringe, card } from "../brush.mjs";
// The lackey: a hunched servant in a long coat, bowing low and holding a lantern up for the wolves.
const { card: bg, ink } = ROLE_COLORS.lackey;
const coat = blob([[206, 262], [262, 228], [318, 244], [376, 310], [374, 410], [368, 500], [366, 590, "c"], [326, 582], [300, 594], [262, 584], [226, 594], [196, 586, "c"], [200, 500], [192, 420], [186, 330]]);
// a big rounded hump rising above the head, so the head hangs forward below the shoulders
const hump = blob([[220, 240], [238, 198], [280, 166], [328, 168], [364, 204], [376, 262], [376, 330], [366, 400], [320, 360], [240, 290]]);
const legs = [brush([[238, 560], [232, 600]], [30, 28]), brush([[300, 560], [310, 600]], [30, 28]),
  blob([[200, 592], [244, 590], [250, 608], [196, 610]]), blob([[300, 592], [344, 590], [352, 608], [298, 610]])];
// a deep hood with a plain human face in profile, peering at the lantern
const head = blob([[188, 222], [204, 198], [236, 190], [262, 206], [270, 240], [262, 268], [236, 282], [206, 280], [194, 262]]);
// the hood falls straight from the hump to the brow, so the head hangs forward and low like a hunchback's
const hoodTip = blob([[200, 206], [226, 188], [262, 182], [300, 194], [330, 222], [340, 262], [300, 280], [262, 276], [230, 262]]);
const nose = blob([[196, 220], [190, 236], [180, 248, "c"], [190, 252], [188, 262], [194, 268], [202, 276], [214, 276], [206, 230]]);
const tuft = hoodTip;
// near arm reaches forward and up holding the lantern by its ring
const arm = brush([[220, 290], [178, 320], [146, 300], [128, 258]], [36, 30, 24, 20]);
const hand = blob([[116, 252], [132, 236], [146, 248], [136, 266]]);
const ring = brush([[112, 228], [114, 210], [124, 204], [134, 210], [136, 228]], [6, 6]);
const lantern = [blob([[100, 226, "c"], [148, 226, "c"], [152, 236], [96, 236]]), rect2(124, 262, 44, 46), blob([[96, 286, "c"], [152, 286, "c"], [144, 298], [104, 298]])];
function rect2(x, y, w, h) { return `M${x - w / 2} ${y - h / 2}h${w}v${h}h-${w}z`; }
const glass = rect2(124, 262, 30, 34);
const rays = [[-60, -10], [-56, 24], [-40, 52], [60, 0], [52, 34]].map(([dx, dy]) => brush([[124 + dx * .55, 262 + dy * .55], [124 + dx, 262 + dy]], [6, 0]));
const otherHand = blob([[230, 330], [250, 322], [262, 340], [246, 354]]);
const cuts = [
  brush([[196, 238], [206, 240]], [3, 3]), brush([[200, 212], [210, 240], [206, 270], [214, 280]], [4, 5, 5, 3]),   // eye, hood opening
  brush([[188, 258], [198, 260]], [2, 1]),                         // mouth
  brush([[262, 310], [266, 420], [270, 560]], [3, 6, 2]), brush([[318, 300], [330, 420], [342, 560]], [3, 5, 2]), // coat folds
  brush([[222, 440], [298, 436]], [5, 5]),                         // belt
  ...[330, 362, 394].map((y) => blob([[236, y - 5], [244, y - 5], [244, y + 5], [236, y + 5]])),  // buttons
];
export default card({ bg, ink, transform: "translate(30 0)", layers: [legs, { d: coat }, { d: hump }, tuft, { d: head }, { d: nose }, cuts.map((d) => ({ d, fill: "bg" })),
  { d: otherHand, halo: 4 }, { group: [arm, hand], halo: 4, roots: [[220, 290, 26]] }, rays, { d: ring }, { group: lantern, halo: 4 }, { d: glass, fill: "bg" }, { d: blob([[124, 248], [132, 264], [124, 276], [116, 264]]) }] });
