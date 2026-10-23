// Real objects at their real sizes, in millimeters. w is the short side as the object is
// usually held (phones portrait, cards landscape), h the other. r is the corner radius.
// Phone and tablet corner radii are approximate; the outer dimensions are the makers' specs.
//
// kind picks the silhouette; colored objects (phones, tablets, your own rectangles) are the
// things being compared, the rest are chalk-white references.

export const LIBRARY = [
  {
    name: "Phones",
    colored: true,
    items: [
      { id: "iphone-17-pro-max", name: "iPhone 17 Pro Max", w: 78.0, h: 163.4, r: 12, kind: "phone" },
      { id: "iphone-17-pro", name: "iPhone 17 Pro", w: 71.9, h: 150.0, r: 11.5, kind: "phone" },
      { id: "iphone-air", name: "iPhone Air", w: 74.7, h: 156.2, r: 12, kind: "phone" },
      { id: "iphone-duo-folded", name: "iPhone Duo (folded)", w: 84.1, h: 117.8, r: 10, kind: "phone" },
      { id: "iphone-duo-open", name: "iPhone Duo (unfolded)", w: 164.6, h: 117.8, r: 10, kind: "foldable" },
      { id: "iphone-17", name: "iPhone 17", w: 71.5, h: 149.6, r: 11.5, kind: "phone" },
      { id: "iphone-16e", name: "iPhone 16e", w: 71.5, h: 146.7, r: 10.5, kind: "phone" },
      { id: "iphone-13-mini", name: "iPhone 13 mini", w: 64.2, h: 131.5, r: 9.5, kind: "phone" },
      { id: "iphone-se", name: "iPhone SE (2022)", w: 67.3, h: 138.4, r: 9, kind: "phone" },
      { id: "pixel-10", name: "Pixel 10", w: 72.0, h: 152.8, r: 10, kind: "phone" },
      { id: "pixel-10-pro-xl", name: "Pixel 10 Pro XL", w: 76.6, h: 162.8, r: 10, kind: "phone" },
      { id: "galaxy-s25", name: "Galaxy S25", w: 70.5, h: 146.9, r: 9, kind: "phone" },
      { id: "galaxy-s25-ultra", name: "Galaxy S25 Ultra", w: 77.6, h: 162.8, r: 3.5, kind: "phone" },
    ],
  },
  {
    name: "Tablets & laptops",
    colored: true,
    items: [
      { id: "ipad-mini", name: "iPad mini", w: 134.8, h: 195.4, r: 11, kind: "tablet" },
      { id: "ipad-11", name: "iPad (11-inch)", w: 179.5, h: 248.6, r: 12, kind: "tablet" },
      { id: "ipad-pro-13", name: "iPad Pro 13-inch", w: 215.5, h: 281.6, r: 13, kind: "tablet" },
      { id: "macbook-air-13", name: "MacBook Air 13\"", w: 304.1, h: 215.0, r: 8, kind: "laptop" },
      { id: "macbook-air-15", name: "MacBook Air 15\"", w: 340.4, h: 237.6, r: 8, kind: "laptop" },
      { id: "macbook-pro-14", name: "MacBook Pro 14\"", w: 312.6, h: 221.2, r: 8, kind: "laptop" },
      { id: "macbook-pro-16", name: "MacBook Pro 16\"", w: 355.7, h: 248.1, r: 8, kind: "laptop" },
    ],
  },
  {
    name: "Cards & paper",
    colored: false,
    items: [
      { id: "credit-card", name: "Credit card", w: 85.6, h: 53.98, r: 3.18, kind: "card" },
      { id: "business-card", name: "Business card (US)", w: 88.9, h: 50.8, r: 0, kind: "plain" },
      { id: "passport", name: "Passport", w: 88, h: 125, r: 6, kind: "passport" },
      { id: "dollar-bill", name: "Dollar bill", w: 156.0, h: 66.3, r: 0, kind: "bill" },
      { id: "sticky-note", name: "Sticky note", w: 76, h: 76, r: 0, kind: "plain" },
      { id: "index-card", name: "Index card 3×5", w: 127, h: 76.2, r: 0, kind: "plain" },
      { id: "us-letter", name: "US Letter", w: 215.9, h: 279.4, r: 0, kind: "paper" },
      { id: "a4", name: "A4", w: 210, h: 297, r: 0, kind: "paper" },
    ],
  },
  {
    name: "Everyday things",
    colored: false,
    items: [
      { id: "soda-can", name: "Soda can (12 oz)", w: 66.2, h: 122.2, r: 0, kind: "can" },
      { id: "soda-can-top", name: "Soda can, top", w: 66.2, h: 66.2, r: 0, kind: "can-top", circle: true },
      { id: "quarter", name: "Quarter", w: 24.26, h: 24.26, r: 0, kind: "coin", circle: true },
      { id: "aa-battery", name: "AA battery", w: 14.5, h: 50.5, r: 1.5, kind: "battery" },
      { id: "cd", name: "CD", w: 120, h: 120, r: 0, kind: "disc", circle: true },
    ],
  },
];

export const BY_ID = Object.fromEntries(
  LIBRARY.flatMap((g) => g.items.map((it) => [it.id, { ...it, colored: g.colored }]))
);
