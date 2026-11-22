import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, rect, sparkle, card, minicard } from "../brush.mjs";
// The aura reader: a robed mystic with eyes closed and one palm raised, sensing the cards that were moved
// in the night as they drift past her, trailing streaks. Facing right.
const { card: bg, ink } = ROLE_COLORS.aurareader;
const robe = blob([[216, 276], [266, 266], [298, 300], [312, 400], [330, 520], [344, 596, "c"], [300, 588], [260, 600], [216, 590], [170, 598, "c"], [186, 520], [196, 400], [202, 330]]);
const hood = blob([[218, 210], [236, 172], [268, 160], [294, 174], [304, 206], [310, 250], [288, 272], [244, 272], [218, 254]]);
const hoodTip = brush([[240, 172], [204, 180], [182, 210], [172, 250]], [32, 22, 12, 4]);
const face = blob([[286, 184], [300, 190], [306, 204], [318, 216, "c"], [306, 220], [308, 232], [302, 238], [304, 248], [288, 258], [278, 240]]);
// near forearm raised in front, palm out toward the cards
const arm = [brush([[280, 300], [318, 330], [340, 296]], [26, 22, 18]), blob([[330, 300], [330, 274], [336, 254, "c"], [348, 256], [350, 272], [362, 268, "c"], [360, 292], [348, 306]])];
// two cards trading places in front of her: the top one dropping, the bottom one rising, streaks behind each
const flying = [[408, 206, -18], [430, 352, 14]];
const streaks = flying.flatMap(([x, y], i) => { const d = i ? 1 : -1; return [-12, 12].map((o) => brush([[x + o, y + d * 92], [x + o + d * 3, y + d * 50]], [1, 3.5])); });
const stars = [sparkle(120, 150, 14), sparkle(150, 300, 10), sparkle(110, 420, 9)];
const cuts = [
  brush([[288, 182], [280, 220], [290, 258]], [4, 5, 3]),              // hood opening
  brush([[294, 204], [306, 206]], [3, 2]),                             // closed eye
  brush([[230, 380], [222, 480], [210, 580]], [3, 5, 2]), brush([[272, 380], [284, 480], [300, 580]], [3, 5, 2]),
  brush([[200, 410], [312, 406]], [5, 5]),                             // sash
];
export default card({ bg, ink, transform: "translate(-30 10)", layers: [stars, streaks, flying.map(([x, y, a]) => minicard(x, y, a)), hoodTip, { d: robe }, { d: hood }, { d: face }, cuts.map((d) => ({ d, fill: "bg" })),
  { group: arm, halo: 4, roots: [[280, 300, 20]] }] });
