import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, sparkle, boot, card } from "../brush.mjs";
import { seerLayers } from "./seer.mjs";
// The watcher: a hooded villager peering out from behind a tree trunk at night, hand shading his eyes,
// spying on the Seer: her own card art, small and far off. Facing right.
const { card: bg, ink } = ROLE_COLORS.watcher;
const legs = [brush([[236, 470], [228, 530], [222, 586]], [30, 26, 22]), boot(222, 598, { s: 22 }), brush([[268, 470], [282, 530], [290, 586]], [30, 26, 22]), boot(292, 598, { s: 22 })];
const tunic = blob([[214, 276], [262, 264], [294, 292], [302, 380], [312, 470], [322, 498, "c"], [288, 492], [256, 502], [222, 492], [188, 500, "c"], [196, 430], [200, 350]]);
const hood = blob([[220, 212], [238, 176], [270, 164], [296, 178], [306, 210], [312, 250], [290, 272], [246, 272], [220, 256]]);
const face = blob([[288, 188], [304, 194], [310, 210], [322, 222, "c"], [310, 226], [312, 238], [306, 244], [308, 254], [292, 264], [280, 246]]);
// near arm raised, hand flat over the brow
const arm = [brush([[284, 290], [322, 270], [312, 214]], [28, 22, 18]), blob([[290, 196], [334, 190], [338, 204], [296, 212]])];
// a tree trunk behind him on the left that he leans out from, with a branch reaching over his head
const tree = [blob([[118, 600, "c"], [128, 480], [134, 300], [130, 90], [198, 90], [194, 300], [200, 480], [214, 600, "c"]]), brush([[190, 160], [250, 130], [300, 126]], [26, 14, 4])];
const stars = [sparkle(400, 130, 14), sparkle(460, 220, 9), sparkle(350, 320, 8)];
const cuts = [
  brush([[288, 186], [280, 224], [290, 262]], [5, 6, 3]),                     // hood opening
  brush([[298, 214], [310, 214]], [4, 3]),                                     // eye, squinting
  brush([[240, 340], [232, 420], [222, 492]], [3, 5, 2]), brush([[278, 340], [288, 420], [294, 492]], [3, 5, 2]),
  brush([[204, 400], [306, 396]], [5, 5]),
  brush([[162, 200], [158, 340], [166, 520]], [4, 6, 3]),                      // bark
];
export default card({ bg, ink, transform: "translate(-44 0)", layers: [stars, { transform: "translate(392 360) scale(.18)", layers: seerLayers }, legs, { d: tunic }, { d: hood }, { d: face }, cuts.slice(0, 4).map((d) => ({ d, fill: "bg" })),
  { group: arm, halo: 4, roots: [[284, 290, 22]] }, { group: tree, halo: 5 }, { d: cuts[4], fill: "bg" }] });
