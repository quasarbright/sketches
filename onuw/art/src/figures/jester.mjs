import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, rect, boot, card } from "../brush.mjs";
// The skinner (the tanner): a worn-out leatherworker in a long apron, shoulders slumped, fleshing knife hanging
// from one hand beside a hide stretched on its wooden frame. Facing right, toward the frame.
const { card: bg, ink } = ROLE_COLORS.jester;
// the frame: two posts and two rails, the hide laced inside it
const frame = [brush([[310, 200], [310, 600]], [14, 14]), brush([[456, 200], [456, 600]], [14, 14]), brush([[298, 230], [468, 230]], [12, 12]), brush([[298, 520], [468, 520]], [12, 12])];
const hide = blob([[334, 262], [362, 250], [384, 264], [408, 250], [434, 262], [430, 300], [440, 340], [428, 390], [436, 440], [430, 488], [404, 478], [384, 492], [360, 478], [334, 490], [338, 440], [326, 390], [338, 340], [326, 300]]);
const laces = [[334, 262, 310, 240], [434, 262, 456, 240], [334, 490, 310, 512], [430, 488, 456, 512], [326, 390, 310, 390], [436, 390, 456, 390], [384, 264, 384, 236], [384, 492, 384, 516]]
  .map(([a, b, c, d]) => brush([[a, b], [c, d]], [3, 3]));
const legs = [brush([[198, 470], [192, 530], [188, 584]], [32, 28, 24]), boot(192, 598, { s: 23 }), brush([[232, 470], [240, 530], [244, 584]], [32, 28, 24]), boot(248, 598, { s: 23 })];
const body = blob([[176, 270], [212, 252], [246, 262], [262, 320], [266, 400], [270, 486, "c"], [240, 480], [214, 488], [184, 480], [162, 488, "c"], [168, 400], [168, 320]]);
const neck = brush([[218, 236], [222, 258]], [22, 26]);
// head hung low and forward: the job has worn him down
const head = blob([[196, 214], [218, 196], [244, 198], [258, 218], [266, 230, "c"], [258, 236], [258, 248], [242, 260], [218, 258], [200, 244]]);
// a cloth coif tied under the chin, falling to the shoulders behind
const cap = blob([[186, 252, "c"], [188, 210], [204, 190], [230, 184], [252, 194], [244, 202], [220, 206], [212, 230], [216, 262, "c"]]);
const arm = [brush([[238, 276], [256, 340], [270, 396]], [26, 22, 18]), blob([[262, 390], [284, 388], [288, 410], [266, 414]])];
const knife = [brush([[276, 402], [282, 448]], [6, 6]), blob([[268, 448], [300, 446, "c"], [298, 462], [272, 462]])];
const cuts = [
  brush([[240, 222], [254, 226]], [4, 3]),                                    // heavy-lidded eye
  brush([[248, 248], [258, 250]], [3, 2]),                                    // flat mouth
  brush([[184, 300], [200, 296], [226, 300], [250, 296]], [4, 4, 4, 4]),       // apron top
  brush([[184, 300], [178, 400], [176, 480]], [4, 4, 2]), brush([[250, 296], [256, 400], [258, 480]], [4, 4, 2]), // apron sides
];
export default card({ bg, ink, transform: "translate(-62 -12)", layers: [frame, laces, { d: hide, halo: 5 }, { d: brush([[360, 320], [400, 340], [370, 400], [406, 430]], [3, 4, 4, 2]), fill: "bg" },
  legs, { d: body }, neck, { d: head }, { d: cap }, cuts.map((d) => ({ d, fill: "bg" })), { group: arm, halo: 4, roots: [[238, 276, 18]] }, knife] });
