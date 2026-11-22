import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, rect, boot, card } from "../brush.mjs";
// The bodyguard: a broad man-at-arms in a helmet with a nose guard, planted in a wide stance behind a tall
// tower shield, a sword held low and ready. Facing right.
const { card: bg, ink } = ROLE_COLORS.bodyguard;
const legs = [brush([[230, 450], [210, 520], [196, 584]], [40, 34, 28]), boot(196, 598, { s: 26 }),
  brush([[282, 450], [306, 520], [318, 584]], [40, 34, 28]), boot(322, 598, { s: 26 })];
// a broad padded coat, wider at the shoulders
const body = blob([[196, 262], [250, 240], [306, 252], [326, 300], [322, 400], [318, 470, "c"], [280, 462], [244, 470], [204, 462], [186, 470, "c"], [184, 400], [176, 310]]);
const neck = brush([[254, 222], [256, 252]], [34, 40]);
const head = blob([[226, 186], [244, 166], [272, 162], [292, 176], [298, 200], [306, 214, "c"], [296, 218], [298, 232], [290, 244], [270, 250], [246, 246], [232, 226]]);
const helm = blob([[220, 196, "c"], [222, 164], [246, 142], [276, 140], [298, 156], [304, 188, "c"], [262, 184]]);
const nasal = brush([[298, 186], [302, 212]], [8, 6]);
// far arm holds the sword low behind the shield, the blade angled down and forward
const swordArm = [brush([[208, 290], [194, 360], [214, 410]], [30, 26, 22]), blob([[204, 402], [228, 398], [232, 422], [208, 426]])];
const sword = [brush([[216, 412], [170, 476]], [13, 3]), brush([[204, 400], [234, 422]], [8, 8]), brush([[222, 414], [232, 400]], [8, 8])];
// near arm braced behind the tall shield; only the shield shows
const shield = rect(336, 392, 116, 240, 0, 14);
const cuts = [
  brush([[280, 200], [292, 200]], [4, 3]),                                          // eye
  brush([[222, 188], [300, 186]], [4, 4]),                                          // helm rim
  brush([[284, 232], [294, 232]], [3, 2]),                                          // set mouth
  rect(336, 392, 94, 218, 0, 10),                                                    // shield face
  brush([[240, 320], [236, 460]], [3, 2]),                                          // coat fold
];
const boss = [brush([[336, 296], [336, 488]], [10, 10]), brush([[294, 380], [378, 380]], [10, 10]), `M336 380m-18 0a18 18 0 1 0 36 0a18 18 0 1 0 -36 0z`];
export default card({ bg, ink, transform: "translate(-22 0)", layers: [{ group: sword, halo: 3 }, { group: swordArm, halo: 4, roots: [[208, 290, 22]] }, legs, { d: body }, neck, { d: head }, { d: helm }, nasal,
  cuts.slice(0, 3).map((d) => ({ d, fill: "bg" })), { d: cuts[4], fill: "bg" }, { group: [shield], halo: 5 }, { d: cuts[3], fill: "bg" }, boss] });
