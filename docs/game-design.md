# FAULTLINE — alpha game design

The player restores a living network while an enemy tries to cut it apart. The central decision is how to spend five energy: establish a better route, make it survive disruption, block the announced attack, or spend a limited burst to end the encounter first. Every permanent construction changes the following turns. Every damage number has a visible cause.

This document describes the implemented alpha rules. It is also the balance reference for subsequent tuning. Card and relic definitions live in `src/core/cards.ts`; combat and its UI forecast share `combatPreview` in `src/core/run.ts`.

## The expedition

One expedition is seven sectors long. Choose one reachable room in each sector; the next room must be in the same or an adjacent lane. The final room is always the Blackout Core.

| Sector | Left / center / right             |
| ------ | --------------------------------- |
| 1      | Battle / battle / battle          |
| 2      | Battle / cache / battle           |
| 3      | Maintenance / battle / cache      |
| 4      | Elite / battle / elite            |
| 5      | Battle / cache / battle           |
| 6      | Maintenance / elite / maintenance |
| 7      | Blackout Core                     |

A victory or cache offers three different cards. Take one or skip; taking everything can dilute a useful deck. An elite additionally offers three unowned relics; take one. Maintenance grants one service: restore up to four integrity, choose a relic, or remove one deck card. Removal preserves at least ten cards, the last basic Core Router and the last two Optic Fibers. Earned rare or legendary cards may be removed normally.

Integrity persists between rooms. Topology, faults, upgrades, protection, block, energy, exhaust and combat piles reset for every encounter. The deck and installed relics persist. Loss at zero integrity ends the expedition. Defeating the final boss and finishing its reward ends it in victory.

### Three starting approaches

| Archetype | Integrity | Starting relic | Deck variation                                                                                 | Intended learning                                            |
| --------- | --------: | -------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Architect |        14 | Hot Swap       | One Fiber becomes Duplex; Switch becomes Relay. 19 cards.                                      | Build flexible infrastructure with the free first Fiber.     |
| Warden    |        16 | Shield Array   | One Router becomes Hardened Router; Firewall becomes Bastion; Surge becomes Barrier. 19 cards. | Read incoming attacks and build a lasting firewall boundary. |
| Ghost     |        12 | Deep Cache     | Two Fibers become Crosslinks; Firewall becomes Pulse; one Patch becomes Deep Scan. 19 cards.   | Convert draw and limited burst into a quick decisive route.  |

The standard deck is three Core Routers, one Edge Switch, one Trust Gate, six Optic Fibers, one Hot Patch, one Purge Field, one Faraday Shell, one Power Surge, one Packet Guard, one Resonance Field, one Startup Config, and one Clab Inspect.

Opening hands guarantee one Core Router and two Optic Fibers when those cards are present. Fill to six cards, or seven with Deep Cache. A basic router plus two fibers costs four before discounts and produces five damage. Containerlab and Clabernetes never start in a new deck and are never guaranteed draws, even after earning them. Ordinary construction, configuration, and placement are the foundation of the expedition; finding either signature orchestration card is a special reward.

## Turn rules and resources

- A normal turn has five energy. Cold Start adds one only on the encounter's first turn. Reserve Cell carries at most two unused energy; Capacitors add their reserved energy to the next turn. Other unused energy is lost.
- Draw six at the start of every turn, plus one with Deep Cache. The hand limit is ten; cards beyond the limit remain in the draw pile. When drawing from an empty pile, shuffle the discard pile using the expedition RNG.
- Playing a card spends its displayed energy and removes it from hand. A normal card enters discard. An Exhaust card enters a separate exhausted pile for the remainder of this encounter. Unplayed cards, including unplayed Exhaust cards, go to discard at end of turn.
- All zero-cost draw/energy cards exhaust. Power Surge is moved to exhaust before drawing, so it cannot draw itself from an otherwise empty deck. The deck cannot create an infinite energy/draw loop.
- Relocating a deployed device costs one energy; a position left unchanged costs nothing. Terminals cannot move. Invalid moves leave both board and energy untouched.
- Hardware and links remain on the table for the encounter. Fourteen devices including both terminals fit on the table. Device centers must be at least 1.55 units apart; placement must be within the visible build grid.
- Block and packet boosts last for the current turn only. Block expires even if the enemy does not attack. A boost cannot damage the enemy without a live router route; it expires even if that route remains broken.
- Jam and sever each last for the following player turn. Repairs clear both immediately. Faraday Shell clears its target's existing jam. An enemy action clears the old faults before installing a new one.

### End-turn order

1. Compute and display the exact best signal route, damage terms, announced enemy action, disruption target and integrity forecast.
2. Deal the packet damage. If it kills, cancel the entire enemy action and grant rewards. Repair Drone restores two integrity after the victory.
3. Otherwise resolve any forecast Packet Leech healing, apply the announced action, clear old faults, install its new fault, and deduct the forecast integrity damage. A boss phase transition caused by this packet takes effect on the next displayed intent, never retroactively changes the attack the player saw.
4. Decrement existing zone fields, remove expired fields, then install any newly announced hostile field with its full two-turn lifetime.
5. Discard the remaining hand; expire block and packet boosts; recharge and draw the next hand. Check integrity loss.

Lethal forecasts show zero incoming damage and no disruption target. Preview calculation consumes no RNG and mutates no state. Resolution uses those same computed numbers and target.

## Why a route deals that much damage

A signal must travel from ALPHA to OMEGA through at least one router. Cables are undirected. A direct terminal cable or a switch-only path does not carry a valid attack. A jammed device or severed cable cannot be part of a live route.

| Damage term                                                 |      Amount | Stacking rule                                |
| ----------------------------------------------------------- | ----------: | -------------------------------------------- |
| Live router route                                           |           5 | Once                                         |
| Startup Config on a router on route                         |          +1 | Once                                         |
| Overclocked router on route                                 |          +2 | Once, even with multiple overclocked routers |
| Firewall on route                                           |          +1 | Once                                         |
| Switches on route                                           |     +1 each | Maximum +2                                   |
| Packet Compression on a switch on route                     |          +2 | Once                                         |
| Amplified cables on route                                   |     +1 each | Maximum +2                                   |
| Two independent live router routes anywhere in the topology |          +2 | Once                                         |
| Parallel Core with independent routes                       |          +2 | Once                                         |
| Packet Lens with a routed switch                            |          +1 | Once                                         |
| Packet Burst, Mirror Protocol, Zero Day, Wireshark          | Card amount | Sum for this turn only                       |
| Resonance on a band crossed by deployed route hardware      |          +3 | Once per active band                         |
| Suppression on a band crossed by deployed route hardware     |          −3 | Once per active band                         |
| Ferric Colossus armor, without two independent routes        |          −3 | Once                                         |
| Sentinel plating, without a routed firewall                 |          −2 | Once                                         |

Independent means the routes share no internal device; sharing ALPHA and OMEGA is allowed. Two paths that both pass through the same firewall or switch are not independent. A shared bottleneck is therefore a real strategic weakness.

Every damage term, including Sentinel's negative armor term, sums to final packet damage. The game picks the highest final-damage live route, with firewall protection, shorter length and stable device order as tie-breakers. Routing uses a bounded subset search over fourteen devices, rather than taking the first DFS path or stopping after an arbitrary number of candidates. The strongest amplified-cable representative is retained for each device subset and endpoint, preserving both optimal damage and independence checks.

Examples:

- A basic router route deals **5**. Configure it with Startup Config: **5 + 1 = 6**. Against a Sentinel without a routed firewall: **5 + 1 − 2 plating = 4**.
- A rare Containerlab route: **5 route + 2 overclock = 7**.
- Legendary Clabernetes replicating it: **5 + 2 + 2 independent routes = 9**. Sever one route and the other still deals seven until repaired.
- Overclocked route through a switch and firewall: **5 + 2 + 1 + 1 = 9**. It also blocks three against a breach or one against a strike, and bypasses Sentinel plating.
- Add Packet Burst to the Containerlab example: **7 + 3 this turn = 10**.

The independence bonus measures the whole live topology. The chosen maximum-damage route can itself cross multiple branches; it need not be one member of the independent pair.

## Placement changes the fight

The table has three announced bands: **North** is `z < −1.3`, **Center** is `−1.3 ≤ z ≤ 1.3`, and **South** is `z > 1.3`. Terminals are fixed at `x = −5.3` and `x = +5.3`. A centered basic router can connect both with cables shorter than six units.

- **Separated circuits:** If any pair of live, internally independent router routes has a router in North on one route and a router in South on the other, gain two available block. Center plus North is insufficient. The search considers every qualifying pair, including a North/South pair when an earlier Center route is also present. Multiple qualifying pairs still grant only two block.
- **Cable exposure:** Cable Wraith targets the longest unarmored cable. A target longer than six units adds one integrity damage to its sever action. Moving hardware nearer the middle, splitting long spans with intermediate devices, or building protected VXLAN/armored cables can change its announced target and prevent chip damage.
- **Storm bands:** Null Storm jams only one named band. Its jam cycles North, Center, South, then repeats. Empty bands or bands containing only protected hardware dodge the jam without fallback damage. Relocating out of the announced band costs one energy, so dodging competes with card plays.
- **Nearest-device deployment:** Linux Bridge automatically links to its nearest existing device when placed. Distance ties use stable device IDs. Its placement determines the free connection; the player still has to finish a valid router route.

Separated-circuit block is recalculated from the live board, not stored in the temporary block pool. A fault that breaks one branch can remove it on the following turn. A universal length penalty is intentionally absent: cable length matters to the Wraith's visible trait. There is no hidden damage attenuation.

Rare Containerlab automatically uses a free central socket. It gives an efficient overclocked route, but accessing separated-circuit block may still require paid relocation. Clabernetes preserves the source router's configuration, overclock and cable properties; its new physical socket changes cable lengths and band membership. Cloning does not automatically guarantee spatial defense.

## Fields and hostile ground

Each band can hold one allied field and one hostile field. Recasting replaces the field on that side; it never stacks duplicates. Allied fields count down over three transmissions. Hostile fields are installed after the current attack, then affect the next two player turns. Empty bands and fixed terminals do not activate field bonuses or penalties. Every field resets between encounters.

| Card or hostile field | Effect |
| --- | --- |
| Resonance Field · 1 energy | +3 damage once for each active band crossed by deployed hardware on the chosen route. |
| Aegis Field · 1 energy | +3 shield with a live route through deployed hardware in that band. |
| Null Field · 1 energy | +2 shield while any deployed hardware occupies the band; no live route needed. |
| Purge Field · 0 energy | Removes hostile fields and device jams in a selected band, preserves allied fields, and draws one card. Exhausts before drawing. |
| Corrosion | +2 raw incoming damage while any deployed hardware occupies the band. Normal shields apply. |
| Suppression | −3 route damage in the affected band, clamped to a minimum of zero after all damage terms. |

Rust Prophet targets the most occupied band with corrosion; ties prefer Center, North, then South. Prism Widow counts deployed hardware on the best live route and targets its busiest band with suppression. Ferric Colossus alternates strikes, corrosion and breaches, and its armor absorbs three damage until two independent routes exist. Their exact targets are forecast without consuming randomness. A lethal transmission cancels the hostile field.

Dragging hardware highlights the prospective destination and compares damage, shield and integrity loss before committing. A drop costs one energy; Escape, undo, blur, a cancelled pointer, or an out-of-grid drop restores the real board. Keyboard device controls provide the same paid relocation. Fields stay on the original ground. Field placement, corruption, cleansing and movement have distinct musical cues and expanding table rings; reduced motion keeps the feedback restrained.

The player and enemy use separate painted frames. Integrity, available shield, burst, outgoing damage and all relics are grouped on the player side. Hostile integrity and its next intent are opposite. Three persistent field seals show buffs, debuffs, remaining turns and inbound threats. Long card descriptions reserve their own space; a crowded hand scrolls with explicit arrows and keeps 1–0 shortcuts.

## Why integrity damage is blocked

Available block is a capacity, not necessarily the amount an enemy will hit. Actual prevented damage is the lesser of incoming raw damage and available block.

1. Temporary block and the two-point separated-circuit bonus apply to all integrity damage this turn.
2. A firewall on the chosen live route contributes three against **breach**, or one against **strike**. Multiple firewalls do not stack this protection. A firewall on an inactive branch offers no mitigation.
3. Shield Array intercepts up to four points from the first remaining hit once per battle. It is consumed only when damage reaches it; a fully blocked attack or cancelled lethal intent does not consume it.

Faraday Shell is **jam protection**, not block. Armored Fiber is **sever protection**, not block. Grounded Core grants two temporary block at every turn start. These concepts have different explanations because they solve different problems.

If an ordinary untargeted jam hits an empty device grid, or a sever hits a grid with zero cables, it deals one exposed-backbone damage. Null Storm's announced zone jam is exempt: an empty target band is a successful dodge. If a grid exists but every eligible target is protected, disruption fails without fallback damage. There is no universal extra damage for lacking a route. Escalating pressure is the anti-stall mechanism; Packet Leech additionally heals from a lost transmission.

## Enemies and pressure

Normal health is `10 + 3 × zero-based sector`; elite health is `30 + 2 × zero-based sector`; the Blackout Core has **80 health**. A normal first encounter can be defeated by two uninterrupted basic five-damage transmissions. Enemy patterns repeat in order.

| Enemy         | Repeating intent pattern          | Distinct rule and counterplay                                                                                                                                                                          |
| ------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Packet Leech  | Strike 2 → sever → breach 3       | Restores up to 3 missing health after a transmission deals zero damage. Repair promptly or maintain a backup route. Healing is forecast and capped at maximum health.                                  |
| Cable Wraith  | Sever → strike 3 → jam            | Severs the longest eligible cable; if it exceeds 6 units, also deals 1 damage. Choose shorter physical spans or protected cables.                                                                      |
| Null Storm    | Jam → strike 2 → sever            | Its jam affects only the announced band, cycling North → Center → South once per jam cycle. Place, protect, or pay to move important hardware out of the band.                                         |
| Gate Sentinel | Breach 4 → sever → strike 3       | Plating absorbs 2 packet damage unless the chosen route contains a firewall. A basic route still deals 3, so this is not a rare-card lock. A routed firewall improves both offense and breach defense. |
| Rust Prophet | Corrupt → strike 2 → breach 3 | Corrodes the busiest occupied band for two turns. Occupied corrosion adds 2 incoming damage per band. Cleanse it or move hardware. |
| Prism Widow | Corrupt → sever → strike 3 | Suppresses the busiest band in the chosen live route for two turns. That band subtracts 3 route damage; cleanse or route elsewhere. |
| Ferric Colossus | Strike 3 → corrupt → breach 4 | Absorbs 3 packet damage until two independent routes are live, and lays corrosion in the busiest occupied band. |
| Blackout Core | Sever → breach 4 → jam → strike 4 | At half health, enrages for +3 strike/breach and 2 chip damage alongside jam/sever. Redundancy, separation, burst timing and defense all matter.                                                       |

Pressure is `floor(enemy actions already taken / 3)`. Add it to strike and breach damage. The first three actions have no pressure bonus; later cycles grow progressively dangerous.

At half health or below, the Core is enraged. Add three more to strikes and breaches; its sever and jam actions also deal two integrity damage. Enrage is visible in the next intent after the threshold is crossed. All chip damage is blockable. Its disruption still targets only eligible unprotected devices/cables.

Disruption targeting is deterministic and visible. Wraith uses longest eligible cable, with cable ID as a stable distance tie-break. Storm filters eligible devices to its announced band. Other disruptions prefer an eligible device or cable on the best current signal route, then the first eligible table element. Card plays and paid relocation can change the forecast. End Turn resolves the displayed target and incoming damage exactly.

## Card rarity and catalogue

Basic cards form the reliable starter infrastructure. Commons are efficient, broadly useful turn tools. Uncommons reward specialization or protect an investment. Rares provide major orchestration, damage or recovery. Legendary Clabernetes is the single exceptionally scarce replication reward. Rarity does not imply unconditional superiority.

For each normal/cache reward slot: **49.5% common, 38% uncommon, 12% rare, 0.5% legendary**. An elite's first slot is guaranteed rare; its other slots are **23% common, 50% uncommon, 25% rare, 2% legendary**. Select uniformly within the rolled rarity, excluding cards already in this offer. Basics never occupy reward offers. If a rarity has no unoffered cards, the slot falls back to unoffered non-basic cards. The seeded RNG makes identical daily choices repeatable.

There are five rare cards and one legendary. Before the offer's no-duplicate conditioning, a normal slot offers **Containerlab at 2.4%** versus **Clabernetes at 0.5%**. An elite's guaranteed rare slot offers Containerlab at 20%; its other slots offer Containerlab at 5% versus Clabernetes at 2%. Clabernetes is therefore rarer than the specific Containerlab card, not merely in a rarity category with fewer cards. Neither appears in a new starter deck or is granted by loading an older save.

| Card               | Cost | Rarity    | Target  | Rules                                                                                                    |
| ------------------ | ---: | --------- | ------- | -------------------------------------------------------------------------------------------------------- |
| Core Router        |    2 | basic     | ground  | Place a router. A valid signal path needs at least one.                                                  |
| Edge Switch        |    1 | basic     | ground  | Place a switch. A routed switch adds +1 damage (maximum +2).                                             |
| Trust Gate         |    2 | uncommon  | ground  | Place a firewall. On the signal route: +1 damage; block 3 breach or 1 strike.                            |
| Optic Fiber        |    1 | basic     | link    | Connect two devices with a live cable.                                                                   |
| Crosslink          |    0 | uncommon  | link    | Connect two devices for free. Draw 1. Exhaust.                                                           |
| Faraday Shell      |    1 | uncommon  | node    | Protect a device from jams this battle. Clear its jam. Exhaust.                                          |
| Hot Patch          |    1 | basic     | instant | Clear the active jam or severed link. Draw one card.                                                     |
| Power Surge        |    0 | uncommon  | instant | Gain 2 energy. Draw 2. Exhaust.                                                                          |
| Overclock          |    1 | rare      | node    | Overclock a router: +2 route damage this battle. Exhaust.                                                |
| Containerlab       |    3 | rare      | instant | Deploy an overclocked router linked to both terminals: 7 damage. Exhaust.                                |
| Clabernetes        |    2 | legendary | node    | Clone a router and its links. Protect both from jams. Independent routes: +2 damage. Exhaust.            |
| Packet Guard       |    1 | common    | instant | Gain 4 block this turn.                                                                                  |
| Packet Burst       |    1 | common    | instant | A live route deals +3 damage this turn.                                                                  |
| Deep Scan          |    1 | common    | instant | Draw 3 cards. Hand limit: 10.                                                                            |
| Fast Reroute       |    0 | uncommon  | instant | Clear both faults. Gain 2 block. Draw 1. Exhaust.                                                        |
| Aegis Protocol     |    2 | uncommon  | instant | Gain 8 block this turn.                                                                                  |
| Power Capacitor    |    0 | common    | instant | Gain 3 block now and +2 energy next turn. Exhaust.                                                       |
| Signal Relay       |    2 | common    | ground  | Place a jam-protected switch. Routed switches add +1 damage each (maximum +2). Draw 1.                   |
| Hardened Router    |    2 | uncommon  | ground  | Place a router protected from jams. Gain 2 block.                                                        |
| Bastion Firewall   |    3 | rare      | ground  | Place a jam-protected firewall. Gain 5 block. On route: +1 damage; block 3 breach or 1 strike.           |
| Duplex Link        |    1 | common    | link    | Connect two devices. Gain 3 block this turn.                                                             |
| Armored Fiber      |    1 | uncommon  | link    | Connect two devices with a cable immune to sever attacks.                                                |
| Amplified Fiber    |    1 | uncommon  | link    | Connect two devices. This cable adds +1 route damage (maximum +2).                                       |
| Salvage Cycle      |    0 | common    | instant | Return up to 2 most recently discarded link cards to your hand. Exhaust.                                 |
| Emergency Rebuild  |    2 | uncommon  | instant | Deploy a basic router linked to both terminals: 5 damage. Exhaust.                                       |
| Mirror Protocol    |    1 | uncommon  | instant | Requires two independent live routes. Gain 4 block and +3 damage this turn.                              |
| Zero Day           |    2 | rare      | instant | A live route deals +8 damage this turn. Exhaust.                                                         |
| Packet Compression |    1 | uncommon  | node    | Amplify a switch: +2 route damage this battle (once per route). Exhaust.                                 |
| Emergency Repair   |    2 | rare      | instant | Restore 3 integrity. Gain 3 block. Exhaust.                                                              |
| Failover Protocol  |    1 | common    | instant | Clear both faults. Gain 3 block this turn.                                                               |
| Startup Config     |    1 | common    | node    | Configure a router: +1 route damage this battle (once per route). Gain 1 block. Exhaust.                 |
| Linux Bridge       |    1 | common    | ground  | Place a switch, automatically linked to its nearest device. Routed switches add +1 damage (maximum +2).  |
| VXLAN Tunnel       |    2 | uncommon  | link    | Connect two devices with a sever-immune cable that adds +1 route damage (maximum +2 amplified cables).   |
| Clab Inspect       |    0 | common    | instant | Draw 2 if a router route is live; otherwise draw 1. Exhaust.                                             |
| Wireshark          |    1 | uncommon  | instant | Capture a live route. Draw 2. Gain +1 damage this turn per hardware type on that route (max 3). Exhaust. |
| Resonance Field | 1 | common | zone | Routes through hardware in the chosen band gain +3 damage for 3 turns. |
| Aegis Field | 1 | uncommon | zone | A live route through the chosen band grants 3 shield for 3 turns. |
| Null Field | 1 | uncommon | zone | Any non-terminal device in the chosen band grants 2 shield for 3 turns, even offline. |
| Purge Field | 0 | common | zone | Clear hostile fields and device jams in the chosen band. Draw 1. Exhaust. |

Wireshark snapshots the currently chosen best live route before the card is consumed. Distinct router, switch and firewall roles each contribute one burst damage; terminals and hardware elsewhere on the table do not count. Repeated devices of the same role do not increase the bonus. A missing route rejects the action without spending the card or energy. The normal ten-card hand cap applies, and the journal records the captured roles, burst amount and actual number drawn.

Zone cards select a band via its field seal or the table. Ground cards place devices; link cards select two different devices without an existing cable; node cards select a valid device; instant cards resolve immediately. Overclock requires an unmodified router. Compression requires an unamplified switch. Startup Config requires an unconfigured router; configuration contributes only once per route. Faraday Shell requires an unprotected non-terminal device. Clabernetes requires a router and free table socket, preserves its overclock, startup configuration and cable properties, and protects/unjams both original and replica. Mirror Protocol requires two live independent routes. Salvage requires at least one discarded link card and recovers the most recently discarded links first. Invalid targets spend neither energy nor cards.

## Relics

All relics are unique within a run. Offers only contain unowned relics.

| Relic         | Rule                                                             |
| ------------- | ---------------------------------------------------------------- |
| Cold Start    | +1 energy at the start of each battle.                           |
| Hot Swap      | The first Optic Fiber each turn costs zero energy.               |
| Parallel Core | +2 packet damage when two independent routes are live.           |
| Shield Array  | Prevent up to 4 damage from the first unblocked hit each battle. |
| Deep Cache    | Draw one extra card every turn.                                  |
| Grounded Core | Start every turn with 2 block.                                   |
| Packet Lens   | +1 damage when your signal route includes a switch.              |
| Repair Drone  | Restore 2 integrity after winning an encounter.                  |
| Reserve Cell  | Carry up to 2 unspent energy into the next turn.                 |

## Strategies and balance intent

**Mesh:** Build two independent manual router routes and place their routers in opposite outer bands. Startup Config raises the damage floor while separation adds reusable defense. Rare Containerlab and legendary Clabernetes are optional powerful rewards, never a prerequisite. Armored Fiber, Faraday Shell and repair cards protect different failure modes. Mirror Protocol rewards maintaining both routes. The cost is setup, card slots and vulnerability to shared support devices. Parallel Core and Packet Lens improve the ceiling without being required.

**Fortress:** Build a firewall into the active route and spend only enough block for the actual intent. Grounded Core, maintenance and Emergency Repair extend the integrity budget. Compression and switch routing give this approach a damage plan. The cost is slower encounters: pressure eventually overwhelms indefinite defense.

**Burst:** Use limited Surge, draw and energy reserves to play packet boosts alongside a reliable route. Zero Day can skip an otherwise dangerous enemy action by becoming lethal. The cost is spending cards that cannot return this battle and weaker protection when the burst does not finish the enemy. Previewing lethal versus overkill is a meaningful decision.

No build should require one exact rare. The guaranteed basic router and two fibers prevent a lost opening draw. Clab Inspect rewards an online network, Linux Bridge converts careful placement into a free link, VXLAN combines amplification with disruption immunity, and Startup Config makes ordinary routers worth preserving. Wireshark adds packet-capture play: mixed hardware routes earn up to three temporary damage while drawing two cards. It rewards a diverse route without increasing the permanent damage ceiling. These common/uncommon networking concepts make the theme mechanical even when neither signature card appears.

Persistent structures give each turn a changing context; exhausted orchestration prevents rebuilding an entire board every shuffle. Fourteen devices and capped route bonuses keep the table readable and prevent a longest-path stacking exploit.

Warden deliberately has the most forgiving integrity budget. Choosing elites should be a preparation check with an extra relic as compensation. Caches and maintenance offer control over deck and survival without guaranteeing an optimal deck. Free reward skipping and selective card removal make deck size a decision.

## Presentation, learning and feedback contract

The alpha interface exposes signal damage, incoming damage, available block, energy, pile counts, enemy intent and its exact target. Damage and defense details list their contributing terms. The reference guide distinguishes live-route bonuses, this-turn block, jam protection and exhaustion. Collection inspection exposes rarity, cost, target and effect before a card is chosen.

The optional seven-step tutorial is an isolated practice encounter. It teaches a Core Router plus two Fibers for five damage, then four block from Packet Guard against a two-damage strike before the second transmission. Players can undo, exit, replay, skip or disable it; practice never saves an expedition or records a score. The full rules reference remains available. Invalid actions explain the needed target without spending resources. Reward skipping, deck inspection, maintenance removal, keyboard targeting, reduced motion and volume settings serve repeated runs as well as first play.

Motion should explain causality: installation, a cable becoming live, a packet traversing the scored route, a shield responding, a disruption reaching its target, and damage resolving. Effects must not obscure the numerical forecast, delay urgent controls indefinitely, or be required to understand a result. Reduced motion keeps equivalent textual feedback. Cards, overlays and settings should belong to the game interface rather than looking like default browser controls.

## Save compatibility and deterministic behavior

Storage remains expedition version 2. Older saves receive an empty zone-effect list; existing decks are preserved. Field kinds, bands, durations and unique allied/hostile slots are validated on load. Existing runs receive empty exhausted piles and zero temporary block, boost, reserve energy and played-card counts. Cards already present in an older run, including signature cards, remain intact. Loading an old run never inserts missing Containerlab or Clabernetes cards; this prevents save-version flags from bypassing rarity. Oversized legacy hands are reduced to ten by moving overflow to discard. Invalid card IDs, bad topology references and invalid numeric combat values are rejected. Saves preserve RNG, topology, piles and faults so reload cannot reroll an enemy action.

Daily seeds derive from the UTC date. Player choices still change subsequent RNG consumption and rewards; identical seed, archetype and decisions repeat the expedition. There is no remote leaderboard or multiplayer authority in this alpha.

## Measured alpha balance

Run `node --experimental-strip-types scripts/balance.ts 500` for the safe-route probe, add `--elite` for the risky route, or `--build=mesh`, `--build=fortress`, `--build=burst` for alternative card/relic priorities. Seeds are distributed across the 32-bit space rather than using correlated tiny initial xorshift states. Full results are stored in `docs/balance-alpha.json`.

The final tuning was probed across **22,500 deterministic runs**: 500 seeds × three archetypes × three play policies × five route/build scenarios. Every policy builds the guaranteed manual router plus two fibers. The careless policy then ignores faults, defense and card upgrades, rather than failing to build a route. Aggressive and adaptive policies build redundancy, configure routers, repair, use burst and block. Adaptive also pays for separation and zone dodges and prioritizes defending an announced hit sooner. Both can use signature cards only after earning and drawing them. These bots are transparent regression probes, not human difficulty measurements or evidence of complete strategy parity.

| Adaptive policy / route                | Architect wins | Warden wins | Ghost wins |
| -------------------------------------- | -------------: | ----------: | ---------: |
| Balanced, safe route                   |            80% |         95% |        87% |
| Balanced, elite route                  |            89% |         98% |        96% |
| Mesh reward priorities, safe route     |            70% |         94% |        77% |
| Fortress reward priorities, safe route |            84% |         97% |        91% |
| Burst reward priorities, safe route    |            75% |         96% |        82% |

Careless manual-route play won zero runs in every scenario. On elite routes, Architect and Ghost lost at sector four; the more forgiving Warden survived further but still lost every run. Prepared policies earned enough extra relic value to outperform the safe route; elite return and Warden's generous survival remain explicit next-playtest watchpoints. Safe balanced adaptive policies averaged roughly 4.7–5.5 turns per encounter. Fortress averaged 4.9–5.7; burst averaged 4.5–5.3.

Spatial defense is not automatically optimal: on the safe route the aggressive Architect policy won 81%, while the adaptive policy won 80%. The greedy adaptive policy sometimes spends movement energy when a faster kill would have been better. This is a useful regression signal about opportunity cost, not proof that players should ignore positioning. Mesh and burst priorities remain viable without starting with either signature orchestration card.

The harness does not search full tactical lines, guarantee optimal switch/firewall placement, model learning or measure enjoyment. It favors simple direct routes and only greedily values relocation, so it is not an optimal spatial solver; it also knows the rules perfectly. Human sessions should measure first-run comprehension, avoidable versus unavoidable damage, reward skips, route diversity, boss duration and whether the same cards dominate choices. One act, eight enemy types, 39 cards and three archetypes are the complete alpha scope; more acts, metaprogression and competitive balance are future work, not hidden systems.

The core tests verify formula/resolution agreement, forecast purity, best-route selection, bounded draws, exhaustion, temporary effects, protected disruptions, boss pressure, relic timing, card targets, repair, rewards, removal and version-2 migration, rare/legendary availability, paid relocation, spatial independence, all enemy traits, signed armor/healing forecasts, and Wireshark capture scope, distinct roles, bounded draw, exhaustion and atomic failure, field expiration, hostile targeting, cleansing, relocation out of corruption, and old-save field migration. Browser acceptance covers the integrated flows separately.


## Fieldcraft balance probe

The additional seeded probe is in [balance-fields.json](balance-fields.json): 150 seeds for each of three archetypes and three policies (1,350 runs). The adaptive and aggressive bots now evaluate field cards using the shared forecast. This updates the encounter/card mix and includes all eight enemy types; the earlier alpha report remains a historical baseline. The harness still does not model human comprehension or every possible tactical line.
