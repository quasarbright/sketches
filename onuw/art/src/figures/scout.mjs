import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, fringe, card } from "../brush.mjs";
// The scout: a lookout with one boot up on a rock, peering through a spyglass, cape blowing back.
const { card: bg, ink } = ROLE_COLORS.scout;
const rock = blob([[250, 520], [300, 488], [360, 492], [400, 530], [410, 610], [240, 612]]);
const cape = blob([[220, 236], [168, 270], [120, 330], [86, 380], [60, 400, "c"], [94, 404], [72, 440, "c"], [116, 420], [100, 460, "c"], [150, 410], [196, 360], [236, 300]]);
const backLeg = [brush([[232, 400], [216, 500], [206, 588]], [50, 38, 32]), blob([[184, 578], [226, 576], [248, 600], [182, 608]])];
const torso = blob([[218, 246], [266, 234], [292, 270], [292, 340], [282, 410], [222, 414], [212, 340], [208, 280]]);
const frontLeg = [brush([[262, 392], [318, 420], [336, 486]], [54, 40, 34], { capStart: "butt" }), blob([[318, 474], [356, 472], [378, 494], [314, 500]])];
const neck = brush([[248, 220], [250, 246]], [26, 30]);
const head = blob([[226, 176], [252, 164], [278, 170], [286, 194], [292, 208, "c"], [284, 212], [284, 226], [266, 238], [240, 232], [226, 206]]);
const hat = [blob([[214, 172, "c"], [240, 150], [276, 148], [296, 166, "c"], [270, 174], [238, 180]]), blob([[232, 160], [246, 132], [274, 130], [282, 158]])];
const feather = [brush([[240, 140], [206, 116], [176, 108]], [12, 10, 0]), ...fringe([[240, 140], [206, 116], [176, 108]], { n: 7, len: [8, 16], w: 7, side: 1, lean: .7, seed: 71 })];
// both hands hold the spyglass up to the eye, pointing right
const glass = [brush([[276, 198], [330, 190], [400, 180]], [18, 22, 26], { cap: "butt" }), brush([[396, 181], [410, 179]], [32, 32], { cap: "butt" })];
const arms = [brush([[272, 262], [300, 240], [314, 206]], [30, 24, 20], { capStart: "butt" }), blob([[302, 196], [326, 192], [330, 214], [306, 218]]),
  brush([[250, 266], [296, 258], [344, 216]], [30, 24, 20], { capStart: "butt" }), blob([[334, 196], [360, 192], [362, 214], [338, 220]])];
const belt = [brush([[214, 380], [288, 384]], [8, 8])];
const cuts = [
  brush([[258, 226], [252, 300], [248, 392]], [3, 4, 2]),      // tunic front
  brush([[324, 190], [324, 204]], [4, 4]), brush([[370, 182], [370, 200]], [4, 4]),   // spyglass bands
  brush([[220, 160], [292, 158]], [3, 3]),                      // hat band
  brush([[140, 330], [110, 380]], [3, 1]), brush([[180, 310], [150, 380]], [3, 1]),   // cape creases
  brush([[214, 382], [288, 386]], [3, 3]),
];
export default card({ bg, ink, transform: "translate(0 -8)", layers: [rock, { d: cape }, backLeg, { d: torso }, { group: frontLeg, halo: 4 }, neck, { d: head }, feather, hat,
  cuts.map((d) => ({ d, fill: "bg" })), { group: [glass, arms], halo: 4 }, cuts.slice(1, 3).map((d) => ({ d, fill: "bg" }))] });
