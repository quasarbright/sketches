import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, rect, boot, card, minicard } from "../brush.mjs";
// The witch: a hook-nosed woman in a tall bent hat and long robe, holding up a card she has taken from
// the center, a cauldron steaming at her feet. Facing right.
const { card: bg, ink } = ROLE_COLORS.witch;
const feet = [boot(220, 598, { s: 20 }), boot(290, 598, { s: 20 })];
const robe = blob([[216, 268], [268, 256], [300, 288], [310, 380], [326, 500], [340, 586, "c"], [300, 578], [260, 590], [220, 580], [178, 588, "c"], [192, 500], [200, 380]]);
const hair = brush([[244, 196], [226, 236], [218, 282], [206, 320]], [34, 30, 22, 8]);
const head = blob([[234, 202], [250, 184], [276, 180], [294, 194], [300, 210], [318, 228, "c"], [302, 228], [304, 240], [298, 246], [298, 256], [282, 264], [258, 262], [240, 244]]);
const brim = brush([[200, 200], [262, 190], [328, 190]], [5, 14, 5]);
const cone = blob([[228, 192, "c"], [240, 150], [256, 116], [268, 92, "c"], [282, 120], [298, 192, "c"]]);
const tip = brush([[268, 94], [250, 84], [232, 90]], [10, 6, 2]);
// near arm raised, holding the card up beside her face
const arm = [brush([[284, 290], [326, 300], [348, 248]], [28, 22, 18]), blob([[338, 236], [360, 232], [364, 254], [342, 258]])];
const pot = [blob([[350, 506, "c"], [458, 506, "c"], [468, 544], [446, 584], [362, 584], [340, 544]]), brush([[342, 504], [466, 504]], [12, 12]),
  brush([[366, 580], [358, 600]], [8, 6]), brush([[442, 580], [450, 600]], [8, 6])];
const steam = [brush([[380, 486], [372, 466], [384, 446], [376, 424]], [7, 6, 5, 2]), brush([[420, 488], [430, 462], [418, 440], [428, 414]], [7, 6, 5, 2])];
const cuts = [
  brush([[284, 208], [296, 208]], [4, 3]),                                          // eye
  brush([[288, 248], [298, 250]], [2, 1]),                                          // thin mouth
  brush([[232, 186], [296, 184]], [5, 5]),                                          // hat band
  brush([[240, 300], [232, 420], [222, 570]], [3, 6, 2]), brush([[280, 310], [292, 440], [304, 570]], [3, 5, 2]),   // robe folds
  brush([[206, 380], [304, 376]], [5, 5]),                                          // sash
];
export default card({ bg, ink, transform: "translate(-38 62) scale(.86)", layers: [feet, { d: robe }, hair, { d: head }, { d: cone }, tip, brim, cuts.map((d) => ({ d, fill: "bg" })),
  minicard(356, 204, 8, 1 / .86), { group: arm, halo: 4, roots: [[284, 290, 22]] }, steam, { group: pot, halo: 4 }] });
