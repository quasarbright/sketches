import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, sparkle, rect, card, minicard } from "../brush.mjs";
// A hooded seer in profile, peeking at a card held up to her face. Her scarf streams out behind her.
const { card: bg, ink } = ROLE_COLORS.seer;
const scarf = [
  blob([[226, 244], [180, 262], [136, 300], [112, 352], [92, 404], [60, 436, "c"], [96, 430], [80, 470, "c"], [124, 424], [150, 370], [174, 318], [220, 286]]),
];
const robe = blob([[226, 236], [290, 232], [306, 300], [322, 380], [350, 460], [378, 540], [392, 600, "c"], [346, 590], [300, 604], [250, 592], [196, 604], [150, 592], [118, 600, "c"], [150, 520], [178, 440], [196, 360], [206, 290]]);
const hood = blob([[176, 190, "c"], [210, 148], [254, 126], [294, 132], [314, 160], [306, 206], [312, 246], [292, 264], [244, 264], [212, 248], [198, 216]]);
const hoodTip = brush([[236, 140], [196, 146], [166, 172], [150, 206], [126, 222]], [40, 34, 24, 12, 0]);
// profile: brow, nose, lips, chin, poking out of the hood opening
const face = blob([[294, 150], [314, 162], [322, 186], [324, 196], [340, 214, "c"], [326, 220], [330, 230], [322, 236], [326, 246], [318, 256], [298, 262], [286, 220]]);
const forearm = brush([[312, 352], [350, 300], [364, 246]], [34, 26, 20]);
const sleeve = blob([[296, 282], [340, 312], [330, 350], [312, 400], [290, 440, "c"], [282, 380], [276, 320]]);
const hand = blob([[352, 244], [366, 226], [384, 230], [386, 250], [370, 262], [354, 258]]);
const off = blob([[200, 330], [224, 340], [226, 380], [212, 410], [196, 380]]);
const stars = [sparkle(420, 128, 24), sparkle(448, 210, 12), sparkle(414, 300, 15), sparkle(108, 150, 13), sparkle(70, 260, 17), sparkle(436, 390, 9)];
const folds = [
  brush([[196, 232], [230, 254], [282, 260], [312, 250]], [4, 5, 5, 3]),         // hood rim at the neck
  brush([[294, 148], [288, 200], [298, 262]], [5, 6, 4]),                       // hood opening
  brush([[306, 188], [320, 186]], [4, 3]),                                       // closed eye
  brush([[254, 302], [240, 380], [222, 470], [204, 560]], [4, 6, 6, 2]),         // robe folds
  brush([[290, 400], [304, 470], [322, 560]], [3, 5, 2]),
  brush([[224, 424], [212, 500], [176, 584]], [3, 5, 2]),
  brush([[160, 300], [130, 360], [100, 420]], [3, 4, 1]),                        // scarf crease
];
const C = [372, 206, 12];
// a braid falling from the hood over her shoulder, a sash with tassels, a crescent pendant
const braidPath = [[286, 258], [278, 300], [270, 340], [266, 372]];
const braid = brush(braidPath, [22, 20, 16, 8]);
const braidCuts = [0, 1, 2, 3, 4, 5].map((i) => { const y = 270 + i * 17, x = 284 - i * 3; return brush([[x - 9, y - 3], [x + 1, y + 4], [x + 9, y + 2]], [3, 3, 1]); });
const sash = [brush([[212, 352], [250, 362], [300, 352]], [4, 4, 4]), brush([[212, 376], [250, 386], [302, 374]], [4, 4, 4])];
const tassels = [brush([[236, 384], [230, 420], [226, 452]], [14, 10, 4]), brush([[252, 386], [252, 424], [252, 446]], [12, 9, 3])];

// exported so other cards can show the seer (the watcher spies on her from afar)
export const seerLayers = [stars, scarf, { d: robe }, { d: hoodTip }, { d: hood }, { d: face }, { d: off },
  folds.map((d) => ({ d, fill: "bg" })),
  sash.map((d) => ({ d, fill: "bg" })), { group: tassels, halo: 4 }, { d: braid, halo: 4 }, braidCuts.map((d) => ({ d, fill: "bg" })),
  { group: [sleeve, forearm, hand], halo: 4 }, brush([[302, 300], [322, 330], [312, 380]], [3, 4, 1]).replace(/^/, "") && { d: brush([[304, 300], [318, 334], [304, 392]], [3, 4, 1]), fill: "bg" },
  minicard(...C)];
export default card({ bg, ink, transform: "translate(-13 0) translate(6 0)", layers: seerLayers });
