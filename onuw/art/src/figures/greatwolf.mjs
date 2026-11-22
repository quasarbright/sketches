import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, fringe, eye, paw, card } from "../brush.mjs";
// The great wolf: an enormous wolf standing over a village, head held high. A cottage and pines at its
// feet come up only to its wrist, so you see how big it is. Facing right.
const { card: bg, ink } = ROLE_COLORS.greatwolf;
const farLegs = [brush([[304, 404], [300, 470], [302, 530], [306, 552]], [40, 28, 18, 16]), brush([[150, 396], [164, 452], [120, 500], [116, 552]], [62, 36, 18, 15])];
const farPaws = [paw(310, 566, { s: 19 }), paw(118, 566, { s: 19 })];
const tail = [blob([[126, 364], [96, 384], [72, 420], [62, 466], [70, 508, "c"], [88, 470], [104, 434], [126, 408]])];
const body = blob([[120, 362], [170, 336], [240, 332], [300, 324], [350, 330], [372, 380], [336, 428], [260, 432], [190, 434], [130, 420], [110, 392]]);
const back = fringe([[120, 360], [180, 334], [250, 330], [320, 324], [352, 330]], { n: 18, len: [14, 30], w: 18, side: -1, lean: .6, seed: 61 });
// neck and head raised high
const neck = blob([[318, 344], [340, 288], [372, 246], [404, 248], [410, 300], [384, 360], [350, 400], [328, 396]]);
const mane = fringe([[330, 330], [342, 288], [372, 248]], { n: 8, len: [14, 26], w: 16, side: -1, lean: .5, seed: 62 });
const head = blob([[364, 236], [390, 222], [418, 232], [458, 252, "c"], [452, 266], [426, 272], [404, 284], [376, 276]]);
const ears = [blob([[368, 244, "c"], [368, 216], [378, 202, "c"], [396, 218], [400, 234]])];
const nearHind = [brush([[182, 390], [222, 458], [178, 504], [186, 552]], [80, 46, 20, 16]), paw(190, 566, { s: 20 })];
const nearFore = [brush([[330, 384], [338, 450], [344, 520], [346, 552]], [48, 30, 20, 16]), paw(350, 566, { s: 20 })];
// a tiny village at its feet: a cottage and two pines, no taller than its wrist
const cottage = [blob([[388, 572, "c"], [388, 540, "c"], [408, 520, "c"], [428, 540, "c"], [428, 572, "c"]]), brush([[384, 542], [408, 518], [432, 542]], [6, 6])];
const pine = (x, h) => blob([[x, 572 - h, "c"], [x + h * .32, 572, "c"], [x - h * .32, 572, "c"]]);
const village = [...cottage, pine(450, 44), pine(472, 30), pine(372, 30), brush([[360, 574], [490, 574]], [3, 3])];
const cuts = [
  brush([[220, 388], [230, 432], [212, 470]], [3, 5, 2]), brush([[332, 396], [338, 440], [344, 490]], [3, 4, 2]),  // near legs
  eye(410, 248, { len: 22, h: 7 }), brush([[392, 236], [410, 238], [426, 246]], [2, 3.5, 1]),  // eye and brow
  brush([[428, 266], [450, 264]], [3, 1]),                                                    // mouth
  brush([[380, 228], [382, 214]], [5, 0]),                                                    // inner ear
  brush([[250, 364], [272, 396], [270, 420]], [4, 1]), brush([[226, 366], [246, 396], [244, 420]], [4, 1]),
];
const window_ = blob([[402, 552], [414, 552], [414, 562], [402, 562]]);
export default card({ bg, ink, transform: "translate(-26 -6)", layers: [farLegs, farPaws, tail, { d: body }, back, { d: neck }, mane, ears, { d: head },
  nearHind, nearFore, cuts.map((d) => ({ d, fill: "bg" })), { group: village, halo: 4, transform: "translate(0 -9)" }, { d: window_, fill: "bg", transform: "translate(0 -9)" }] });
