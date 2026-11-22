import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, boot, card } from "../brush.mjs";
// The investigator: a man in a long coat and a wide-brimmed hat, bent forward and peering through a
// magnifying glass at the ground, following a trail of footprints. Facing right.
const { card: bg, ink } = ROLE_COLORS.investigator;
const legs = [brush([[228, 470], [216, 530], [206, 588]], [32, 28, 24]), boot(206, 600, { s: 22 }), brush([[262, 470], [282, 530], [296, 588]], [32, 28, 24]), boot(298, 600, { s: 22 })];
const coat = blob([[214, 284], [262, 270], [300, 296], [314, 380], [322, 470], [334, 520, "c"], [296, 512], [262, 522], [222, 512], [186, 520, "c"], [196, 440], [200, 360]]);
const collar = blob([[224, 282], [262, 262], [300, 284], [292, 312], [262, 296], [232, 310]]);
const neck = brush([[266, 240], [270, 272]], [24, 28]);
const head = blob([[244, 216], [256, 198], [282, 194], [300, 206], [306, 224], [318, 238, "c"], [306, 242], [308, 254], [302, 260], [302, 268], [288, 276], [264, 274], [248, 258]]);
const hat = [blob([[236, 210, "c"], [240, 178], [262, 164], [290, 166], [302, 184], [304, 208, "c"]]), brush([[206, 210], [270, 206], [336, 214]], [5, 14, 5])];
// near arm holds the magnifying glass out and down in front of him
const arm = [brush([[284, 300], [322, 340], [350, 346]], [28, 22, 18]), blob([[342, 334], [364, 332], [368, 354], [346, 358]])];
const glass = [brush([[360, 352], [386, 386]], [10, 8]), `M404 412m-30 0a30 30 0 1 0 60 0a30 30 0 1 0 -60 0z`];
const lens = `M404 412m-21 0a21 21 0 1 0 42 0a21 21 0 1 0 -42 0z`;
const prints = [[360, 590], [394, 566], [428, 584], [462, 560]].map(([x, y], i) => blob([[x - 7, y + 4], [x - 6, y - 8], [x, y - 12], [x + 6, y - 8], [x + 7, y + 4], [x, y + 8]]));
const cuts = [
  brush([[290, 222], [300, 222]], [4, 3]),                                  // eye, squinting
  brush([[294, 262], [302, 262]], [2, 1]),                                  // mouth
  brush([[240, 200], [302, 200]], [5, 5]),                                  // hat band
  brush([[246, 330], [238, 420], [230, 510]], [3, 5, 2]), brush([[284, 330], [296, 420], [306, 510]], [3, 5, 2]),
  brush([[200, 400], [316, 396]], [5, 5]),                                  // belt
];
export default card({ bg, ink, transform: "translate(-78 -10)", layers: [prints, legs, { d: coat }, neck, { d: head }, hat, { d: collar }, cuts.map((d) => ({ d, fill: "bg" })),
  { group: glass, halo: 4 }, { d: lens, fill: "bg" }, brush([[392, 400], [398, 394]], [3, 3]), { group: arm, halo: 4, roots: [[284, 300, 22]] }] });
