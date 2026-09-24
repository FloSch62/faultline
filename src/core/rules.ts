/** Every tunable combat number lives here. Rules code, card text, the HUD and the
 * handbook all read this object, so explanations never drift from balance tuning.
 * v5: moved out of cards.ts (which, like run.ts, re-exports it); the card data files
 * (src/core/cards/*.ts) import only this module and card-types.ts. */
export const RULES = {
  // ------------------------------------------------ v5 · Three Energy: the economy (contract section 1)
  /** Energy every turn before relics. */
  baseEnergy: 3,
  /** Energy relics raise the turn base, never above this: turnEnergyBase = min(cap, base + relics).
   * Temporary energy (PoE Injectors online, next-turn energy, Reserve Cell, cards) comes on top, uncapped. */
  relicEnergyCap: 5,
  handDraw: 5,
  handLimit: 10,
  /** Removal keeps at least this many cards (curses can always go), one router card and two cabling cards. */
  deckFloor: 8,
  // Rewards (section 4): each slot picks the keeper pool at this share, else colorless (the other
  // pool when a rarity is empty); then a rarity: [common, uncommon, rare] per room kind.
  keeperShare: 0.55,
  rewardRarity: { normal: [0.65, 0.32, 0.03], elite: [0.55, 0.37, 0.08], guardian: [0, 0.5, 0.5] },
  /** Share of rare rolls that become legendary (Clabernetes). */
  legendaryShare: 0.05,
  /** Share of offered cards that arrive upgraded, per stage. */
  upgradedOfferRate: [0, 0.12, 0.25],
  // Enemy health (section 5), read live so the balance probe can --rule them:
  /** Normal room: base + per floor × floor + per stage × stage (zero-based). */
  normalHealth: [20, 5, 16],
  /** Elite room: base + per floor × floor + per stage × stage. */
  eliteHealth: [38, 3, 13],
  /** Guardian health per stage. */
  guardianHealth: [90, 128, 176],
  /** Payload token: damage this turn (Payload+ reads its own card values). */
  payloadDamage: 2,

  maxDevices: 14,
  deviceSpacing: 1.55,
  debrisClearance: 1.3,
  relocateCost: 1,
  scrubCost: 1,
  maxProtocols: 2,
  /** v3 malware cap; v4 uses maxInstallations. Kept until the engine migrates. */
  maxMalware: 3,
  // Route damage (primary route)
  baseRouteDamage: 5,
  switchDamage: 1,
  packetLensSwitchDamage: 2,
  configuredDamage: 1,
  overclockDamage: 2,
  compressionDamage: 2,
  amplifiedCableDamage: 1,
  /** Unarmored cable whose span crosses a wreck's scorched ring. */
  frayedCableDamage: 1,
  resonanceDamage: 3,
  suppressionPenalty: 3,
  // Network terms
  bandwidthPerChannel: 3,
  parallelCorePerChannel: 4,
  balancerPerChannel: 1,
  clusterThreshold: 3,
  clusterDamage: 2,
  malwarePenalty: 2,
  exposedBonus: 3,
  bgpHijackDamage: 3,
  // Engines
  bufferMultiplier: 1.5,
  /** Share of shield-prevented damage the Warden's Backpressure stores. */
  backpressureRatio: 1,
  // Defense
  firewallBreachBlock: 2,
  firewallStrikeBlock: 1,
  aegisShield: 3,
  nullFieldShield: 2,
  separatedCircuitShield: 3,
  shieldArrayPrevent: 2,
  watchdogShield: 5,
  hardenShield: 1,
  hardenPerFirewall: 1,
  /** v4 · M4 design addition, PENDING THE USER'S APPROVAL (docs/balance-v4.json, CONTRACT §7):
   * Harden also gains this much block per living hostile beyond the first, like Quorum, ... */
  hardenPerHostile: 0,
  /** ... and this much more per living guardian add. With one hostile and no adds Harden is
   * unchanged (the single-hostile invariant). 0 and 0 restore the design's Harden. */
  hardenPerAdd: 0,
  // Traps
  honeypotDamage: 3,
  honeynetBonus: 2,
  honeynetShield: 2,
  // Hostile pressure
  corrosionDamage: 2,
  wormDamage: 2,
  bgpHijackEnemyBonus: 2,
  gradedArmorBase: 4,
  gradedArmorPerChannel: 2,
  serpentBonus: 3,
  weaverBonus: 2,
  weaverCables: 6,
  cableExposureLength: 6,
  leechHeal: 3,
  leechTapHeal: 1,
  // Fields
  alliedFieldTurns: 3,
  hostileFieldTurns: 2,

  // ------------------------------------------------ v4 · Under Quarantine
  // Every value below is a design constant from Proposal 4 (design.html §11.1).
  // The phase flags turn a whole layer off for the balance probe's A/B runs:
  //   packRate: [0, 0, 0] · maxInstallations: 0 with deviceCondition: 99 ·
  //   escalationStart: 99 (levels and the guardians' charge at half health) ·
  //   designationRate: [0, 0, 0] with reinforcementRate
  //   and signalRate [0, 0, 0] and crateEmptyShare: 1 · addBreakBonus: 0 (also raises no adds).
  // Packs and ports
  /** Share of normal rooms holding a pack, per stage (stage I from the third floor). */
  packRate: [0.25, 0.40, 0.55],
  /** Zero-based floor from which stage I rolls escort duos. */
  packFromFloor: 2,
  /** Share of stage III packs that are trios. */
  trioShare: 0.40,
  /** A pack's summed health is this multiple of the room's single-hostile health. */
  packHealthScale: 1.15,
  packShares: { duo: [0.575, 0.575], pair: [0.75, 0.40], trio: [0.63, 0.26, 0.26] },
  /** Reinforcement health: 0.40 × in a single's room, 0.26 × beside a leader and escort. */
  reinforcementShares: { single: 0.40, pair: 0.26 },
  /** Threat budget: packs ≤ 1.3 × the stage's average single threat; reinforced fights ≤ 1.45 ×. */
  threatBudget: 1.3,
  reinforcedThreatBudget: 1.45,
  /** Each add alive when the ultimate resolves raises the break threshold (ascension 10: +1).
   * Balance v4 (docs/balance-v4.json): 3 → 4; the breaking keepers interrupted 76–84 % of ultimates. */
  addBreakBonus: 4,
  // The table front
  maxInstallations: 4,
  /** Adjacency radius for every reach effect: Jammers, Spikes, charges, racks, quarantine, bites. */
  reach: 2.0,
  /** Reach sockets: twelve compass points at the first radius, then the second. */
  reachRings: [1.6, 2.0],
  deviceCondition: 2,
  salvageCondition: 1,
  repairCost: 1,
  /** Scrub cost per integrity point while a Quarantine Drone lives. */
  quarantineScrubCost: 2,
  breakerCountdown: 2,
  quarantineDamage: 1,
  sentryQuarantine: 2,
  /** Integrity an installation loses when planted within reach of a cabled Honeypot. */
  honeypotBite: 1,
  reclaimShield: 2,
  /** Sentry Firewall: extra shield when its quarantine destroys an installation. */
  sentryReclaimBonus: 2,
  rackCondition: 3,
  wreckCap: 6,
  // Escalation (disruption levels on the leader's own action counter)
  escalationStart: 4,
  escalationEvery: 3,
  escalationStartLate: 3,
  escalationEveryLate: 2,
  // Designations and surprises
  designationRate: [0.20, 0.35, 0.50],
  designationFromFloor: 2,
  hiddenShare: [0.30, 0.40, 0.50],
  reinforcementRate: [0, 0.15, 0.25],
  reinforcementCount: 2,
  eliteReinforcementCount: 3,
  signalRate: [0, 0.10, 0.15],
  signalTurn: 3,
  /** Crate contents: salvage 30 %, credits 25 %, encounter card 20 %, empty 25 %. */
  crateWeights: { salvage: 0.30, credits: 0.25, card: 0.20, empty: 0.25 },
  crateEmptyShare: 0.25,
  /** Share of non-empty crates that also carry an undelivered message. */
  crateMessageShare: 0.25,
  /** Balance v4: crates, fallback, messages, pack and designation credits were cut so a run earns
   * +8–10 % over v3 (the probe measured +21 % at the design values: crate salvage falls back to
   * credits far more often than 11.4 assumed, because the last body usually carries it). */
  crateCredits: [3, 6],
  crateFallbackCredits: 3,
  messageCredits: 6,
  messageRestore: 2,
  // Credits
  packCredits: 2,
  designationCredits: 1,
  reinforcementCredits: 3,
  // Designation numbers
  hardenedHealth: 0.20,
  hardenedStrike: 1,
  armoredPlating: 2,
  hungryHeal: 2,
  // Escort and add numbers
  wardPlating: 2,
  choirAddPlating: 3,
  lastEchoBonus: 3,
  riggedSpikeIntegrity: 3,
  // Relics
  roundRobinDamage: 2,
  scorchedEarthDamage: 4,

  // ---- v4 keys added by the content agent (card, relic, trait and plate text read them;
  // the engine resolves them). Additive: nothing above was renamed.
  /** Integrity an installation arrives with, before bites, Rigging and ascension 9. */
  installationIntegrity: { tap: 1, jammer: 2, spike: 2, anchor: 3, breaker: 1 },
  /** Hard ceiling for any installation's integrity (full-cap overflow, Rigging, ascension 9). */
  maxInstallationIntegrity: 3,
  /** Hot Patch, Fast Reroute, Link Recovery and Harden restore this much condition on the most worn device. */
  faultClearRepair: 1,
  /** Redundant PSU: the device's maximum condition for this battle. */
  psuCondition: 3,
  /** Escort traits. */
  swarmBonus: 1,
  uplinkBonus: 1,
  webHeal: 1,
  /** Splicer's twin cut: cables severed while a leader lives. */
  twinCut: 2,
  /** New leaders. */
  foremanSpikeBonus: 1,
  nestHeal: 1,
  nestStrikeBonus: 1,
  demolitionArmedBonus: 2,
  blightAnchorBonus: 1,
  /** Blackout Core: enraged Total Blackout wears every primary-route device by this much. */
  blackoutWear: 1,
  /** Guardian adds: health before ascension 6 (A6 × 1.15 like the guardian). */
  addHealth: { "gate-warden": 8, chorister: 10, "quarantine-drone": 14 },
  /** Ascension 10: each living add raises the break threshold by this much instead. */
  addBreakBonusLate: 5,
  /** Stoked: escalation levels arrive this many actions sooner (stage III: the late value). */
  stokedAdvance: 1,
  stokedAdvanceLate: 2,
  /** Signals: RELAY FLICKER and INTERFERENCE fields last this many turns. */
  signalFieldTurns: 2,
  /** Ascension 9 adds this share to every stage's pack rate. */
  packRateAscensionBonus: 0.15,
  /** v4 ascension riders (section 10.4), tuned by the ascension pass (docs/balance-v4.json: A10 was
   * 2 / 4 / 4 %, v3's band is 5–9 %): ascension 6 — adds' integrity multiple (design 1.15 → 1), and
   * the wear Close the Gates / Stolen Voice add; */
  ascensionAddHealth: 1,
  ascensionRiderWear: 1,
  /** ascension 7 — the chance an elite carries a second designation (design 1 → 0.5); ascension 10 —
   * the share of a normal room's designation chance that rolls a second (1 → 0.5); */
  eliteSecondDesignation: 0.5,
  normalSecondDesignation: 0.5,
  /** ascension 9 — extra integrity every installation arrives with (design 1 → 0); ascension 10 —
   * Breaker Charges a guardian's charge plants beside the primary router (0 or 1). */
  ascensionInstallationIntegrity: 0,
  ascensionChargeBreaker: 1,
  /** Signal in the Static: the empowered fight's health multiple. */
  eventHealthScale: 1.4,
  /** Undelivered message: Reinforce raises maximum integrity by this much. */
  messageMaxIntegrity: 1,
  /** Relics. */
  ingressFilterReduce: 1,
  priorityQueueBonus: 1,
  reinforcedFrameCondition: 1,
  stormControlDamage: 1,
  scorchedEarthCondition: 1,
} as const;
