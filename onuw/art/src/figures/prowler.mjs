import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, fringe, eye, card } from "../brush.mjs";
// The prowler: a wolf on all fours, slinking right with its head low and one forepaw lifted mid-step.
const { card: bg, ink } = ROLE_COLORS.prowler;
const farLegs = [brush([[300, 420], [312, 470], [318, 520], [330, 560]], [44, 30, 22, 18]), brush([[150, 404], [176, 456], [134, 506], [130, 556]], [56, 36, 22, 18])];
const farPaws = [blob([[318, 552], [352, 550], [362, 566], [316, 568]]), blob([[116, 552], [150, 550], [160, 566], [114, 568]])];
const tail = [brush([[120, 380], [80, 400], [60, 446], [40, 470]], [40, 46, 30, 0]), ...fringe([[120, 380], [80, 400], [60, 446], [40, 470]], { n: 10, len: [14, 26], w: 12, side: 1, lean: .7, seed: 51, from: .2 })];
const body = blob([[120, 362], [170, 340], [240, 342], [300, 340], [346, 352], [362, 392], [330, 428], [260, 430], [190, 432], [130, 418], [110, 392]]);
const back = fringe([[120, 360], [180, 338], [250, 340], [320, 342], [350, 350]], { n: 18, len: [14, 30], w: 16, side: -1, lean: .6, seed: 52 });
const neck = blob([[322, 352], [370, 352], [404, 380], [398, 410], [356, 420], [330, 412]]);
const head = blob([[376, 356], [404, 350], [428, 364], [470, 392, "c"], [462, 404], [436, 408], [414, 418], [388, 410]]);
const ears = [blob([[386, 362, "c"], [386, 334], [396, 316, "c"], [408, 338], [410, 356]])];
const nearHind = [brush([[176, 392], [196, 452], [150, 506], [160, 556]], [74, 48, 24, 20]), blob([[146, 548], [186, 546], [200, 566], [144, 570]])];
const nearFore = [brush([[320, 400], [340, 456], [372, 476], [394, 470]], [42, 28, 22, 18]), blob([[384, 458], [408, 456], [420, 474], [396, 482], [382, 478]])];
const belly = fringe([[150, 426], [220, 434], [290, 428]], { n: 8, len: [10, 18], w: 12, side: -1, lean: .3, seed: 53 });
const cuts = [
  brush([[218, 384], [216, 430], [196, 470]], [3, 5, 2]), brush([[322, 392], [330, 424], [346, 450]], [3, 4, 2]),  // near legs
  eye(418, 377, { len: 18, h: 8, angle: 14 }), brush([[402, 368], [418, 368], [432, 374]], [2, 4, 1]),                       // eye
  brush([[436, 398], [458, 398]], [3, 1]),                       // mouth
  brush([[394, 348], [398, 328]], [5, 0]),                       // inner ear
  brush([[250, 368], [272, 396], [270, 420]], [4, 1]), brush([[226, 370], [246, 396], [244, 420]], [4, 1]), // ribs
];
export default card({ bg, ink, transform: "translate(-12 -132) scale(1.04)", layers: [farLegs, farPaws, tail, { d: body }, back, { d: neck }, ears, { d: head },
  nearHind, nearFore, cuts.map((d) => ({ d, fill: "bg" }))] });
