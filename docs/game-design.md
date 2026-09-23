# FAULTLINE — game design (v3)

The player restores a living network while an enemy tries to cut it apart. Each turn spends five energy on four competing needs: grow the network, keep it alive under announced disruption, defend against the announced attack, or spend a burst to end the encounter first. The network is your army. Devices are permanents that work while they are reachable; more independent paths mean more bandwidth; every enemy question has more than one answer. Every number on screen has a visible cause.

This document describes the implemented v3 rules and is the balance reference for tuning. Every tunable combat number lives in the `RULES` object in `src/core/cards.ts`; card text, relic text, field text, console text, the HUD and the Handbook all read it. Card and relic definitions live in `src/core/cards.ts`; combat and its forecast share `combatPreview` in `src/core/run.ts`; the expedition layer (rooms, rewards, market, sanctuary, events) lives in `src/core/meta.ts` and `src/core/events.ts`; encounter terrain in `src/core/terrain.ts`; ascension in `src/core/ascension.ts`.

Design pillars (Slay the Spire, Hearthstone, Gwent, Magic and Into the Breach are the reference points):

1. Every draw is a real decision; few cards go dead once the first route stands.
2. Devices are permanents with abilities. They only work while online, so disruption is removal and redundancy protects an engine.
3. Synergy scales without artificial "max +2 / once" caps. Natural limits do the balancing: fourteen table sockets, energy, and the enemy's disruption.
4. Readable threats with several answers. Enemy traits are questions (graded armor, band attacks, decoy-able disruption), not single-key taxes.
5. Tension between acting now and investing: tempo versus a network that pays every turn.
6. Meaningful choices between fights: upgrades, a market, events, rule-bending boss relics, ascension.
7. Rules a network engineer could guess: "a device works while reachable", "more paths, more bandwidth", "a buffer can lose packets", "a honeypot attracts attackers", "cutting a link takes down what is behind it".

---

## The expedition

One expedition crosses **three stages of seven sectors**. Choose one reachable room per sector. Each stage has its own route chart, encounter pool, chapter names and guardian.

| Stage | Region | Encounters | Elites | Guardian | Guardian health |
| --- | --- | --- | --- | --- | ---: |
| I | The Copper Reach | Packet Leech, Cable Wraith, Rust Prophet, Coil Serpent, Ash Moth | Gate Sentinel, Ferric Colossus, Wire Weaver | The Iron Regent | 67 |
| II | The Glass Cathedral | Null Storm, Prism Widow, Null Marshal, Glass Choir, Wire Weaver | Null Marshal, Prism Widow, Ferric Colossus | The Hollow Choir | 96 |
| III | The Blackout Heart | Ferric Colossus, Grave Reaver, Coil Serpent, Null Marshal, Glass Choir, Wire Weaver, Ash Moth, Prism Widow | Grave Reaver, Ferric Colossus, Gate Sentinel | Blackout Core | 132 |

### Route chart

Floor templates (lanes are shuffled per seed; `src/core/map.ts`):

| Floor | Rooms |
| ---: | --- |
| 1 | battle · battle · battle |
| 2 | battle · **event** · battle |
| 3 | sanctuary · battle · **market** |
| 4 | elite · battle · elite |
| 5 | battle · battle · battle — one room becomes a second event with 50 % probability, withdrawn if it would let any path cross fewer than four fights |
| 6 | sanctuary · elite · cache |
| 7 | guardian |

Every room has a straight exit; with 78 % probability it also has one visible diagonal to an adjacent lane. Floor 6 exits only to the guardian. Invariants, validated across 2,400 generated maps per test run:

- every path crosses **at least four fights** including the guardian;
- rest rooms (sanctuary, market, cache) sit only on floors 3 and 6, so no path can chain them;
- floor 3 always holds a market and floor 2 always holds an Unknown signal.

Enemies are scouted on the chart before entry (name, health with ascension applied, trait). Generation uses a local generator seeded by the run seed and stage, never the card RNG, so reloads and card choices do not change the chart.

Integrity persists between rooms. Topology, faults, fields, malware, protocols, buffer, backpressure, block, energy, exhaust and combat piles reset for every encounter. The deck, credits and relics persist. Defeating a stage guardian and taking its rewards restores up to **6 integrity** and opens the next stage's chart. Loss at zero integrity ends the expedition; defeating the Blackout Core and taking its card ends it in victory.

### Credits

| Source | Credits |
| --- | ---: |
| Normal battle | 14 + 3 × stage index + 0–4 (seeded) |
| Elite | 30 + 5 × stage index |
| Guardian | 50 |
| Event fight (Signal in the Static) | 40 |
| Salvage cache | 15 |
| Credit Line relic | +15 after every won battle (not scaled by ascension) |

Ascension 7 multiplies earned credits by 0.9 (rounded). The reward screen shows the amount earned.

### Rewards

A battle, elite, guardian, event fight or cache offers **three different cards**; take one or skip. Offers never include basics, junk or curses, and archetype cards only appear for their own archetype. Each slot rolls a rarity: normal slots **49.5 % common, 38 % uncommon, 12 % rare, 0.5 % legendary**; for elites, guardians and event fights the first slot is guaranteed rare and the others roll **23 % / 50 % / 25 % / 2 %**. A slot falls back to any offerable card when its rarity is exhausted. In stage II, 10 % of offered cards arrive already upgraded; in stage III, 20 %.

After an elite, choose one of **three unowned common relics**. After the stage I and II guardians, choose one of **three unowned boss relics**. The final guardian awards a card only.

### Sanctuary

Choose **one** service:

- **Repair**: restore 30 % of maximum integrity, at least 4 (ascension 3: ×0.75, rounded down).
- **Upgrade**: one deck card becomes its `+` version. The picker shows the before → after change.
- **Remove**: one deck card leaves the deck.
- **Salvage**: permanently lose 2 maximum integrity (must leave at least 6), then choose one of three unowned common relics.

Removal (at a sanctuary, market or event) keeps at least 10 cards, one router card (Core Router or Hardened Router) and two cabling cards. Curses can always be removed, even from a 10-card deck.

### Market

The market (`phase: "shop"`) sells:

- **Hardware bench**: a Core Router for 30. Routers are never card rewards, and wide networks need more than the two starter routers.
- **Five cards**: common, common, uncommon, uncommon, rare (6 % chance the rare slot is legendary). Prices: common 35, uncommon 55, rare 85, legendary 140, each with seeded ±5 jitter. 15 % of market cards are pre-upgraded for +20.
- **Two common relics** for 100–130 (steps of 5).
- **Card removal** for 50, +25 for every earlier *market* removal this expedition.
- **Card upgrade** for 40.

Each service can be bought once per visit. Ascension 7 raises every price 20 %; all prices round to 5. Purchases are refused, with the shortfall stated, when credits are insufficient.

### Unknown signals (events)

An event (`phase: "event"`) is drawn from the unseen events valid for the stage; the stage's story beat is three times as likely as any other. Events never repeat within an expedition (general events may repeat only if every eligible one was seen). Seeded picks (a named card, relic or card set) are rolled when the event opens and are named in the choice text; no choice hides a coin flip. After a choice resolves, the outcome is shown with a Continue button.

| Event | Choices |
| --- | --- |
| The Unpatched Server | Take a named rare card **and** a CVE curse · lose 3 integrity to upgrade a chosen card · walk on |
| The Abandoned Rack | Take a named device card (Honeypot, Cache Server, PoE Injector or Load Balancer) · 45 credits |
| The Firmware Mirror | Upgrade two named cards for 3 integrity · pay 25 to upgrade a chosen card · walk on |
| The Operator's Log | Restore 5 integrity · remove a card |
| Rogue DHCP | Transform a card into a random card one rarity higher (curses become commons; upgraded cards stay upgraded) · 20 credits |
| Cold Storage | Lose 2 maximum integrity (must leave 6) for a named common relic · walk on |
| The Echo Chamber | Pay 30 to duplicate a card (not a curse) · restore 2 integrity |
| The Quiet Broker | Sell your newest non-starter relic for 80 · buy a named uncommon card for 45 · walk on |
| Signal in the Static | Fight a named stage encounter with 40 % more integrity for 40 credits and a rare-first card reward (no relic) · walk on |
| The Copper Letters (stage I) | +1 maximum integrity and restore 3 · upgrade a named card |
| The Bell-Ringer's Rest (stage II) | Take a named upgraded protocol card · restore 6 integrity |
| The Last Acknowledgement (stage III) | +2 maximum integrity and restore 2 · 60 credits |

Event prices and credit gains follow the ascension 7 multipliers. Choices that cannot be taken show why (not enough credits, integrity too low, nothing upgradable).

### Three keepers

| Archetype | Integrity | Starter relic | Console | Engine | Deck variation (from the shared 17) |
| --- | ---: | --- | --- | --- | --- |
| Architect | 14 | Hot Swap | Patch Cable | Mesh — width, bandwidth, balancers | Fiber → Duplex Link ×1 · Edge Switch → Signal Relay · Packet Guard → Load Balancer ×1 |
| Warden | 15 | Backpressure | Harden | Fortress — shield that turns into damage | Core Router → Hardened Router ×1 · Trust Gate → Bastion Firewall · Packet Burst → Trust Gate |
| Ghost | 12 | Deep Cache | Buffer | Surge — store transmissions, release one spike | Fiber → Crosslink ×2 · Hot Patch → Deep Scan · Packet Guard → Store and Forward ×1 |

The shared starter deck (17 cards): Core Router ×2, Edge Switch, Trust Gate, Optic Fiber ×4, Hot Patch, Packet Guard ×2, Packet Burst, Startup Config, Resonance Field, Purge Field, Clab Inspect, Failover Policy.

Opening hands guarantee one router card and two cabling cards when present (Spare Parts adds an extra Optic Fiber), then fill to the draw count. A Core Router plus two Optic Fibers costs 4 before discounts and deals 5. Containerlab and Clabernetes never start in a deck and are never guaranteed draws.

---

## Turn rules and resources

- **Energy**: 5 per turn. +1 Anycast, +1 Jumbo Frames. First turn of a battle: +1 Cold Start, −1 SDN Controller. Later turns add reserved energy (Power Capacitor), up to 2 unspent energy with Reserve Cell, and **+1 per PoE Injector online at the start of the turn**. Other unused energy is lost.
- **Draw**: 6 per turn. +1 Deep Cache, −1 Jumbo Frames, **+1 per Cache Server online at the start of the turn**, +1 Fanout while 3+ channels are live. Hand limit 10; cards beyond the limit stay in the draw pile. An empty draw pile reshuffles the discard pile with the expedition RNG.
- **Prepare**: set one hand card aside at no cost; it becomes the first card of your next hand, replacing one draw. Return it before transmitting if you have hand space. Junk cannot be prepared. The slot clears on victory.
- **Playing a card** spends its energy and removes it from hand. Normal cards go to discard; Exhaust cards go to the exhausted pile for the rest of the encounter; armed protocols wait in the protocol slots. Unplayed cards go to discard at end of turn, except Packet Loss, which exhausts.
- **Console command**: one archetype action per turn without a card (see Consoles).
- **Relocate** a deployed device: 1 energy; unchanged positions are free. **Scrub** a malware node: 1 energy.
- Hardware, cables and upgrades stay on the table for the encounter. Block and burst last for the current turn only.
- Jam and cut last for the following player turn. Hot Patch, Fast Reroute and Link Recovery clear both immediately; Faraday Shell clears its target's jam; Purge Field clears jams in its band. A new enemy action clears old faults before installing its own.
- Scoring: +1 per card played, +10 per point of transmitted damage, +100 + 5 × integrity per victory.

### End-turn order (forecast and resolution)

`combatPreview` is pure: it consumes no RNG and mutates nothing. `endTurn` resolves exactly the forecast values and targets.

1. Compute the exact primary route, channels, damage terms, announced intent, disruption target, protocol triggers, trap damage, shield terms, integrity forecast and next-turn energy and draw.
2. **Transmit.** If buffering (Ghost), store the buffer gain and deal nothing; stored backpressure is consumed into it. Otherwise, with a live route, deal the packet damage (including any buffer release and backpressure), then clear buffer and backpressure.
3. If the packet is **lethal**, the whole enemy action is cancelled (no traps, fields, faults, malware or junk), rewards open, and Repair Drone restores 1 integrity.
4. **Traps** resolve at the start of the enemy action: triggered protocols move to discard; honeypot and protocol damage is dealt. If it defeats the enemy, the rest of the action is cancelled and you win.
5. Malware is planted at the forecast socket; Packet Leech heals.
6. Old faults clear; temporary fields tick down and expire; the new hostile field (unless cancelled) is installed with its full lifetime; the new cut or jam (unless cancelled or decoyed) is installed.
7. Junk cards are inserted into the draw pile at seeded positions.
8. Integrity loses `max(0, raw − shield)`. Shield Array is consumed only if damage reached it. Backpressure stores its share.
9. An interrupted ultimate exposes the guardian for one transmission.
10. Next turn: energy and draw from the forecast; if no live route exists now (with the new faults), a remaining buffer is lost (**packet loss**); block, burst, console uses and buffering reset (Grounded Core renews 1 block); the hand is discarded and redrawn with the prepared card first.
11. Zero integrity ends the expedition.

Lethal and trap-lethal forecasts show zero incoming damage and no disruption target. A half-health threshold crossed by this transmission changes the *next* intent, never the one already forecast.

---

## Routes, channels and online devices

A signal travels from ALPHA to OMEGA through at least one router. Cables are undirected. A jammed device or cut cable cannot carry a signal. Malware and wreckage are not part of the graph.

- **Route**: a simple ALPHA → … → OMEGA path through live cables containing at least one router. A direct terminal cable or a switch-only path is not a route.
- **Primary route**: the route with the highest route damage (below). Ties: fewer devices, then stable topology order (earliest-installed devices first). Only the primary route's devices contribute route terms.
- **Channels**: the maximum number of routes that share no intermediate device (ALPHA and OMEGA are shared). Computed exactly over at most twelve deployed devices. The forecast lists one maximum disjoint set, primary route first when it belongs to one; when it cannot, the list is the primary route followed by that set (so it may list one more path than the channel count).
- **Online device**: a non-terminal device that lies on at least one live route (any route, not only the channel set). Offline devices do nothing, with one exception: a cabled Honeypot decoys anywhere.

Enumeration keeps one strongest representative per visited device set and endpoint, so a better route behind a dense branch is never missed; the forecast stays under 5 ms on a full fourteen-socket table (tested).

### Why a transmission deals that much damage

| Term | Amount | Stacking |
| --- | ---: | --- |
| Live router route (primary) | +5 | Once |
| Edge switches on the primary route | +1 each (Packet Lens: +2 each) | No cap |
| Startup Config routers on the primary route | +1 each | No cap |
| Overclocked routers on the primary route | +2 each | No cap |
| Compressed switches on the primary route | +2 each | No cap |
| Amplified cables on the primary route (Amplified Fiber, VXLAN) | +1 each | No cap |
| Resonance on a band crossed by primary-route hardware | +3 | Per field per band (terrain and cast fields stack) |
| Suppression on a band crossed by primary-route hardware | −3 | Per field per band (terrain and cast fields stack) |
| Spanning Tree (boss relic) | + the route subtotal above (×2) | Replaces bandwidth and balancers |
| **Bandwidth** | +3 per channel beyond the first (Parallel Core: +4) | No cap |
| **Load Balancers** online | +1 per channel, per balancer | No cap |
| **Cluster**: a band holding 3+ online devices | +2 per band | Terminals excluded |
| Malware on the table | −2 each | At most 3 malware |
| Burst this turn (cards) | Card amounts | This turn only |
| BGP Hijack (boss relic) | +3 | Every transmission |
| Backpressure (Warden) | Stored amount | Consumed by the transmission |
| Buffer release (Ghost) | Whole buffer | When not buffering |
| Exposed guardian | +3 | One transmission after an interrupt |
| Enemy armor | Negative, see Enemies | Bypassed while exposed |

The sum is clamped at 0 ("Minimum signal damage"). A band counts once even if it holds both a terrain field and a cast field of the same kind. Resonance and suppression count bands crossed by deployed hardware; the fixed terminals never activate fields.

Examples:

- A basic router route deals **5**; with Startup Config **6**; a router + Edge Switch route with an overclocked router **5 + 1 + 2 = 8**.
- Two plain router channels: **5 + 3 bandwidth = 8**. Against Ferric Colossus the armor falls from 4 to 2: **6**, versus **1** on a single route.
- Three channels and one online Load Balancer: **5 + 6 + 3 = 14**.
- Containerlab: an overclocked router cabled to both terminals, **7**.
- Ghost buffers an 8-damage turn: **+16** stored; next turn **8 + 16 = 24**.

### Defense: why integrity damage is blocked

Raw incoming damage is the intent amount (after pressure, stage threat, enrage, ascension and relic modifiers) plus corrosion, Worms in hand and chip terms. All shield terms form one pool; prevented damage is the lesser of raw damage and the pool.

| Shield term | Amount |
| --- | ---: |
| Block this turn (cards, Harden) | Card amount |
| **Online firewalls** vs a breach / strike | 2 / 1 each; Stateful ×2; Zero Trust ×2; stacking |
| Separated circuits: two disjoint channels, one with a North router and one with a South router | 3 |
| Aegis field: an online device in the band | 3 |
| Null field: any hardware in the band | 2 |
| Protocols: Failover Policy (on a cut), Rate Limiter (strike), IPS Signature (breach) | 3 (6+), 5 (8+), 6 |
| Honeynet: a honeypot absorbed the disruption | 2 |
| Watchdog: first transmission of the battle with no live route | 5 |
| Shield Array: first unblocked hit each battle | up to 2 |

Firewalls only block strikes and breaches, and not on an interrupted ultimate. Faraday Shell is **jam protection**, Armored Fiber / VXLAN / Dark Fiber are **cut protection**, not block. An ordinary jam against an empty table, or a cut against a table without cables, deals 1 exposed-backbone damage; if a grid exists but every target is protected, the disruption fails harmlessly. Null Storm's and Ash Moth's band jams are exempt: an empty band is a successful dodge.

---

## Devices

| Role | Cards | Ability |
| --- | --- | --- |
| Router | Core Router, Hardened Router (jam-protected), Containerlab/Emergency Rebuild (auto-cabled), Clabernetes (clone) | Every route needs one. Configured +1, overclocked +2 on the primary route. |
| Switch | Edge Switch, Signal Relay (jam-protected), Linux Bridge (auto-cabled), Spine-Leaf (cabled to every router) | +1 on the primary route; compressed +2 more. |
| Firewall | Trust Gate, Bastion (jam-protected), Stateful Firewall (blocks double) | Online: blocks 2 of a breach or 1 of a strike; firewalls stack. No damage bonus. |
| Honeypot | Honeypot | While it has at least one cable, enemy jams target it first and cuts target one of its cables first; each absorbed disruption deals 3 to the attacker (Honeynet +2 and 2 shield). Works offline. Cable Wraith's cut ignores honeypots. |
| Cache | Cache Server | Online at the start of your turn: draw 1 more. |
| Power | PoE Injector | Online at the start of your turn: +1 energy. |
| Balancer | Load Balancer | Online: +1 damage per live channel. |

"Start of your turn" is evaluated after the enemy action installed its new fault, so a cut or jam can take a cache or injector offline for that turn. The forecast shows next turn's energy and draw.

### Enemy disruption targeting (deterministic, forecast)

- **Jam**: a cabled, unprotected honeypot first → (Null Marshal) an online firewall → a primary-route device → the first eligible device. Storm and Moth jams consider only their announced band.
- **Cut**: an unarmored honeypot cable first (not for Cable Wraith) → Cable Wraith: the longest unarmored cable (cable ID breaks ties); a cut longer than 6 units also deals 1 damage → others: a primary-route cable → the first eligible cable.
- **Hostile field**: suppression targets the band holding the most primary-route hardware; corrosion the band holding the most deployed hardware. Ties prefer Center, North, then South. Band jams with a field use the jam band.
- **Malware**: the free socket nearest the centre of the busiest band (Center, North, South on ties).

Every card play, relocation and scrub updates the forecast before you commit.

---

## Consoles and engines

Each archetype has one console command, usable once per turn (SDN Controller: twice, except Buffer), shown in the battle command dock (key **C**).

| Console | Cost | Rule |
| --- | ---: | --- |
| Patch Cable (Architect) | 1 (+1 Zero Trust) | Connect two devices with a standard cable. It is not an Optic Fiber, so Hot Swap does not apply. |
| Harden (Warden) | 1 | Gain 2 block, +1 per online firewall. |
| Buffer (Ghost) | 0 | Toggle: this turn's transmission is stored instead of dealt. Use again before transmitting to cancel and refund the use. |

**Mesh (Architect).** Width is power: every channel beyond the first adds bandwidth, Load Balancers multiply it, clusters reward crowded bands, and Hot Swap plus Patch Cable make cables cheap. The cost is exposure: more cables to cut, Wire Weaver's tension trap, and corrosion on crowded bands.

**Fortress (Warden) — Backpressure.** Half the damage your shield prevents during an enemy action (rounded up) is stored and added to your next transmission as "Backpressure", then consumed. It persists while you have no live route. Reflect doubles it. Prevented damage counts every raw source (attacks, corrosion, Worms, chip).

**Surge (Ghost) — Buffer.** While buffering with a live route, the transmission stores `⌊max(0, damage) × 2⌋`, where damage excludes enemy armor and the exposed bonus (stored packets meet armor when released). Backpressure and burst are included. The next normal transmission with a live route releases the whole buffer ("Buffer release"), which also counts toward interrupting an ultimate. **Packet loss**: if you would start a turn with a positive buffer and no live route, the buffer is lost; the forecast warns ahead. Store and Forward adds 4 (6+) directly; Replay Attack doubles the buffer. A buffered turn deals 0 damage, which lets Packet Leech heal. The buffer resets at encounter end.

---

## Protocols

Protocol cards (keyword **ARMED**) are paid and armed face down in one of **two** protocol slots. They persist across turns until a matching enemy action triggers them, then go to discard. Unfired protocols vanish at encounter end (the deck is the master list). Only the first matching armed protocol of each trigger fires per action, in arming order. The forecast names every protocol that will trigger and includes its effect in every number.

| Protocol | Cost | Trigger → effect |
| --- | ---: | --- |
| Failover Policy | 1 | A cable would be cut → cancel the cut, gain 3 shield (6+) |
| Port Security | 1 | A device would be jammed → cancel the jam, the attacker takes 4 (7+) |
| Rate Limiter | 1 | A strike hits → 5 shield against it (8+) |
| IPS Signature | 2 (1+) | A breach hits → 6 shield against it |
| Quarantine Rule | 1 (0+) | The enemy casts a hostile field → cancel the field |
| Tarpit | 1 | The enemy charges or unleashes an ultimate → it takes 8 (12+) |

Details: protocols do not fire on a disruption a honeypot already absorbed; a lethal transmission fires none; on an interrupted ultimate no attack remains to trigger them. Protocol shield joins the action's shield pool. Honeypot, Port Security and Tarpit damage resolves at the start of the enemy action; if it defeats the enemy, the rest of the action is cancelled and you win.

---

## Bands, fields and placement

The table has three bands: **North** `z < −1.3`, **Center** `−1.3 ≤ z ≤ 1.3`, **South** `z > 1.3`. Terminals are fixed at `x = ±5.3`, `z = 0`. The build grid is `|x| ≤ 7.25`, `|z| ≤ 4.7`. Fourteen devices including both terminals fit on the table; device centres must be at least 1.55 apart and at least 1.3 from wreckage or malware. Illegal sockets explain why (`isBlocked`) and cost nothing.

Crowding versus spreading is the band tension (Gwent rows):

- **Cluster**: 3+ online devices in one band: +2 damage per clustered band.
- **Separated circuits**: two disjoint channels, one with a North router, the other with a South router: +3 shield.
- Corrosion, Null Storm and Ash Moth punish crowded bands; Prism Widow and Ash Moth suppress the band your primary route crosses.

| Field | Effect |
| --- | --- |
| Resonance Field · 1 (0+) | +3 when the primary route crosses the band. 3 turns. |
| Aegis Field · 1 (0+) | +3 shield while an online device sits in the band. 3 turns. |
| Null Field · 1 (0+) | +2 shield while any of your hardware occupies the band. 3 turns. |
| Purge Field · 0 | Remove hostile fields (including terrain interference), jams and malware in the band. Draw 1 (2+). Exhaust. |
| Corrosion (hostile) | +2 incoming damage while your hardware occupies the band. |
| Suppression (hostile) | −3 when the primary route crosses the band. |

Each band holds one temporary allied and one temporary hostile field; recasting replaces that side. Terrain fields keep their own slot. Allied fields affect three transmissions; hostile fields are installed after the action that casts them and affect the next two turns (three at ascension 9). A lethal transmission or Quarantine Rule cancels an incoming field. Dragging a device previews destination band, damage, shield and integrity loss before paying the relocation energy.

Deterministic auto-deployment (Containerlab, Emergency Rebuild, Clabernetes replicas) uses the first legal socket in the order x ∈ {0, −2.5, 2.5, −5, 5, −1.25, 1.25, −3.75, 3.75, −7, 7}, z ∈ {0, 2.4, −2.4, 4.2, −4.2, 1.2, −1.2}.

### Encounter terrain

Every battle starts on a different table (`src/core/terrain.ts`), generated from seed, stage and room with a local generator that never consumes the run RNG:

- The first fight of an expedition is always calm: no wreckage, salvage or field.
- Otherwise **1–2 wreck sockets** in stage I and **1–3** later, chosen from fixed spots that are never within 2 units of the centre, so the classic ALPHA → centre router → OMEGA opener always exists.
- 50 %: one **salvage** device pre-placed unconnected: switch or firewall in stage I; switch, firewall, cache or power in stage II; cache, power, balancer or firewall in stage III. It is yours once cabled.
- 30 %: a permanent terrain field in one band: **Crystal vein** (Resonance, 55 %) or **Interference** (Suppression, can be purged). A terrain field and a cast field of the same kind stack (e.g. Resonance Field on a Crystal vein band gives +6).
- A name and one-line description ("Collapsed rack row", "Flooded conduit", "Crystal vein", …) open the encounter.

---

## Malware, junk and curses

- **Malware** (intent `infect`, and the enraged Blackout Core's jam): planted at a forecast socket, at most 3 on the table. Each malware node costs −2 damage per transmission and occupies its socket. **Scrub** it for 1 energy by clicking it, or Purge its band. Packet Leech's taps also heal it 1 per malware after it acts.
- **Packet Loss** (junk): unplayable; exhausts at end of turn if still in hand.
- **Worm** (junk): pay 1 to delete it (exhaust). Each Worm in your hand when you transmit adds 2 incoming damage (blockable, forecast).
- **CVE** (curse): unplayable, permanent. Enters the deck from The Unpatched Server or ascension 5. Remove it at a sanctuary, market or event; Rogue DHCP transforms it into a common.

Junk is inserted into the draw pile at seeded positions when the action resolves and never enters the deck; every encounter rebuilds its piles from the deck.

---

## Enemies and pressure

Normal health is `16 + 5 × floor + 13 × stage` (zero-based); elite health `30 + 2 × floor + 10 × stage`; guardians 67, 96 and 132. Ascension multiplies them (below). Patterns repeat in order.

**Pressure** is `floor(actions already taken / 3)`. Strikes and breaches add pressure plus the stage index (+1 in stage II, +2 in stage III), ascension 4 (+1), enrage and BGP Hijack (+2).

| Enemy | Repeating pattern | Trait and counterplay |
| --- | --- | --- |
| Packet Leech | Strike 2 → Siphon tap (infect) → Breach 3 | Taps are malware (−2 each); heals 1 per malware after acting and 3 after a transmission that deals nothing. Scrub taps; keep damage flowing. |
| Cable Wraith | Cut → Strike 3 → Jam | Cuts the longest unarmored cable, ignoring honeypots; a cut longer than 6 units also deals 1. Shorter spans, armored cables, a second channel. |
| Null Storm | Band jam → Strike 2 → Cut | Jams only its announced band, cycling North → Center → South once per pattern. Move or protect hardware; empty bands dodge. |
| Gate Sentinel | Breach 4 → Cut → Strike 3 | Plating absorbs 2 unless a firewall is online. |
| Rust Prophet | Corrosion → Strike 2 → Breach 3 | Corrodes the busiest band for 2 turns. Purge or relocate. |
| Prism Widow | Suppression → Cut → Strike 3 | Suppresses the band your primary route crosses most. Purge or reroute through another band. |
| Ferric Colossus | Strike 3 → Corrosion → Breach 4 | Graded armor: absorbs 4 − 2 × (channels − 1). Width or a big hit. |
| Coil Serpent | Strike 2 → Cut → Corrosion | Strikes +3 while you have only one channel. |
| Ash Moth | Suppression → Band jam + suppression → Strike 2 | Jam and field share the announced band (North → Center → South). |
| Null Marshal | Breach 3 → Lockdown jam → Strike 3 | Absorbs 3 unless a firewall is online; Lockdown jams an online firewall first (honeypots still decoy it). |
| Glass Choir | Field → Strike 2 → Field + 2 Packet Loss → Breach 3 | Alternates suppression and corrosion. |
| Wire Weaver | Cut + suppression → Jam → Strike 3 | Strikes +2 with 6 or more cables on the table. Armor key cables, stay compact. |
| Grave Reaver | Breach 3 + corrosion → Strike 3 → Corrosion | At half health: strikes and breaches +2. |
| **The Iron Regent** | Breach 4 → Cut + corrosion → Strike 3 → Corrosion → Charge → **Crownfall** breach 7 | Graded armor 4 − 2 × (channels − 1). At half health: +2 strikes/breaches, +1 alongside faults and fields. Break: 12. |
| **The Hollow Choir** | Field → Jam + suppression + 2 Packet Loss → Field → Breach 4 + corrosion → Charge → **Requiem** breach 8 + suppression | Absorbs 2 unless a firewall is online. Alternates field types. At half health: +2 attacks, +1 alongside faults/fields. Break: 15. |
| **Blackout Core** | Cut + corrosion + Worm → Breach 4 → Jam + suppression → Strike 4 → Charge → **Total Blackout** breach 10 + corrosion | At half health: +2 attacks, +1 alongside faults/fields, and its jam also plants malware. Break: 18. |

Combined intents (a fault with a field, junk or malware) are announced together, use the same forecast as resolution, and are all cancelled by a lethal transmission. Enrage takes effect on the next displayed intent after the threshold is crossed.

### Guardian ultimates and exposed windows

Every guardian follows four normal actions with a **charge** turn, then an **ultimate**. The charge deals no direct damage; the forecast shows the coming ultimate's damage. Deal the break threshold (12 / 15 / 18) in **one transmission on the ultimate turn**, after armor and suppression, to interrupt it: the attack and its new field are cancelled, existing fields still resolve, and the guardian is **exposed** for one transmission (armor ignored, +3 damage). Interrupting is optional: shields, firewalls, protocols and integrity can absorb the ultimate. Tarpit punishes the charge or ultimate itself. A buffer release counts toward the break.

---

## Cards

Basic cards form the reliable starter infrastructure. Commons are efficient turn tools. Uncommons reward specialization or protect an investment. Rares provide orchestration, burst or recovery. Legendary Clabernetes is the single exceptionally scarce reward. Rarity never implies unconditional superiority. Every non-junk card has a `+` version (58 of 61), shown with a `+` and a gleam; upgrades change cost or numbers only, and card text always states the upgraded rule.

Card targets: **ground** places hardware, **link** connects two devices without an existing cable, **node** upgrades a valid device, **instant** resolves immediately, **zone** chooses a band, **protocol** arms, **junk** deletes a Worm. Invalid targets spend neither energy nor cards. Overclock requires an unmodified router, Compression an unamplified switch, Startup Config an unconfigured router, Faraday Shell an unprotected device, Mesh Weave a device with an unconnected neighbour, Mirror Protocol two or more channels, Equal-Cost Multipath and Wireshark a live route, Salvage Cycle a discarded cable card, Reflect stored backpressure, Replay Attack a non-empty buffer.

| Card | Cost | Rarity | Target | Pool | Rules | Upgrade (+) |
| --- | ---: | --- | --- | --- | --- | --- |
| Core Router | 2 | basic | ground | all | Place a router. Every route needs one: ALPHA → router → OMEGA deals 5. | cost 2 → 1 |
| Edge Switch | 1 | basic | ground | all | Place a switch. +1 damage while it is on your primary route. | Place a switch. +1 damage while it is on your primary route. Gain 3 block. |
| Hot Patch | 1 | basic | instant | all | Clear the active jam and cut cable. Draw 1. | Clear the active jam and cut cable. Draw 2. |
| Optic Fiber | 1 | basic | link | all | Connect two devices with a live cable. | Connect two devices with a live cable. Draw 1. |
| Clab Inspect | 0 | common | instant | all | Draw 2 if a route is live; otherwise draw 1. Exhaust. | Draw 3 if a route is live; otherwise draw 2. Exhaust. |
| Deep Packet Inspection | 1 | common | instant | warden | Gain 2 block for every online firewall (at least 2). | Gain 3 block for every online firewall (at least 3). |
| Deep Scan | 1 | common | instant | all | Draw 3 cards. Your hand holds at most 10. | Draw 4 cards. Your hand holds at most 10. |
| Duplex Link | 1 | common | link | all | Connect two devices. Gain 3 block this turn. | Connect two devices. Gain 5 block this turn. |
| Failover Policy | 1 | common | protocol | all | Arm. When a cable would be cut: cancel the cut and gain 3 shield for that enemy action. | Arm. When a cable would be cut: cancel the cut and gain 6 shield for that enemy action. |
| Honeypot | 1 | common | ground | all | Place a decoy. While cabled, jams and cuts hit it first; each one deals 3 to the attacker. Works offline. | cost 1 → 0 |
| Link Recovery | 1 | common | instant | all | Clear the active jam and cut cable. Gain 3 block. | Clear the active jam and cut cable. Gain 6 block. |
| Linux Bridge | 1 | common | ground | all | Place a switch automatically cabled to its nearest device (+1 on the primary route). | Place a switch automatically cabled to its two nearest devices (+1 on the primary route). |
| Packet Burst | 1 | common | instant | all | Your transmission deals +3 this turn. | Your transmission deals +5 this turn. |
| Packet Guard | 1 | common | instant | all | Gain 4 block this turn. | Gain 7 block this turn. |
| Power Capacitor | 0 | common | instant | all | Gain 3 block now and +2 energy next turn. Exhaust. | Gain 5 block now and +2 energy next turn. Exhaust. |
| Purge Field | 0 | common | zone | all | Cleanse a band: remove hostile fields, jams and malware in it. Draw 1. Exhaust. | Cleanse a band: remove hostile fields, jams and malware in it. Draw 2. Exhaust. |
| Rate Limiter | 1 | common | protocol | all | Arm. When the enemy strikes: gain 5 shield for that action. | Arm. When the enemy strikes: gain 8 shield for that action. |
| Resonance Field | 1 | common | zone | all | Choose a band. Your primary route deals +3 for each resonant band it crosses. 3 turns. | cost 1 → 0 |
| Salvage Cycle | 0 | common | instant | all | Return up to 2 of your most recently discarded cable cards to your hand. Exhaust. | Return up to 3 of your most recently discarded cable cards to your hand. Exhaust. |
| Signal Relay | 2 | common | ground | all | Place a jam-protected switch (+1 on the primary route). Draw 1. | cost 2 → 1 |
| Startup Config | 1 | common | node | all | Configure a router: +1 while it is on your primary route. Gain 1 block. Exhaust. | cost 1 → 0 |
| Store and Forward | 1 | common | instant | ghost | Add 4 damage to your buffer. | Add 6 damage to your buffer. |
| Aegis Field | 1 | uncommon | zone | all | Choose a band. While an online device sits in it, gain 3 shield each turn. 3 turns. | cost 1 → 0 |
| Aegis Protocol | 2 | uncommon | instant | all | Gain 8 block this turn. | Gain 12 block this turn. |
| Amplified Fiber | 1 | uncommon | link | all | Connect two devices. This cable adds +1 while on your primary route. | cost 1 → 0 |
| Armored Fiber | 1 | uncommon | link | all | Connect two devices with a cable immune to cuts. | cost 1 → 0 |
| Cache Server | 2 | uncommon | ground | all | Place a cache server. Online at the start of your turn: draw 1 more card. | cost 2 → 1 |
| Crosslink | 0 | uncommon | link | all | Connect two devices for free. Draw 1. Exhaust. | Connect two devices for free. Draw 2. Exhaust. |
| Dark Fiber | 0 | uncommon | link | ghost | Connect two devices with a cut-immune cable. Exhaust. | Connect two devices with a cut-immune cable. Draw 1. Exhaust. |
| Emergency Rebuild | 2 | uncommon | instant | all | Deploy a router cabled to both terminals: a new 5-damage route. Exhaust. | cost 2 → 1 |
| Equal-Cost Multipath | 1 | uncommon | instant | architect | Needs a live route. +2 burst for every live channel. | Needs a live route. +3 burst for every live channel. |
| Faraday Shell | 1 | uncommon | node | all | Protect a device from jams this battle and clear its jam. Exhaust. | cost 1 → 0 |
| Fast Reroute | 0 | uncommon | instant | all | Clear the active jam and cut cable. Gain 2 block. Draw 1. Exhaust. | Clear the active jam and cut cable. Gain 4 block. Draw 1. Exhaust. |
| Hardened Router | 2 | uncommon | ground | all | Place a router protected from jams. Gain 2 block. | Place a router protected from jams. Gain 5 block. |
| IPS Signature | 2 | uncommon | protocol | all | Arm. When the enemy breaches: gain 6 shield for that action. | cost 2 → 1 |
| Load Balancer | 2 | uncommon | ground | all | Place a load balancer. While online: +1 damage for every live channel. | cost 2 → 1 |
| Mesh Weave | 1 | uncommon | node | architect | Cable the chosen device to its two nearest unconnected devices. | Cable the chosen device to its three nearest unconnected devices. |
| Mirror Protocol | 1 | uncommon | instant | all | Needs 2+ channels. +2 burst and +2 block for every live channel. | Needs 2+ channels. +3 burst and +3 block for every live channel. |
| Null Field | 1 | uncommon | zone | all | Choose a band. While any of your hardware occupies it, gain 2 shield each turn. 3 turns. | cost 1 → 0 |
| Packet Compression | 1 | uncommon | node | all | Amplify a switch: +2 while it is on your primary route. Exhaust. | cost 1 → 0 |
| PoE Injector | 2 | uncommon | ground | all | Place a power injector. Online at the start of your turn: +1 energy. | cost 2 → 1 |
| Port Security | 1 | uncommon | protocol | all | Arm. When a device would be jammed: cancel the jam; the attacker takes 4. | Arm. When a device would be jammed: cancel the jam; the attacker takes 7. |
| Power Surge | 0 | uncommon | instant | all | Gain 2 energy. Draw 2. Exhaust. | Gain 3 energy. Draw 2. Exhaust. |
| Quarantine Rule | 1 | uncommon | protocol | all | Arm. When the enemy casts a hostile field: cancel the field. | cost 1 → 0 |
| Stateful Firewall | 2 | uncommon | ground | warden | Place a firewall that blocks double: 4 of a breach or 2 of a strike while online. | Place a jam-protected firewall that blocks double: 4 of a breach or 2 of a strike while online. |
| Trust Gate | 2 | uncommon | ground | all | Place a firewall. While online it blocks 2 of a breach or 1 of a strike. Firewalls stack. | Place a firewall. While online it blocks 2 of a breach or 1 of a strike. Firewalls stack. Gain 3 block. |
| VXLAN Tunnel | 2 | uncommon | link | all | Connect two devices with a cut-immune cable that adds +1 on your primary route. | cost 2 → 1 |
| Wireshark | 1 | uncommon | instant | all | Capture your primary route: draw 2 and +1 burst for every distinct device type on it. Exhaust. | Capture your primary route: draw 3 and +1 burst for every distinct device type on it. Exhaust. |
| Bastion Firewall | 3 | rare | ground | all | Place a jam-protected firewall (online: blocks 2 breach / 1 strike). Gain 5 block. | Place a jam-protected firewall (online: blocks 2 breach / 1 strike). Gain 8 block. |
| Containerlab | 3 | rare | instant | all | Deploy an overclocked router cabled to both terminals: a 7-damage route. Exhaust. | cost 3 → 2 |
| Emergency Repair | 2 | rare | instant | all | Restore 3 integrity. Gain 3 block. Exhaust. | Restore 5 integrity. Gain 5 block. Exhaust. |
| Overclock | 1 | rare | node | all | Overclock a router: +2 while it is on your primary route. Exhaust. | cost 1 → 0 |
| Reflect | 1 | rare | instant | warden | Double your stored backpressure. Exhaust. | cost 1 → 0 |
| Replay Attack | 1 | rare | instant | ghost | Double your buffer. Exhaust. | cost 1 → 0 |
| Spine-Leaf | 2 | rare | ground | architect | Place a switch cabled to every router on the table (+1 on the primary route). | cost 2 → 1 |
| Tarpit | 1 | rare | protocol | all | Arm. When the enemy charges or unleashes an ultimate: it takes 8. | Arm. When the enemy charges or unleashes an ultimate: it takes 12. |
| Zero Day | 2 | rare | instant | all | Your transmission deals +8 this turn. Exhaust. | Your transmission deals +12 this turn. Exhaust. |
| Clabernetes | 2 | legendary | node | all | Clone a router with its cables and upgrades. Both become jam-protected — instant bandwidth. Exhaust. | cost 2 → 1 |
| CVE | 0 | special | junk | curse | Unplayable. A permanent vulnerability. Remove it at a Sanctuary or Market. | — |
| Packet Loss | 0 | special | junk | junk | Unplayable. Vanishes at the end of your turn. Removed after the encounter. | — |
| Worm | 1 | special | junk | junk | Pay 1 to delete it. If it is in your hand when you transmit, the enemy action deals 2 extra damage. | — |

Clabernetes clones a router with its cables, configuration and overclock into the first free socket; both routers become jam-protected, and the new disjoint path is instant bandwidth. Wireshark counts distinct device roles on the primary route (router, switch, firewall, cache, power, balancer, honeypot) with no cap. Linux Bridge and Mesh Weave cable to the nearest devices not already connected (distance ties use device IDs).

---

## Relics

All relics are unique within a run; offers only contain unowned relics. Starter relics are never offered. Boss relics are strong rule changes with a real drawback and appear only after the stage I and II guardians.

| Relic | Tier | Rule |
| --- | --- | --- |
| Cold Start | common | +1 energy on the first turn of each battle. |
| Hot Swap | starter | The first Optic Fiber you play each turn costs 0. |
| Parallel Core | common | Bandwidth gives +4 per channel beyond the first instead of +3. |
| Shield Array | common | Prevent up to 2 damage from the first unblocked hit each battle. |
| Deep Cache | starter | Draw one extra card every turn. |
| Grounded Core | common | Start every turn with 1 block. |
| Packet Lens | common | Switches on your primary route deal +2 each instead of +1. |
| Repair Drone | common | Restore 1 integrity after winning an encounter. |
| Reserve Cell | common | Carry up to 2 unspent energy into the next turn. |
| Backpressure | starter | Half the damage (rounded up) your shield prevents during an enemy action is stored and added to your next transmission. |
| Honeynet | common | Honeypots deal +2 damage and grant 2 shield whenever they absorb an attack. |
| Fanout | common | Draw 1 extra card at the start of your turn while 3 or more channels are live. |
| Spare Parts | common | Start every battle with an extra Optic Fiber in hand. |
| Credit Line | common | Gain 15 extra credits after each won battle. |
| Watchdog | common | The first time each battle you transmit with no live route, gain 5 shield. |
| Spanning Tree | boss | Your primary route's damage is doubled. Bandwidth and Load Balancers give nothing. |
| Anycast | boss | +1 energy every turn. You cannot place firewalls. |
| Jumbo Frames | boss | +1 energy every turn. Draw 1 fewer card every turn. |
| BGP Hijack | boss | +3 damage every transmission. Enemy strikes and breaches deal +2. |
| SDN Controller | boss | Patch Cable and Harden can be used twice per turn (Buffer stays once). Start each battle with 1 less energy. |
| Zero Trust | boss | Firewalls block double. Cable cards and Patch Cable cost 1 more. |

---

## Ascension

Win an expedition at ascension N with an archetype to unlock N + 1 for that archetype (stored locally in `faultline-progress-v1`). Levels are cumulative.

| Level | Name | Rule |
| ---: | --- | --- |
| 1 | Hardened Elites | Elite hostiles have 15 % more integrity. |
| 2 | Stubborn Signals | Normal hostiles (and event fights) have 10 % more integrity. |
| 3 | Scarce Parts | Sanctuary repair restores 25 % less integrity. |
| 4 | Sharper Teeth | Hostile strikes and breaches deal 1 more damage. |
| 5 | Known Vulnerability | Begin the expedition with a CVE curse. |
| 6 | Ancient Guardians | Stage guardians have 15 % more integrity. |
| 7 | Lean Markets | Market and event prices +20 %; credits earned −10 %. |
| 8 | Worn Backbone | Begin with 2 less maximum integrity. |
| 9 | Lingering Corruption | Hostile fields last 3 turns instead of 2. |
| 10 | The Last Signal | Guardians enrage at 60 % integrity; their ultimates deal 2 more damage. |

---

## Save compatibility and deterministic behaviour

Expeditions save as **version 3** (still under the `faultline-expedition-v2` storage key). `parseExpedition` accepts only version 3: runs saved under the v2 rules predate the network redesign and are not continued; the title screen simply offers a new expedition. Local run records (`faultline-records-v2`) are kept and gain an optional ascension. Validation covers every v3 field: archetype and ascension, credits and removals, shop offers and prices, event state and picks (event IDs, cards, relic, enemy, deck indices), protocols (≤ 2), malware (≤ 3 valid points), terrain (≤ 6 wreck points), console uses (≤ 2), buffer and backpressure, device flags (`salvage`, `stateful`), field slots (one allied, one hostile and one terrain field per band; terrain fields may carry up to 999 turns), map exits, piles, relics and topology references. Invalid values reject the save.

Maps derive from seed + stage; terrain from seed + stage + room; both use local generators. Card draws, rewards, market stock, events and junk positions use the expedition RNG. Daily seeds derive from the UTC date; identical seed, archetype, ascension and decisions repeat the expedition. There is no remote leaderboard.

---

## Presentation, learning and feedback contract

- **Every number has a cause.** The battle HUD shows signal damage, shield, burst, channels and bandwidth, online and offline devices, clusters on the band seals, the Ghost buffer (stored, gain, packet-loss risk), the Warden's stored backpressure, the console command (cost, uses, Buffer state), armed protocols with "will trigger" highlights, trap damage, malware and junk in the intent panel, and next turn's energy and draw. The Details dialog lists every damage and shield term; Devices lists every device with its ability and online state.
- **3D table.** Hostiles loom over the far rail at roughly 2.4× their former size with rim lighting, glowing cores, embers and heavier anticipation and lunges; guardians are larger with a presence seal. The primary route glows gold and other channels cyan, and every channel sends a packet on transmit. Offline devices are dimmed and labelled; salvage looks weathered until online; wreckage shows a blocked ring; malware pulses magenta with a ghost beam at the forecast plant socket. Honeypot traps, protocol triggers and scrubs pulse their device. Reduced motion and fast mode keep equivalent textual feedback.
- **Field Training** (`src/tutorial.ts`, `src/tutorial/lessons.ts`): a lesson menu of 11 short, hand-built practice battles in 9 chapters, played through the real rules: The First Signal; Read the Enemy; When the Line Is Cut (rerouting, bandwidth); Online Devices; Hold the Ground (bands and fields); Traps & Decoys; three console lessons (Architect, Warden, Ghost); Danger & Guardians (charge, ultimate, malware, junk, Prepare); and an illustrated expedition walkthrough. Coach text reacts to the board, hints appear on request or after 12 s of inactivity, warnings precede costly mistakes, and completion is stored in `faultline-training-v1`. Lesson runs never touch the saved expedition. Tests play every lesson to completion.
- **Handbook** (`src/tutorial/handbook.ts`): 12 illustrated chapters (first turn, routes and channels, online devices, intents and shield, bands and fields, rerouting, protocols and console, the three keepers, a **Danger Playbook**, guardians, cards and keywords, the expedition). Every number is read from `RULES`, `CARDS`, `RELICS`, `ENEMIES`, `CONSOLES`, the ascension levels and market constants.
- **Screens** (`src/screens.ts`): title (continue with ascension, Field Training, Handbook), archetype select with console, engine and an ascension selector, route chart with market and event rooms, reward (credits earned, upgraded cards), relic (boss relics show the drawback in red), sanctuary with a deck picker showing upgrade before → after, market, illustrated events, outcome with ascension unlocks.
- **Audio cue contract** (`src/audio-effects.ts`, 44 cues, 75 stereo masters from six CC0 Kenney packs, loudness-matched by tier). One cue per moment: `pickup` when a card is lifted (never a shuffle), `undo` on cancel/undo, card plays sound by effect (`deploy`, `connect`, `protocol`, `field`, `cleanse`, `block`, `instant`), `route` when a route or extra channel comes online, `move` on relocation, `console`, `scrub`, `transmit` on launch, `buffer`/`release` for the Ghost, `trigger` for protocols and honeypots, `hit` on packet arrival, enemy action cues on the contact frame, `malware` and `junk` from the turn result, `deal` for the new hand and `shuffle` **only** when the discard pile is actually reshuffled, `navigate` then `turn`/`event`/`coins` when a room is chosen, `coins` for purchases, `upgrade` for upgrades, `reward` for rewards. Hover sounds only on meaningful controls.

---

## Strategies and balance intent

**Mesh (Architect).** Build a second and third disjoint channel early; place routers North and South for separated-circuit shield or crowd a band for a cluster; Load Balancers and Parallel Core scale the payoff; Equal-Cost Multipath and Mirror Protocol cash it in. Market routers feed the width. Cost: more exposed cables, Weaver's tension trap and corrosion on crowded bands.

**Fortress (Warden).** Keep firewalls online on any live route, Harden and block exactly what the intent needs; every prevented point returns as backpressure. Stateful firewalls, Deep Packet Inspection and Reflect scale it; protocols answer in advance. Cost: backpressure needs the enemy to attack, and pressure eventually outgrows static defense.

**Surge (Ghost).** Protect the line (Failover Policy, armored or dark fiber, a second channel), buffer on turns where the intent cannot break every route, then flush one spike, ideally on a guardian's ultimate turn to interrupt it. Store and Forward and Replay Attack amplify it. Cost: buffered turns deal nothing, Packet Leech heals, and a cut on your only route loses everything.

No build requires a specific rare; Containerlab and Clabernetes are optional discoveries. Honeypots, protocols and fields give every archetype answers to disruption. Persistent structures give each turn a changing context; exhausted orchestration prevents rebuilding a board every shuffle; fourteen sockets and enemy disruption, not artificial caps, bound the ceiling.

---

## Balance evidence (v3)

`node --experimental-strip-types scripts/balance.ts <seeds> [--ascension=N] [--policy=..] [--archetype=..] [--elite] [--no-signature]` plays complete three-stage expeditions with deterministic bots (`scripts/bot.ts` for combat, `scripts/bot-meta.ts` for every non-battle phase). Experiment flags `--hp-scale=N` (normal battles), `--boss-scale=N` (guardians) and `--rule=key:value,…` (override any `RULES` number for the run) probe alternatives without editing the game. Results are in [balance-v3.json](balance-v3.json). Four policies range from careless construction to tactical play (consoles, protocols against visible intents, width, honeypots, buffer timing, backpressure, scrubbing, preparation). The bots use per-archetype reward priorities (`PRIORITIES` in `bot.ts`).

All recorded scenarios use the shipped numbers: normal health `16 + 5 × floor + 13 × stage`, guardians 67 / 96 / 132, 150 seeds per archetype and policy.

| 150 seeds, ascension 0 | Architect | Warden | Ghost |
| --- | ---: | ---: | ---: |
| Tactical wins | 39 % | 35 % | 39 % |
| Adaptive wins | 19 % | 13 % | 15 % |
| Aggressive wins | 8 % | 3 % | 2 % |
| Careless wins | 0 % | 0 % | 0 % |
| Tactical, elite-seeking route | 31 % | 36 % | 37 % |
| Tactical turns per normal battle | 3.9 | 4.8 | 3.0 |
| Tactical turns per guardian (Regent · Choir · Core) | 6.2 · 7.4 · 6.9 | 9.1 · 10.6 · 9.5 | 5.0 · 5.9 · 6.2 |
| Tactical wins, ascension 5 | 9 % | 23 % | 18 % |
| Tactical wins, ascension 10 | 9 % | 9 % | 5 % |

Guardian health was raised 20 % in the final pass (from 56 / 80 / 110) because Architect and Ghost guardian fights ended before the charge-and-ultimate climax. Probes recorded under `experiments` show why a larger increase was rejected: v3 damage ramps steeply (bandwidth, buffer, backpressure), so +40 % guardian health added under one turn to those fights while dropping every archetype to about 30 %. A 1.5× buffer multiplier did not lengthen Ghost fights either, so the ×2 buffer stayed.

Caveats and watchpoints:

- These bots are regression probes: they know the rules perfectly, do not search full tactical lines, and do not measure comprehension or enjoyment. Human playtests must set the final difficulty.
- Ghost normal fights (~3 turns) and Architect/Ghost guardian fights (5–7 turns) remain shorter than the 4–6 and 8–11 turn targets: both archetypes convert setup into a steep damage ramp. This is their identity, but human sessions should confirm the guardian climax still lands often enough.
- Ascension scales unevenly: at ascension 5 the Warden keeps 23 % while the Architect falls to 9 %.
- The Architect bot needs router purchases (market bench) and its reward priorities to reach its width engine.
- Older probes (`balance-alpha.json`, `balance-fields.json`, `balance-expedition.json`, `balance-routes.json`, `balance-tactics.json`) measured pre-v3 rules and are kept for history only.

The core tests verify forecast purity and exact agreement with resolution on 160 randomized boards, channel and online computation, bandwidth, clusters, firewalls anywhere, honeypots, cache/power/balancer timing, consoles including buffer and packet loss, backpressure, protocols including trap lethal, terrain legality, malware and scrubbing, junk, card upgrades, boss relic effects, ascension hooks, map invariants over 2,400 maps, market, sanctuary and event flows, save validation, and every Field Training lesson.
