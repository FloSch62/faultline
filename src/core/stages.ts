/** Floors stay local to a stage, so every route chart remains readable. */
export const STAGES = [
  {
    name: "The Copper Reach", numeral: "I", boss: "regent", bossHp: 67,
    art: { panorama: "relay-cathedral.png", battle: "relay-interior.png" },
    music: {
      explore: "paths-of-copper",
      battle: ["the-second-way-home", "signal-and-steel", "copperlight-pursuit"],
      elite: "a-thousand-fractures", boss: "the-second-way-home",
    },
    description: "The outer relays have become a kingdom of rust. Reopen the copper gates and carry a living signal past their iron keeper.",
    fragment: "No passage without proof of a second way home.",
    chapters: ["The Sunken Relay", "Fractured Frequencies", "The Hollow Exchange", "The Copper Gate", "Echoes in the Copper", "The Warming Bench", "The Iron Regent"],
    encounters: ["leech", "wraith", "prophet", "serpent", "moth"],
    elites: ["sentinel", "colossus", "weaver"],
  },
  {
    name: "The Glass Cathedral", numeral: "II", boss: "cantor", bossHp: 96,
    art: { panorama: "stages/glass-cathedral.png", battle: "stages/glass-interior.png" },
    music: {
      explore: "prismatic-silence",
      battle: ["shatter-the-choir", "ghosts-in-the-relay"],
      elite: "shatter-the-choir", boss: "shatter-the-choir",
    },
    description: "Beyond the gate, voices ring through glass routes that no longer lead anywhere. The Hollow Choir turns every answered signal into another layer of silence.",
    fragment: "One voice is an echo. Many voices can break the glass.",
    chapters: ["The Singing Wires", "Prismatic Crossroads", "The Bellmaker's Refuge", "Choirs of Static", "A Thousand Reflections", "The Quiet Vestry", "The Hollow Choir"],
    encounters: ["storm", "widow", "marshal", "choir", "weaver"],
    elites: ["marshal", "widow", "colossus"],
  },
  {
    name: "The Blackout Heart", numeral: "III", boss: "core", bossHp: 132,
    art: { panorama: "stages/blackout-heart.png", battle: "stages/blackout-interior.png" },
    music: {
      explore: "messages-in-the-dark",
      battle: ["deliver-the-dawn", "redline-protocol"],
      elite: "deliver-the-dawn", boss: "the-blackout-core",
    },
    description: "The last messages are still waiting behind the quarantine shell. Cross the failing backbone and show its keeper that a safe route finally exists.",
    fragment: "Retained. Not delivered. Not discarded.",
    chapters: ["The Dead Backbone", "Redline Crossing", "The Keeper's Drawer", "Beyond the Firewall", "The Undelivered", "The Last Safe Port", "The Blackout Core"],
    encounters: ["colossus", "reaver", "serpent", "marshal", "choir", "weaver", "moth", "widow"],
    elites: ["reaver", "colossus", "sentinel"],
  },
] as const;

export const SECTORS_PER_STAGE = 7;
