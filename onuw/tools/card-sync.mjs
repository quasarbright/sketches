// Three-way sync between the game's card text and Mike's card list artifact (db collection `cards`).
// Fields: name (skin.mjs NAMES), short (roles.mjs), detail (details.mjs, the "How it works" text).
//
//   node tools/card-sync.mjs <artifact-dump-dir> <versions.json> <baseline.json>
//
// <artifact-dump-dir> holds one <id>.json per card (ArtifactData list with out_dir), <versions.json>
// maps id -> the version that listing showed, <baseline.json> is the last-synced copy of every field.
// Per field: if only the code changed, the artifact gets the code's value; if only the artifact
// changed (Mike edited it), the code gets his value; if both changed, his value wins and it's
// reported. Writes the code files, prints the artifact batch to send (pinned with if_version), and
// saves the new baseline once you confirm the batch landed (pass --commit-baseline).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const [dumpDir, versionsPath, baselinePath] = process.argv.slice(2);
const commit = process.argv.includes("--commit-baseline");
const versions = JSON.parse(fs.readFileSync(versionsPath, "utf8"));
const baseline = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, "utf8")) : {};

const { ROLES, ROLE_ORDER } = await import(path.join(root, "roles.mjs"));
const { NAMES } = await import(path.join(root, "skin.mjs"));
const { DETAILS } = await import(path.join(root, "details.mjs"));

const code = Object.fromEntries(ROLE_ORDER.map((id) => [id, { name: NAMES[id], short: ROLES[id].short, detail: DETAILS[id] ?? "" }]));
const art = Object.fromEntries(ROLE_ORDER.map((id) => [id, JSON.parse(fs.readFileSync(path.join(dumpDir, `${id}.json`), "utf8"))]));

const toCode = {}, toArt = {}, conflicts = [], next = {};
for (const id of ROLE_ORDER) {
  next[id] = {};
  for (const f of ["name", "short", "detail"]) {
    const A = art[id][f] ?? "", C = code[id][f], B = baseline[id]?.[f];
    let v = A;
    if (A === C) v = A;
    else if (B !== undefined && A === B) { v = C; (toArt[id] ??= {})[f] = C; }
    else { v = A; (toCode[id] ??= {})[f] = A; if (B !== undefined && C !== B) conflicts.push(`${id}.${f}`); }
    next[id][f] = v;
  }
}

// write Mike's values into the code
const js = (s) => JSON.stringify(s);
let skin = fs.readFileSync(path.join(root, "skin.mjs"), "utf8");
let roles = fs.readFileSync(path.join(root, "roles.mjs"), "utf8");
for (const [id, f] of Object.entries(toCode)) {
  if (f.name !== undefined) skin = skin.replace(new RegExp(`^(  ${id}: )"[^"]*",`, "m"), `$1${js(f.name)},`);
  if (f.short !== undefined) {
    const at = roles.indexOf(`\n  ${id}: {`);
    const s = roles.indexOf("short: ", at), e = roles.indexOf(",\n", s);
    roles = roles.slice(0, s) + `short: ${js(f.short)}` + roles.slice(e);
  }
}
fs.writeFileSync(path.join(root, "skin.mjs"), skin);
fs.writeFileSync(path.join(root, "roles.mjs"), roles);
const details = Object.fromEntries(ROLE_ORDER.map((id) => [id, next[id].detail]));
fs.writeFileSync(path.join(root, "details.mjs"),
  `// "How it works" for each card: the longer explanation behind the card's info button.\n` +
  `// Kept in sync with the card list artifact by tools/card-sync.mjs; edit either side.\n` +
  `export const DETAILS = {\n${ROLE_ORDER.map((id) => `  ${id}: ${js(details[id])},`).join("\n")}\n};\n`);

const writes = Object.entries(toArt).map(([id, data]) => ({ op: "update", collection: "cards", doc_id: id, data, if_version: versions[id] }));
console.log(JSON.stringify({ toCode: Object.keys(toCode), toArtifact: Object.keys(toArt), conflicts, writes }, null, 1));
if (commit) fs.writeFileSync(baselinePath, JSON.stringify(next, null, 1));
