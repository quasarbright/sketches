import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, fringe, sparkle, card } from "../brush.mjs";
// The dozing wolf: a wolf curled up asleep on the ground under the moon, nose tucked on its paws and its
// tail wrapped around. It never wakes with the pack. Facing left.
const { card: bg, ink } = ROLE_COLORS.dozingwolf;
const moon = `M380 132a46 46 0 1 0 32 78a37 37 0 1 1 -32 -78z`;
// the curled body: a low rounded mound, haunch high at the back
const body = blob([[130, 470], [150, 420], [200, 384], [270, 370], [340, 382], [392, 420], [410, 470], [400, 510], [340, 524], [240, 526], [160, 516]]);
const fur = fringe([[150, 424], [200, 386], [270, 372], [340, 384], [392, 422]], { n: 12, len: [10, 20], w: 14, side: -1, lean: .6, seed: 71 });
// tail wrapping round the front, its brush lying across the forepaws
const tailPath = [[404, 480], [396, 520], [330, 536], [240, 538], [170, 530]];
const tail = [brush(tailPath, [30, 38, 38, 34, 16]), ...fringe(tailPath, { n: 14, len: [10, 22], w: 12, side: 1, lean: .6, seed: 72, from: .2, to: 1 })];
// head resting low on the forepaws at the left, eyes shut
const head = blob([[112, 462], [132, 440], [162, 434], [190, 446], [200, 470], [190, 494], [150, 502], [110, 500], [62, 494, "c"], [64, 482], [90, 474]]);
const ear = blob([[148, 446, "c"], [152, 408], [164, 386, "c"], [184, 414], [190, 444]]);
const paws = [brush([[210, 500], [150, 512], [100, 512]], [24, 20, 18]), blob([[80, 504], [104, 500], [108, 518], [82, 520]])];
const cuts = [
  brush([[132, 460], [142, 466], [154, 464]], [2, 3.5, 1]),        // shut eye, a curved lash line
  brush([[70, 492], [100, 492]], [3, 1]),                           // mouth
  brush([[164, 434], [164, 410]], [6, 0]),                          // inner ear
  brush([[300, 400], [330, 440], [336, 490]], [4, 6, 2]),           // haunch
];
export default card({ bg, ink, transform: "translate(-6 -10)", layers: [{ d: moon }, sparkle(120, 170, 14), sparkle(220, 230, 9), sparkle(440, 300, 10),
  { d: body }, fur, { d: ear }, { d: head }, cuts.map((d) => ({ d, fill: "bg" })), { group: paws, halo: 4 }, { group: tail, halo: 3, roots: [[404, 480, 26]] }] });
