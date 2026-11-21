import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, fringe, eye, brow, paw, card } from "../brush.mjs";
// The prowler: a wolf on all fours, slinking right with its head low and one forepaw lifted mid-step.
const { card: bg, ink } = ROLE_COLORS.prowler;
// legs bend where a wolf's do: elbow and wrist in front, stifle forward and hock back behind; every paw stands on its toes
const farLegs = [brush([[304, 404], [298, 456], [300, 524], [310, 552]], [36, 24, 16, 14]), brush([[150, 396], [164, 452], [120, 500], [116, 552]], [58, 34, 16, 14])];
const farPaws = [paw(312, 566, { s: 18 }), paw(118, 566, { s: 18 })];
// tail carried low and straight behind, the way a stalking wolf holds it
const tail = [blob([[126, 364], [92, 368], [60, 386], [38, 414], [24, 448, "c"], [50, 444], [76, 430], [102, 414], [124, 404]])];
const body = blob([[120, 362], [170, 340], [240, 342], [300, 340], [346, 352], [362, 392], [330, 428], [260, 430], [190, 432], [130, 418], [110, 392]]);
const back = fringe([[120, 360], [180, 338], [250, 340], [320, 342], [350, 350]], { n: 18, len: [14, 30], w: 16, side: -1, lean: .6, seed: 52 });
const neck = blob([[322, 352], [370, 352], [404, 380], [398, 410], [356, 420], [330, 412]]);
const head = blob([[376, 356], [404, 350], [428, 364], [470, 392, "c"], [462, 404], [436, 408], [414, 418], [388, 410]]);
const ears = [blob([[380, 366, "c"], [382, 342], [390, 330, "c"], [408, 346], [414, 362]])];
const nearHind = [brush([[182, 390], [220, 458], [176, 504], [186, 552]], [76, 44, 18, 15]), paw(190, 566, { s: 19 })];
// near forepaw lifted mid-step, wrist bent so the paw hangs curled under
const nearFore = [brush([[326, 394], [338, 444], [362, 482], [352, 504]], [44, 26, 17, 14]), blob([[340, 498], [360, 496], [368, 510], [360, 522, "c"], [346, 520], [338, 510]])];
const belly = fringe([[150, 426], [220, 434], [290, 428]], { n: 8, len: [10, 18], w: 12, side: -1, lean: .3, seed: 53 });
const cuts = [
  brush([[220, 388], [228, 432], [212, 470]], [3, 5, 2]), brush([[326, 386], [334, 420], [348, 452]], [3, 4, 2]),  // near legs
  eye(418, 377, { len: 22, h: 7 }), brow(418, 377, { len: 22, h: 7 }),                       // eye
  brush([[436, 398], [458, 398]], [3, 1]),                       // mouth
  brush([[392, 352], [394, 338]], [5, 0]),                       // inner ear
  brush([[250, 368], [272, 396], [270, 420]], [4, 1]), brush([[226, 370], [246, 396], [244, 420]], [4, 1]), // ribs
];
export default card({ bg, ink, transform: "translate(4 -132) scale(1.02)", layers: [farLegs, farPaws, tail, { d: body }, back, { d: neck }, ears, { d: head },
  nearHind, nearFore, cuts.map((d) => ({ d, fill: "bg" }))] });
