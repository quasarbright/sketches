/* examples.js — projects to start from. Each is plain data: pictures of variables and steps. */

const mag = (shape, m, back = 0) => ({ k: "mag", shape, m, back });
const rim = (shape, t) => ({ k: "edge", shape, back: 0, e: "rim", t: String(t) });
const rel = (dx, dy) => ({ k: "rel", dx: String(dx), dy: String(dy) });

// The solar-power bar chart from the talk: a guide one bar wide, a bar filled into it and
// scaled to the data, the guide moved over one, all of that looped once per month. Then a second
// picture draws it twice, skinnier and side by side, with the other site's data and color.
function solar() {
  const bars = {
    id: "bars", name: "bars",
    vars: [
      { name: "panels", expr: "600" },
      { name: "kwPerPanel", expr: "0.2" },
      { name: "powerKw", expr: "panels * kwPerPanel" },
      { name: "sunHours", expr: "[53, 86, 117, 149, 174, 173, 163, 157, 137, 111, 72, 65]" },
      { name: "energyKwh", expr: "powerKw * sunHours" },
      { name: "energyMwh", expr: "energyKwh / 1000" },
      { name: "topMwh", expr: "25" },
      { name: "barWidth", expr: "0.8" },
      { name: "color", expr: '"#7c8cf8"' },
      { name: "labels", expr: "1" },
    ],
    measures: [
      { name: "total", expr: "sum(energyMwh)" },
      { name: "best", expr: "max(energyMwh)" },
    ],
    steps: [
      { id: 1, type: "rect", name: "guide", a: mag("page", "tl"), b: mag("page", "br"), props: { guide: true } },
      { id: 2, type: "scale", target: "guide", origin: mag("guide", "tl"), sx: "1 / count(energyMwh)", sy: "1" },
      { id: 3, type: "loop", count: "count(energyMwh)", body: [
        { id: 4, type: "rect", name: "bar", a: mag("guide", "tl"), b: mag("guide", "br"), props: { fill: "=color" } },
        { id: 5, type: "scale", target: "bar", origin: mag("bar", "b_"), sx: "barWidth", sy: "energyMwh / topMwh" },
        { id: 6, type: "if", cond: "labels", body: [
          { id: 7, type: "text", name: "label", a: mag("bar", "t"), props: { text: "{fmt(energyMwh, 1)}", size: "12", opacity: "0.7" } },
        ] },
        { id: 8, type: "move", target: "guide", from: mag("guide", "tl"), to: mag("guide", "tr") },
      ] },
    ],
  };
  const pairs = {
    id: "pairs", name: "pairs",
    vars: [
      { name: "otherSite", expr: "[31, 55, 84, 120, 151, 160, 149, 140, 110, 79, 44, 35] / 1000 * 140" },
    ],
    measures: [
      { name: "difference", expr: "here.total - there.total" },
    ],
    steps: [
      { id: 9, type: "picture", name: "here", pic: "bars", a: mag("page", "tl"), b: mag("page", "br"), overrides: { barWidth: "0.4", labels: "0" } },
      { id: 10, type: "move", target: "here", from: mag("here", "tl"), to: rel("-width(page) / count(otherSite) * 0.2", 0) },
      { id: 11, type: "picture", name: "there", pic: "bars", a: mag("page", "tl"), b: mag("page", "br"), overrides: { barWidth: "0.4", labels: "0", color: '"#f2a65a"', energyMwh: "otherSite" } },
      { id: 12, type: "move", target: "there", from: mag("there", "tl"), to: rel("width(page) / count(otherSite) * 0.2", 0) },
    ],
  };
  return { pictures: [bars, pairs], seq: 20 };
}

// A scatter plot where each sample also has a spread: a guide from the bottom-left corner to
// the sample, a line from the previous sample (the dot not yet drawn this time round is last
// time's), a bar for the spread centered on the sample, then the dot.
function scatter() {
  return { seq: 10, pictures: [{
    id: "scatter", name: "scatter",
    vars: [
      { name: "xs", expr: "[1.2, 2.0, 2.9, 3.4, 4.6, 5.1, 6.3, 7.0]" },
      { name: "ys", expr: "[2.1, 3.5, 3.0, 4.8, 4.1, 6.0, 5.2, 6.8]" },
      { name: "spread", expr: "[0.3, 0.6, 0.4, 0.8, 0.5, 0.3, 0.7, 0.4]" },
      { name: "xMax", expr: "8" },
      { name: "yMax", expr: "8" },
    ],
    measures: [],
    steps: [
      { id: 1, type: "loop", count: "count(xs)", body: [
        { id: 2, type: "rect", name: "g", a: mag("page", "bl"), b: mag("page", "tr"), props: { guide: true } },
        { id: 3, type: "scale", target: "g", origin: mag("g", "bl"), sx: "xs / xMax", sy: "ys / yMax" },
        { id: 4, type: "line", name: "link", a: mag("dot", "c"), b: mag("g", "tr"), props: { stroke: "#f2a65a", strokeWidth: "1.5", opacity: "0.6" } },
        { id: 5, type: "line", name: "wing", a: mag("g", "tr"), b: rel("spread / xMax * width(page)", 0), props: { stroke: "#f2a65a", strokeWidth: "5", opacity: "0.35" } },
        { id: 6, type: "move", target: "wing", from: mag("wing", "mid"), to: mag("g", "tr") },
        { id: 7, type: "circle", name: "dot", c: mag("g", "tr"), p: rel(5, 0), props: { fill: "#f2a65a" } },
      ] },
    ],
  }] };
}

// A pie chart: each wedge is a path from the center out to the rim and along it (two points on
// the same circle's rim in a row join with an arc), colored by its index.
function pie() {
  return { seq: 10, pictures: [{
    id: "pie", name: "pie",
    vars: [
      { name: "slices", expr: "[30, 20, 15, 25, 10]" },
      { name: "ends", expr: "cumsum(slices) / sum(slices)" },
      { name: "starts", expr: "ends - slices / sum(slices)" },
      { name: "hole", expr: "0" },
    ],
    measures: [],
    steps: [
      { id: 1, type: "circle", name: "pie", c: mag("page", "c"), p: rel(160, 0), props: { guide: true } },
      { id: 2, type: "loop", count: "count(slices)", body: [
        { id: 3, type: "path", name: "wedge", pts: [mag("pie", "c"), rim("pie", "starts - 0.25"), rim("pie", "ends - 0.25")], closed: true,
          props: { fill: "=hsl(220 + i * 360 / n, 55, 64)", stroke: "#0d1016", strokeWidth: "3" } },
        { id: 4, type: "text", name: "share", a: rim("pie", "(starts + ends) / 2 - 0.25"), props: { text: "{round(slices / sum(slices) * 100)}%", size: "13", baseline: "middle" } },
        { id: 5, type: "scale", target: "share", origin: mag("pie", "c"), sx: "1.18", sy: "1.18" },
      ] },
      { id: 6, type: "if", cond: "hole > 0", body: [
        { id: 7, type: "circle", name: "donut", c: mag("pie", "c"), p: rel("hole", 0), props: { fill: "#0d1016" } },
      ] },
    ],
  }] };
}

// A picture that draws itself: a trunk, then two smaller copies of the whole tree turned off its
// top, as long as there is depth left.
function tree() {
  return { seq: 20, pictures: [{
    id: "tree", name: "tree",
    vars: [
      { name: "depth", expr: "7" },
      { name: "spread", expr: "24" },
      { name: "shrink", expr: "0.68" },
    ],
    measures: [],
    steps: [
      { id: 1, type: "line", name: "trunk", a: mag("page", "b_"), b: rel(0, -120), props: { stroke: "=hsl(120 - depth * 12, 45, 62)", strokeWidth: "depth * 1.4 + 1" } },
      { id: 2, type: "if", cond: "depth > 0", body: [
        { id: 3, type: "picture", name: "left", pic: "tree", a: mag("page", "tl"), b: mag("page", "br"), overrides: { depth: "depth - 1" } },
        { id: 4, type: "move", target: "left", from: mag("left", "b_"), to: mag("trunk", "b") },
        { id: 5, type: "scale", target: "left", origin: mag("left", "b_"), sx: "shrink", sy: "shrink" },
        { id: 6, type: "rotate", target: "left", origin: mag("left", "b_"), angle: "-spread" },
        { id: 7, type: "picture", name: "right", pic: "tree", a: mag("page", "tl"), b: mag("page", "br"), overrides: { depth: "depth - 1" } },
        { id: 8, type: "move", target: "right", from: mag("right", "b_"), to: mag("trunk", "b") },
        { id: 9, type: "scale", target: "right", origin: mag("right", "b_"), sx: "shrink", sy: "shrink" },
        { id: 10, type: "rotate", target: "right", origin: mag("right", "b_"), angle: "spread" },
      ] },
    ],
  }] };
}

function blank() {
  return { seq: 1, pictures: [{ id: "picture", name: "picture", vars: [{ name: "data", expr: "[1, 2, 3, 4, 5]" }], measures: [], steps: [] }] };
}

export const EXAMPLES = [
  { id: "solar", title: "Solar bar chart", blurb: "The bar chart from the talk, then drawn twice inside a second picture to compare two sites.", make: solar, open: "bars" },
  { id: "scatter", title: "Scatter with spread", blurb: "Samples joined in order, each with a bar for its spread.", make: scatter },
  { id: "pie", title: "Pie chart", blurb: "Wedges traced along a guide circle's rim, colored by index.", make: pie },
  { id: "tree", title: "Recursive tree", blurb: "A picture that draws two smaller copies of itself.", make: tree },
  { id: "blank", title: "Blank", blurb: "An empty page and one array to draw with.", make: blank },
];
