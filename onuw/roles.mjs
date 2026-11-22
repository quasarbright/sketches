// Role definitions: names, teams, wake order, rules text and card emblems.
// Pure data, shared by the engine (rules) and the page (cards, cheat sheet).
import { NAMES as N, ART } from "./skin.mjs";

export const TEAMS = {
  village: { name: "Village", color: "#5aa9e6", letter: "V" },
  wolf: { name: "Wolf team", color: "#e0485a", letter: "W" },
  jester: { name: "On their own", color: "#f2a541", letter: "S" },
};

// `max`: how many copies the role picker allows. `pair`: comes in twos (Masons).
// `wolf`: counts as a Werewolf (wakes with the wolves, killing one wins it for the village).
// `more`: the rules need more than the card's one line, so the card gets an info button.
// `step`: the night step this role acts in (see NIGHT_STEPS), or null for no night action.
export const ROLES = {
  copycat: {
    more: true, name: N.copycat, team: "village", wolf: false, max: 1, step: "copycat",
    short: "Becomes a center card's role",
    text: "You wake first and look at one of the 3 center cards. You become that role: you're on its team, and you wake again on its turn to do what it does.",
  },
  lookalike: {
    more: true, name: N.lookalike, team: "village", wolf: false, max: 1, step: "lookalike",
    short: "Copies another player's role",
    text: "You look at another player's card and become that role: you're on its team, and you wake again on its turn to do what it does. Whoever holds your card at the end is the role you copied.",
  },
  werewolf: {
    more: true, name: N.werewolf, team: "wolf", wolf: true, max: 3, step: "wolves",
    short: "Sees the other wolves",
    text: "You wake with the other wolves and see who they are. If you're the only wolf, you may look at one of the 3 center cards.",
  },
  packleader: {
    more: true, name: N.packleader, team: "wolf", wolf: true, max: 1, step: "packleader",
    short: `Gives a player the spare ${N.werewolf} card`,
    text: `You're a wolf and wake with the other wolves. Then, on your own turn, you give the spare ${N.werewolf} card to a player who isn't a wolf. The two cards swap places: that player now holds the ${N.werewolf} card and is on the wolf team without knowing it, and their old card goes face down into the spare slot.`,
    note: `Picking the ${N.packleader} adds a spare ${N.werewolf} card to the deck. It sits apart from the 3 center cards and only the ${N.packleader} can move it.`,
  },
  prowler: {
    name: N.prowler, team: "wolf", wolf: true, max: 1, step: "prowler",
    short: "A wolf who may look at a player's card",
    text: "You're a wolf and wake with the other wolves. Then, on your own turn, you may look at one other player's card.",
  },
  greatwolf: {
    name: N.greatwolf, team: "wolf", wolf: true, max: 1, step: null,
    short: "Their vote counts twice",
    text: "You're a wolf and wake with the other wolves. When you vote, your vote counts as two.",
  },
  dozingwolf: {
    more: true, name: N.dozingwolf, team: "wolf", wolf: true, max: 1, step: null,
    short: "A wolf who sleeps through the night",
    text: "You're a wolf, but you don't wake up, so you don't know who the other wolves are. They see who you are.",
  },
  lackey: {
    more: true, name: N.lackey, team: "wolf", wolf: false, max: 1, step: "lackey",
    short: "Sees the wolves, wins with them",
    text: "You're on the wolf team, but you aren't a wolf. You wake and see who the wolves are; they don't learn who you are. You win if the wolves win, even if you die. If no player is a wolf, you win as long as someone other than you dies.",
  },
  scout: {
    more: true, name: N.scout, team: "wolf", wolf: false, max: 1, step: "scout",
    short: "Sees the wolves and their cards",
    text: `You're on the wolf team, but you aren't a wolf. You wake, see who the wolves are and look at their cards, so you know whether they're still wolves. If you die, the village wins.`,
  },
  apprentice: {
    more: true, name: N.apprentice, team: "jester", wolf: false, max: 1, step: "apprentice",
    short: `Wins if the ${N.jester} dies`,
    text: `You wake and see who the ${N.jester} is. You win if the ${N.jester} dies. If no player is the ${N.jester}, you win only if you die, like the ${N.jester}.`,
  },
  mason: {
    more: true, name: N.mason, team: "village", wolf: false, max: 2, pair: true, step: "masons",
    short: `Sees the other ${N.mason}`,
    text: `${N.mason}s come in pairs. You wake with the other ${N.mason} and see each other. If you wake alone, the other ${N.mason} card is in the center.`,
  },
  seer: {
    name: N.seer, team: "village", wolf: false, max: 1, step: "seer",
    short: "Looks at a player's card or two center cards",
    text: "You may look at one other player's card, or at two of the 3 center cards.",
  },
  noviceseer: {
    name: N.noviceseer, team: "village", wolf: false, max: 1, step: "noviceseer",
    short: "Looks at one center card",
    text: "You may look at one of the 3 center cards.",
  },
  watcher: {
    name: N.watcher, team: "village", wolf: false, max: 1, step: "watcher",
    short: `Sees who the ${N.seer} is`,
    text: `You wake and see who started as the ${N.seer} or ${N.noviceseer}, and what card they hold now.`,
  },
  investigator: {
    more: true, name: N.investigator, team: "village", wolf: false, max: 1, step: "investigator",
    short: "Looks at up to two cards, may turn",
    text: `You may look at up to two other players' cards, one at a time. If you see a wolf or the ${N.jester}, you stop and become that role, on its team.`,
  },
  thief: {
    name: N.thief, team: "village", wolf: false, max: 1, step: "thief",
    short: "Swaps with a player and looks",
    text: `You may swap cards with another player, then look at the card you took. You're now on that card's team, and the other player has the ${N.thief} card.`,
  },
  meddler: {
    name: N.meddler, team: "village", wolf: false, max: 1, step: "meddler",
    short: "Swaps two other players' cards",
    text: "You may swap the cards of two other players without looking at them.",
  },
  imp: {
    name: N.imp, team: "village", wolf: false, max: 1, step: "imp",
    short: "Swaps any two players' cards",
    text: "You may swap the cards of any two players, yours included, without looking at them.",
  },
  sleepwalker: {
    name: N.sleepwalker, team: "village", wolf: false, max: 1, step: "sleepwalker",
    short: "Swaps with a center card blind",
    text: "You must swap your card with one of the 3 center cards, without looking at your new one.",
  },
  aurareader: {
    name: N.aurareader, team: "village", wolf: false, max: 1, step: "aurareader",
    short: "Sees who moved or looked at a card",
    text: "You wake near the end and see which players moved or looked at a card during the night.",
  },
  nightowl: {
    name: N.nightowl, team: "village", wolf: false, max: 1, step: "nightowl",
    short: "Checks their own card at the end",
    text: "You wake last and look at your own card, to see whether someone swapped it.",
  },
  unveiler: {
    more: true, name: N.unveiler, team: "village", wolf: false, max: 1, step: "unveiler",
    short: "Turns a player's card face up",
    text: `You wake last and may turn another player's card face up for everyone to see during the day. If it's a wolf or the ${N.jester}, you turn it back face down and only you saw it.`,
  },
  villager: {
    name: N.villager, team: "village", wolf: false, max: 3, step: null,
    short: "No night action",
    text: "You sleep through the night. Use the day to work out who the wolves are.",
  },
  hunter: {
    name: N.hunter, team: "village", wolf: false, max: 1, step: null,
    short: "Takes their vote down with them",
    text: "No night action. If you die, the player you voted for dies too.",
  },
  witch: {
    more: true, name: N.witch, team: "village", wolf: false, max: 1, step: "witch",
    short: "Swaps a center card with another player's card",
    text: "You may look at one of the 3 center cards. If you do, you must swap it with any player's card, your own included. That player doesn't see it.",
  },
  bodyguard: {
    more: true, name: N.bodyguard, team: "village", wolf: false, max: 1, step: null,
    short: "Protects whoever they vote for",
    text: `No night action. The player you vote for can't die. If they get the most votes, the player with the next most votes dies instead, and the ${N.hunter} can't take them down.`,
  },
  prince: {
    more: true, name: N.prince, team: "village", wolf: false, max: 1, step: null,
    short: "Can't be killed",
    text: `No night action. You can't die: if you get the most votes, the player with the next most votes dies instead, and the ${N.hunter} can't take you down.`,
  },
  cursed: {
    more: true, name: N.cursed, team: "village", wolf: false, max: 1, step: null,
    short: "A wolf's vote turns them wolf",
    text: `No night action. You're on the village team, but if any wolf votes for you, you become a ${N.werewolf}: you're on the wolf team, and if you die, a wolf died.`,
  },
  jester: {
    more: true, name: N.jester, team: "jester", wolf: false, max: 1, step: null,
    short: "Wins only by dying",
    text: "You're on nobody's team, and you win only if you die. If you die, the wolves can't win, though the village still can.",
  },
};

// Picker / cheat-sheet order is wake order, then the roles that sleep.
export const ROLE_ORDER = [
  "copycat", "lookalike", "werewolf", "packleader", "prowler", "greatwolf", "dozingwolf", "lackey", "scout",
  "apprentice", "mason", "seer", "noviceseer", "watcher", "investigator", "thief", "witch", "meddler", "imp",
  "sleepwalker", "aurareader", "nightowl", "unveiler", "villager", "hunter", "bodyguard", "prince", "cursed", "jester",
];

// Night steps in wake order. `roles`: a step runs when any of these cards is in the deck
// (center included, so a skipped step never gives away that a card is in the center).
export const NIGHT_STEPS = [
  { id: "copycat", label: N.copycat, roles: ["copycat"] },
  { id: "lookalike", label: N.lookalike, roles: ["lookalike"] },
  { id: "wolves", label: N.werewolves, roles: ["werewolf", "packleader", "prowler", "greatwolf", "dozingwolf"] },
  { id: "packleader", label: N.packleader, roles: ["packleader"] },
  { id: "prowler", label: N.prowler, roles: ["prowler"] },
  { id: "lackey", label: N.lackey, roles: ["lackey"] },
  { id: "scout", label: N.scout, roles: ["scout"] },
  { id: "apprentice", label: N.apprentice, roles: ["apprentice"] },
  { id: "masons", label: `${N.mason}s`, roles: ["mason"] },
  { id: "seer", label: N.seer, roles: ["seer"] },
  { id: "noviceseer", label: N.noviceseer, roles: ["noviceseer"] },
  { id: "watcher", label: N.watcher, roles: ["watcher"] },
  { id: "investigator", label: N.investigator, roles: ["investigator"] },
  { id: "thief", label: N.thief, roles: ["thief"] },
  { id: "witch", label: N.witch, roles: ["witch"] },
  { id: "meddler", label: N.meddler, roles: ["meddler"] },
  { id: "imp", label: N.imp, roles: ["imp"] },
  { id: "sleepwalker", label: N.sleepwalker, roles: ["sleepwalker"] },
  { id: "aurareader", label: N.aurareader, roles: ["aurareader"] },
  { id: "nightowl", label: N.nightowl, roles: ["nightowl"] },
  { id: "unveiler", label: N.unveiler, roles: ["unveiler"] },
];

// How each team wins, mentioning only the cards in this deck (all of them when there's no deck yet).
export function winRules(roles) {
  const all = !roles || !Object.values(roles).some(Boolean);
  const has = (r) => all || !!roles[r];
  const list = (xs) => xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs[0] || "";
  const helpers = [has("lackey") && `the ${N.lackey}`, has("scout") && `the ${N.scout}`].filter(Boolean);
  const skinner = has("jester") || has("apprentice");
  const rules = [
    ["village", `The village wins if at least one wolf dies${has("cursed") ? ` (a ${N.cursed} a wolf voted for counts as a wolf)` : ""}${has("scout") ? `, or if the ${N.scout} dies` : ""}. If no player is a wolf, the village wins when nobody dies${helpers.length ? ` (or ${helpers.join(" or ")} dies)` : ""}.`],
    ["wolf", `The wolf team wins if no wolf${has("scout") ? ` and no ${N.scout}` : ""} dies${skinner ? `, and the ${N.jester} doesn't die` : ""}.${helpers.length ? ` If no player is a wolf, ${list(helpers)} win when someone else dies.` : ""}`],
  ];
  if (skinner) {
    const t = [];
    if (has("jester")) t.push(`The ${N.jester} wins if the ${N.jester} dies.`);
    if (has("apprentice")) t.push(`The ${N.apprentice} wins if the ${N.jester} dies, or, with no ${N.jester} among the players, if the ${N.apprentice} dies.`);
    rules.push(["jester", t.join(" ")]);
  }
  return rules;
}

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
  scout: `<path d="M14 12h36v18c0 13-8 21-18 26-10-5-18-13-18-26z"/><path d="M32 12v44"/><path d="M14 28h36"/>`,
  mason: `<circle cx="25" cy="32" r="13"/><circle cx="39" cy="32" r="13"/>`,
  seer: `<path d="M7 36c9-13 41-13 50 0-9 13-41 13-50 0z"/><circle cx="32" cy="36" r="6"/><path d="M32 9v9"/><path d="M15 14l5 7"/><path d="M49 14l-5 7"/>`,
  thief: `<path d="M7 26c8-7 18-7 25 2 7-9 17-9 25-2 0 13-8 19-14 17-5-1-6-7-11-7s-6 6-11 7C15 45 7 39 7 26z"/><circle cx="20" cy="31" r="4"/><circle cx="44" cy="31" r="4"/>`,
  meddler: `<path d="M11 22h37"/><path d="M40 13l9 9-9 9"/><path d="M53 42H16"/><path d="M24 33l-9 9 9 9"/>`,
  sleepwalker: `<path d="M27 8h10v12c6 3 9 8 9 14v18a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V34c0-6 3-11 9-14z"/><path d="M18 38h28"/>`,
  nightowl: `<path d="M14 20c0-6 6-10 10-6 5-3 11-3 16 0 4-4 10 0 10 6v18c0 10-8 18-18 18s-18-8-18-18z"/><circle cx="25" cy="32" r="6"/><circle cx="39" cy="32" r="6"/><path d="M29 41l3 5 3-5z"/>`,
  villager: `<path d="M10 31 32 13l22 18"/><path d="M17 26v25h30V26"/><path d="M28 51V38h8v13"/>`,
  hunter: `<circle cx="32" cy="32" r="17"/><path d="M32 7v13"/><path d="M32 44v13"/><path d="M7 32h13"/><path d="M44 32h13"/><circle cx="32" cy="32" r="2.5" fill="currentColor"/>`,
  jester: `<path d="M8 8h48v48H8z"/><path d="M20 16c4 4 8 4 12 0 4 4 8 4 12 0 0 6 4 10 4 16s-4 10-4 16c-4-4-8-4-12 0-4-4-8-4-12 0 0-6-4-10-4-16s4-10 4-16z"/>`,
  witch: `<path d="M32 6 20 30h24z"/><path d="M12 30h40"/><path d="M22 52c0-8 4-14 10-14s10 6 10 14z"/><path d="M14 56h36"/>`,
  bodyguard: `<path d="M32 8 12 16v14c0 13 9 22 20 26 11-4 20-13 20-26V16z"/><path d="M24 32l6 6 11-12"/>`,
  prince: `<path d="M12 46 10 20l12 10 10-16 10 16 12-10-2 26z"/><path d="M12 54h40"/>`,
  cursed: `<circle cx="32" cy="32" r="22"/><path d="M38 14a18 18 0 1 0 0 36 14 14 0 1 1 0-36z"/>`,
  back: `<path d="M38 14a18 18 0 1 0 12 30 14 14 0 1 1-12-30z"/><path d="M14 16v6M11 19h6"/><path d="M50 50v4M48 52h4"/><path d="M18 48v4M16 50h4"/>`,
};

export function emblemSvg(id, cls = "ms-emblem") {
  if (ART[id]) return `<img class="${cls} ms-art-img" src="${ART[id]}" alt="" aria-hidden="true">`;
  return `<svg class="${cls}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${EMBLEMS[id] || EMBLEMS.back}</svg>`;
}
