// Role definitions: names, teams, wake order, rules text and card emblems.
// Pure data, shared by the engine (rules) and the page (cards, cheat sheet).

export const TEAMS = {
  village: { name: "Village", color: "#5aa9e6" },
  wolf: { name: "Wolf team", color: "#e0485a" },
  jester: { name: "On their own", color: "#f2a541" },
};

// `max`: how many copies the role picker allows. `pair`: comes in twos (Masons).
// `wolf`: counts as a Werewolf (wakes with the wolves, killing one wins it for the village).
// `step`: the night step this role acts in (see NIGHT_STEPS), or null for no night action.
export const ROLES = {
  werewolf: {
    name: "Werewolf", team: "wolf", wolf: true, max: 3, step: "wolves",
    short: "Sees the other wolves",
    text: "Wakes with the other wolves so you all know each other. If you're the only wolf, you may look at one of the 3 center cards.",
  },
  packleader: {
    name: "Pack Leader", team: "wolf", wolf: true, max: 1, step: "packleader",
    short: "Gives a player the spare Werewolf card",
    text: "A wolf who wakes with the other wolves. Then, on their own turn, they give the spare Werewolf card to a player who isn't a wolf. Nobody is converted by magic: the two cards swap places. The player's old card goes face down into the spare slot, and the Werewolf card is now theirs, so they're on the wolf team without knowing it.",
    note: "Picking the Pack Leader adds a spare Werewolf card to the deck. It sits apart from the 3 center cards and only the Pack Leader can move it.",
  },
  prowler: {
    name: "Prowler", team: "wolf", wolf: true, max: 1, step: "prowler",
    short: "A wolf who may look at a player's card",
    text: "A wolf who wakes with the other wolves. Then, on their own turn, they may look at one other player's card.",
  },
  lackey: {
    name: "Lackey", team: "wolf", wolf: false, max: 1, step: "lackey",
    short: "Sees the wolves, wins with them",
    text: "On the wolf team, but not a wolf. Wakes to see who the wolves are; they don't learn who you are. You win if the wolves win, even if you die. If no player is a wolf, you win as long as someone other than you dies.",
  },
  scout: {
    name: "Scout", team: "wolf", wolf: false, max: 1, step: "scout",
    short: "Sees the wolves and their cards",
    text: "On the wolf team, but not a wolf. Wakes to see who the wolves are and looks at their cards, so you know whether they're still wolves. If the Scout dies, the village wins.",
  },
  mason: {
    name: "Mason", team: "village", wolf: false, max: 2, pair: true, step: "masons",
    short: "Sees the other Mason",
    text: "Masons come in pairs. They wake together and see each other. If you wake alone, the other Mason card is in the center.",
  },
  seer: {
    name: "Seer", team: "village", wolf: false, max: 1, step: "seer",
    short: "Looks at a player's card or two center cards",
    text: "May look at one other player's card, or at two of the 3 center cards.",
  },
  thief: {
    name: "Thief", team: "village", wolf: false, max: 1, step: "thief",
    short: "Swaps with a player and looks",
    text: "May swap cards with another player, then looks at the card they took. They're now on that card's team, and the other player has the Thief card.",
  },
  meddler: {
    name: "Meddler", team: "village", wolf: false, max: 1, step: "meddler",
    short: "Swaps two other players' cards",
    text: "May swap the cards of two other players without looking at them.",
  },
  sleepwalker: {
    name: "Sleepwalker", team: "village", wolf: false, max: 1, step: "sleepwalker",
    short: "Swaps with a center card blind",
    text: "Must swap their card with one of the 3 center cards, without looking at the new one.",
  },
  nightowl: {
    name: "Night Owl", team: "village", wolf: false, max: 1, step: "nightowl",
    short: "Checks their own card at the end",
    text: "Wakes last and looks at their own card, to see whether someone swapped it.",
  },
  villager: {
    name: "Villager", team: "village", wolf: false, max: 3, step: null,
    short: "No night action",
    text: "Sleeps through the night. Use the day to work out who the wolves are.",
  },
  hunter: {
    name: "Hunter", team: "village", wolf: false, max: 1, step: null,
    short: "Takes their vote down with them",
    text: "No night action. If the Hunter dies, the player the Hunter voted for dies too.",
  },
  jester: {
    name: "Jester", team: "jester", wolf: false, max: 1, step: null,
    short: "Wins only by dying",
    text: "On nobody's team. The Jester wins only if they die. If the Jester dies, the wolves can't win, though the village still can.",
  },
};

// Picker / cheat-sheet order is wake order, then the roles that sleep.
export const ROLE_ORDER = [
  "werewolf", "packleader", "prowler", "lackey", "scout", "mason", "seer",
  "thief", "meddler", "sleepwalker", "nightowl", "villager", "hunter", "jester",
];

// Night steps in wake order. `roles`: a step runs when any of these cards is in the deck
// (center included, so a skipped step never gives away that a card is in the center).
export const NIGHT_STEPS = [
  { id: "wolves", label: "Werewolves", roles: ["werewolf", "packleader", "prowler"] },
  { id: "packleader", label: "Pack Leader", roles: ["packleader"] },
  { id: "prowler", label: "Prowler", roles: ["prowler"] },
  { id: "lackey", label: "Lackey", roles: ["lackey"] },
  { id: "scout", label: "Scout", roles: ["scout"] },
  { id: "masons", label: "Masons", roles: ["mason"] },
  { id: "seer", label: "Seer", roles: ["seer"] },
  { id: "thief", label: "Thief", roles: ["thief"] },
  { id: "meddler", label: "Meddler", roles: ["meddler"] },
  { id: "sleepwalker", label: "Sleepwalker", roles: ["sleepwalker"] },
  { id: "nightowl", label: "Night Owl", roles: ["nightowl"] },
];

export const WIN_RULES = [
  ["village", "The village wins if at least one wolf dies, or if the Scout dies. If no player is a wolf, the village wins when nobody dies (or the Lackey or Scout dies)."],
  ["wolf", "The wolf team wins if no wolf and no Scout dies, and the Jester doesn't die. If no player is a wolf, the Lackey and Scout win when someone else dies."],
  ["jester", "The Jester wins if the Jester dies."],
];

// Suggested decks by player count (player count + 3 cards). Used until the host edits the picker.
const SUGGESTED = {
  3: { werewolf: 2, seer: 1, thief: 1, meddler: 1, villager: 1 },
  4: { werewolf: 2, seer: 1, thief: 1, meddler: 1, villager: 1, nightowl: 1 },
  5: { werewolf: 2, seer: 1, thief: 1, meddler: 1, villager: 1, nightowl: 1, sleepwalker: 1 },
  6: { werewolf: 2, seer: 1, thief: 1, meddler: 1, villager: 1, nightowl: 1, sleepwalker: 1, hunter: 1 },
  7: { werewolf: 2, seer: 1, thief: 1, meddler: 1, villager: 1, nightowl: 1, sleepwalker: 1, hunter: 1, jester: 1 },
  8: { werewolf: 2, seer: 1, thief: 1, meddler: 1, villager: 2, nightowl: 1, sleepwalker: 1, hunter: 1, jester: 1 },
  9: { werewolf: 2, seer: 1, thief: 1, meddler: 1, villager: 1, mason: 2, nightowl: 1, sleepwalker: 1, hunter: 1, jester: 1 },
  10: { werewolf: 2, seer: 1, thief: 1, meddler: 1, villager: 1, mason: 2, nightowl: 1, sleepwalker: 1, hunter: 1, jester: 1, lackey: 1 },
};

export function suggestedRoles(players) {
  const n = Math.max(3, players);
  if (SUGGESTED[n]) return { ...SUGGESTED[n] };
  // past 10 players: the 10-player deck plus the remaining single roles, then Villagers
  const r = { ...SUGGESTED[10] };
  let need = n + 3 - deckSize(r);
  for (const id of ["prowler", "scout", "villager", "villager", "werewolf"]) {
    if (need <= 0) break;
    if ((r[id] || 0) < ROLES[id].max) { r[id] = (r[id] || 0) + 1; need--; }
  }
  return r;
}

export function deckSize(roles) {
  return Object.values(roles).reduce((a, b) => a + b, 0);
}

// ---- emblems: original line art, 64×64, drawn with currentColor strokes ----
export const EMBLEMS = {
  werewolf: `<path d="M19 12c6 11 8 24 5 40"/><path d="M31 9c7 12 9 27 5 45"/><path d="M43 12c6 11 7 24 4 38"/>`,
  packleader: `<path d="M15 25 19 11l8 7 5-10 5 10 8-7 4 14z"/><path d="M23 33c3 6 4 13 2 21"/><path d="M32 32c3 7 4 15 2 23"/><path d="M41 33c3 6 3 13 1 20"/>`,
  prowler: `<path d="M6 32c9-13 43-13 52 0-9 13-43 13-52 0z"/><path d="M32 21c-4 6-4 16 0 22 4-6 4-16 0-22z"/>`,
  lackey: `<circle cx="32" cy="10" r="3.5"/><path d="M22 18h20l-3 29H25z"/><path d="M18 52h28"/><path d="M32 27c-4 5-4 10 0 13 4-3 4-8 0-13z"/>`,
  scout: `<circle cx="21" cy="42" r="9"/><circle cx="43" cy="42" r="9"/><path d="M14 36l5-20h6l2 17"/><path d="M50 36l-5-20h-6l-2 17"/><path d="M27 27h10"/>`,
  mason: `<circle cx="25" cy="32" r="13"/><circle cx="39" cy="32" r="13"/>`,
  seer: `<path d="M7 36c9-13 41-13 50 0-9 13-41 13-50 0z"/><circle cx="32" cy="36" r="6"/><path d="M32 9v9"/><path d="M15 14l5 7"/><path d="M49 14l-5 7"/>`,
  thief: `<path d="M7 26c8-7 18-7 25 2 7-9 17-9 25-2 0 13-8 19-14 17-5-1-6-7-11-7s-6 6-11 7C15 45 7 39 7 26z"/><circle cx="20" cy="31" r="4"/><circle cx="44" cy="31" r="4"/>`,
  meddler: `<path d="M11 22h37"/><path d="M40 13l9 9-9 9"/><path d="M53 42H16"/><path d="M24 33l-9 9 9 9"/>`,
  sleepwalker: `<path d="M41 13a19 19 0 1 0 13 31 15 15 0 1 1-13-31z"/><path d="M11 12h9l-9 9h9"/><path d="M24 24h6l-6 6h6"/>`,
  nightowl: `<path d="M14 20c0-6 6-10 10-6 5-3 11-3 16 0 4-4 10 0 10 6v18c0 10-8 18-18 18s-18-8-18-18z"/><circle cx="25" cy="32" r="6"/><circle cx="39" cy="32" r="6"/><path d="M29 41l3 5 3-5z"/>`,
  villager: `<path d="M10 31 32 13l22 18"/><path d="M17 26v25h30V26"/><path d="M28 51V38h8v13"/>`,
  hunter: `<circle cx="32" cy="32" r="17"/><path d="M32 7v13"/><path d="M32 44v13"/><path d="M7 32h13"/><path d="M44 32h13"/><circle cx="32" cy="32" r="2.5" fill="currentColor"/>`,
  jester: `<path d="M12 47c4-12 6-25 2-33 8 4 14 12 18 22 4-10 10-18 18-22-4 8-2 21 2 33z"/><circle cx="14" cy="10" r="3.5"/><circle cx="50" cy="10" r="3.5"/><path d="M12 47h40"/>`,
  back: `<path d="M38 14a18 18 0 1 0 12 30 14 14 0 1 1-12-30z"/><path d="M14 16v6M11 19h6"/><path d="M50 50v4M48 52h4"/><path d="M18 48v4M16 50h4"/>`,
};

export function emblemSvg(id, cls = "ms-emblem") {
  return `<svg class="${cls}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${EMBLEMS[id] || EMBLEMS.back}</svg>`;
}
