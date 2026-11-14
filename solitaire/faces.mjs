// Card artwork as SVG strings: faces with real pip layouts, and one back. Copied from my
// card-table project (card-table/faces.mjs) so the two decks match.
const W = 70, H = 98; // card units (card-table's size); the SVG scales to the card

export const RED = "#b3262b", BLACK = "#1d1c22", IVORY = "#f4efe3", BACK = "#a8322f";

// suit shapes in a 1×1 box
const SUIT_SHAPES = {
  H: `<path d="M.5 .95C.15 .7 0 .5 0 .3 0 .12.13 0 .28 0 .38 0 .46.06.5.15.54.06.62 0 .72 0 .87 0 1 .12 1 .3 1 .5.85.7.5.95Z"/>`,
  D: `<path d="M.5 0 .9 .5 .5 1 .1 .5Z"/>`,
  S: `<path d="M.5 0C.85.28 1 .45 1 .62 1 .78.88.88.73.88.64.88.57.84.53.78.55.88.6.95.68 1H.32C.4.95.45.88.47.78.43.84.36.88.27.88.12.88 0 .78 0 .62 0 .45.15.28.5 0Z"/>`,
  C: `<circle cx=".5" cy=".27" r=".22"/><circle cx=".25" cy=".6" r=".22"/><circle cx=".75" cy=".6" r=".22"/><circle cx=".5" cy=".52" r=".12"/><path d="M.46.55C.46.78.42.9.31 1H.69C.58.9.54.78.54.55Z"/>`,
};
export const suitColor = (suit) => (suit === "H" || suit === "D" ? RED : BLACK);

// one <symbol> per suit, defined once on the page; cards <use> them
export function suitDefs() {
  return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>` +
    Object.entries(SUIT_SHAPES).map(([s, d]) => `<symbol id="so-suit-${s}" viewBox="0 0 1 1">${d}</symbol>`).join("") +
    `<pattern id="so-lattice" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
    `<rect width="6" height="6" fill="${BACK}"/><path d="M0 0H6M0 0V6" stroke="#c4554b" stroke-width=".9"/></pattern>` +
    `</defs></svg>`;
}

const pip = (suit, x, y, size, flip = false) =>
  `<use href="#so-suit-${suit}" x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}"` +
  (flip ? ` transform="rotate(180 ${x} ${y})"` : "") + `/>`;

// pip positions as (column, row): columns -1/0/1, rows 0 (top) … 1 (bottom)
const L = -1, M = 0, R = 1;
const LAYOUTS = {
  2: [[M, 0], [M, 1]],
  3: [[M, 0], [M, .5], [M, 1]],
  4: [[L, 0], [R, 0], [L, 1], [R, 1]],
  5: [[L, 0], [R, 0], [M, .5], [L, 1], [R, 1]],
  6: [[L, 0], [R, 0], [L, .5], [R, .5], [L, 1], [R, 1]],
  7: [[L, 0], [R, 0], [M, .25], [L, .5], [R, .5], [L, 1], [R, 1]],
  8: [[L, 0], [R, 0], [M, .25], [L, .5], [R, .5], [M, .75], [L, 1], [R, 1]],
  9: [[L, 0], [R, 0], [L, 1 / 3], [R, 1 / 3], [M, .5], [L, 2 / 3], [R, 2 / 3], [L, 1], [R, 1]],
  10: [[L, 0], [R, 0], [M, 1 / 6], [L, 1 / 3], [R, 1 / 3], [L, 2 / 3], [R, 2 / 3], [M, 5 / 6], [L, 1], [R, 1]],
};

// a court card's frame is tinted toward its suit's color
const TINT = { [RED]: "#f3ddd4", [BLACK]: "#e3e0e2" };
const INDEX_X = 9;

export function faceSVG(rank, suit) {
  const color = suitColor(suit);
  // corner index: rank over suit, top left and (turned) bottom right
  const index = (rot) =>
    `<g${rot ? ` transform="rotate(180 ${W / 2} ${H / 2})"` : ""}>` +
    `<text x="${INDEX_X}" y="17.5" class="so-index${rank === "10" ? " so-ten" : ""}" text-anchor="middle">${rank}</text>` +
    pip(suit, INDEX_X, 25, 9) + `</g>`;
  let middle;
  if (rank === "A") {
    middle = pip(suit, W / 2, H / 2, suit === "S" ? 40 : 32);
  } else if (rank === "J" || rank === "Q" || rank === "K") {
    // a two-ended monogram in a tinted frame, the way court cards read from either end
    const fx = 18.5, fy = 9, fw = W - 37, fh = H - 18, mid = H / 2;
    const half = `<text x="${W / 2 + 2}" y="${mid - 9}" class="so-court" text-anchor="middle">${rank}</text>` +
      pip(suit, fx + 6.5, fy + 7.5, 7);
    middle =
      `<rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" rx="3" fill="${TINT[color]}" stroke="${color}" stroke-width=".9"/>` +
      `<path d="M${fx + 4} ${mid}H${fx + fw - 4}" stroke="${color}" stroke-width=".6"/>` +
      half + `<g transform="rotate(180 ${W / 2} ${mid})">${half}</g>`;
  } else {
    const xs = { [L]: 24.5, [M]: W / 2, [R]: W - 24.5 };
    const top = 19, bottom = H - 19, size = suit === "D" ? 12 : 13;
    middle = LAYOUTS[rank].map(([c, r]) => pip(suit, xs[c], top + r * (bottom - top), size, r > .5)).join("");
  }
  return `<svg class="so-svg" viewBox="0 0 ${W} ${H}" fill="${color}">` +
    `<rect x=".25" y=".25" width="${W - .5}" height="${H - .5}" rx="5" fill="${IVORY}" stroke="rgba(0,0,0,.18)" stroke-width=".5"/>` +
    index(false) + index(true) + middle + `</svg>`;
}

// red lattice inside a double border, ivory all round
export function backSVG() {
  return `<svg class="so-svg" viewBox="0 0 ${W} ${H}">` +
    `<rect x=".25" y=".25" width="${W - .5}" height="${H - .5}" rx="5" fill="${IVORY}" stroke="rgba(0,0,0,.18)" stroke-width=".5"/>` +
    `<rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="3" fill="${BACK}"/>` +
    `<rect x="7" y="7" width="${W - 14}" height="${H - 14}" rx="1.5" fill="url(#so-lattice)" stroke="${IVORY}" stroke-width=".8"/>` +
    `</svg>`;
}
