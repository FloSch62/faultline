# FAULTLINE — game design (v4 · Under Quarantine)

The player restores a living network while the quarantine tries to cut it apart. Each turn spends five energy on competing needs: grow the network, keep it alive under announced disruption, defend against the announced attacks, maintain the table the enemy is building on, or spend a burst to end the encounter first. The network is your army. Devices are permanents that work while they are reachable; more independent paths mean more bandwidth, and every channel is a delivery the player aims at a port; every enemy question has more than one answer. Every number on screen has a visible cause.

v4 keeps every v3 rule and adds four systems on top of it: **packs and ports** (up to three hostiles at the far rail, one delivery per channel, focus, aim and overflow), **the table front** (hostile installations with integrity, device condition, breakdown, repair and scrub), **escalation** (the leader's disruption grows in three levels; guardians charge when wounded and raise adds), and **designations and surprises** (one-line variants on leaders, announced reinforcements, crates, undelivered messages and signals). A fight against one undesignated hostile that never installs or overloads is numerically the v3 fight.

This document describes the implemented v4 rules and is the balance reference for tuning. Every tunable combat number lives in the `RULES` object in `src/core/cards.ts`; card text, relic text, trait text, the HUD and the Handbook all read it. Where this document quotes a number it names the `RULES` key beside it, so a tuning change can be checked against the code. Card and relic definitions live in `src/core/cards.ts`; hostiles, designations, pack templates, signals and message options in `src/core/enemies.ts`; encounter plans (who stands at the rail, health, crates, arrivals, signals, credits) in `src/core/encounter.ts`; combat and its forecast share one resolver in `src/core/combat/resolve.ts` (with `board.ts`, `network.ts`, `intent.ts` and `surprises.ts` beside it), and `src/core/run.ts` keeps the public API (`combatPreview`, `endTurn`, the play actions). The expedition layer (rooms, rewards, market, sanctuary, events) lives in `src/core/meta.ts` and `src/core/events.ts`; the route chart and its v4 rolls in `src/core/map.ts`; encounter terrain in `src/core/terrain.ts`; ascension in `src/core/ascension.ts`.

Design pillars (Slay the Spire, Hearthstone, Gwent, Magic and Into the Breach are the reference points):

1. Every draw is a real decision; few cards go dead once the first route stands.
2. Devices are permanents with abilities. They only work while online, so disruption is removal and redundancy protects an engine. Wear gives the permanent a life bar; breakdown is a telegraphed, per-encounter loss.
3. Synergy scales without artificial "max +2 / once" caps. Natural limits do the balancing: fourteen table sockets, four installations, energy, and the enemy's disruption.
4. Readable threats with several answers. Enemy traits, installations and designations are questions (graded armor, band attacks, decoy-able disruption, kill order), not single-key taxes.
5. Tension between acting now and investing: tempo versus a network that pays every turn. Maintenance is the fourth use of energy and stays a choice: a fast kill is the cheapest maintenance.
6. Meaningful choices between fights: upgrades, a market, events, rule-bending boss relics, ascension, and a route chart that scouts packs and designations.
7. Rules a network engineer could guess: "a device works while reachable", "more paths, more bandwidth", "multipath delivers to several destinations", "a buffer can lose packets", "a honeypot attracts attackers", "a jammer next to a router jams it", "a firewall next to a rogue device quarantines it", "hardware under load wears".
8. Surprise without hidden dice. Everything on the table resolves with the forecast's numbers; arrivals are announced ahead with their exact effect; rewards are revealed on death or offered as named choices (see [The surprise contract](#the-surprise-contract)).

---

## The expedition

One expedition crosses **three stages of seven sectors**. Choose one reachable room per sector. Each stage has its own route chart, encounter pool, chapter names and guardian.

| Stage | Region | Encounters | Elites | Guardian | Guardian health |
| --- | --- | --- | --- | --- | ---: |
| I | The Copper Reach | Packet Leech, Cable Wraith, Rust Prophet, Coil Serpent, Ash Moth | Gate Sentinel, Ferric Colossus, Wire Weaver | The Iron Regent | 67 |
| II | The Glass Cathedral | Null Storm, Prism Widow, Null Marshal, Glass Choir, Wire Weaver, Static Nest | Null Marshal, Prism Widow, Ferric Colossus, Scrap Foreman | The Hollow Choir | 96 |
| III | The Blackout Heart | Ferric Colossus, Grave Reaver, Coil Serpent, Null Marshal, Glass Choir, Wire Weaver, Ash Moth, Prism Widow, Static Nest, Root Blight | Grave Reaver, Ferric Colossus, Gate Sentinel, Scrap Foreman, Demolition Engine | Blackout Core | 132 |

A normal room that rolls a pack keeps its pooled hostile when that hostile leads a template of the rolled shape; otherwise a template is drawn, never repeating a leader already on that floor. So a stage II pack can be led by Packet Leech (a stage II template leader outside the stage II pool), and the machines that fight alone as normals (Null Marshal in stage II; Ferric Colossus, Grave Reaver and Null Marshal in stage III) never lead a normal pack.

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

Every room has a straight exit; with 78 % probability it also has one visible diagonal to an adjacent lane. Floor 6 exits only to the guardian. After the v3 rolls, the chart rolls each fight room's **pack**, its **designations** and whether a designation is **hidden**, and marks **reinforced elites** (see [Packs and ports](#packs-and-ports), [Designations](#designations) and [Surprises](#surprises)). Invariants, validated across 2,400 generated maps per test run:

- every path crosses **at least four fights** including the guardian;
- rest rooms (sanctuary, market, cache) sit only on floors 3 and 6, so no path can chain them;
- floor 3 always holds a market and floor 2 always holds an Unknown signal;
- pack rooms, designations and the hidden share follow the stage rates; no path crosses more than one reinforced elite per stage;
- entering a room fights exactly the encounter its scouting showed.

Rooms are scouted on the chart before entry: the leader's name, health with ascension applied and trait; a pack room shows an ordinal (×2 or ×3) and lists its members leader first with each member's health; a designated leader shows its ribbon (a coral or teal diamond, the rule in the tooltip). In an interference room the ribbon reads **UNKNOWN DESIGNATION** until the entrance line; a cleared room shows it for the record. Reinforcements are never shown on the chart. Generation uses a local generator seeded by the run seed and stage, never the card RNG, so reloads and card choices do not change the chart; encounter plans (health, crates, arrivals, signals) are seeded by seed, stage and room.

Integrity persists between rooms. Topology, condition, installations, faults, fields, focus and aims, protocols, buffer, backpressure, block, energy, exhaust and combat piles reset for every encounter. The deck, credits and relics persist. Defeating a stage guardian and taking its rewards restores up to **6 integrity** and opens the next stage's chart. Loss at zero integrity ends the expedition; defeating the Blackout Core and taking its card ends it in victory.

### Credits

| Source | Credits |
| --- | ---: |
| Normal battle | 14 + 3 × stage index + 0–4 (seeded) |
| Elite | 30 + 5 × stage index |
| Guardian | 50 |
| Event fight (Signal in the Static) | 40 |
| Pack room (any fight with escorts) | +2 (`packCredits`) |
| Designated leader or single (once per room, even with two ribbons) | +1 (`designationCredits`) |
| Rolled reinforcement (not a Shedding spawn) | +3 (`reinforcementCredits`) |
| Credits crate | 3–6, seeded (`crateCredits`) |
| Salvage that finds no legal socket | 3 (`crateFallbackCredits`) |
| Message: Credit | 6 (`messageCredits`) |
| Salvage cache | 15 |
| Credit Line relic | +15 after every won battle (not scaled by ascension) |

Ascension 7 multiplies earned credits by 0.9 (rounded), crates and messages included. Credits banked during a fight (crates, a message's Credit) are paid with the room's credits. The reward screen shows an itemised ledger ("+16 credits · 14 room · 2 pack"). The v4 credit values were cut in balance so a run earns about 10 % more than v3 (the design values ran +21 %).

### Rewards

A battle, elite, guardian, event fight or cache offers **three different cards**; take one or skip. Offers never include basics, junk or curses, and archetype cards only appear for their own archetype. Every v4 card is in the reward pool from stage I. Each slot rolls a rarity: normal slots **49.5 % common, 38 % uncommon, 12 % rare, 0.5 % legendary**; for elites, guardians and event fights the first slot is guaranteed rare and the others roll **23 % / 50 % / 25 % / 2 %**. A slot falls back to any offerable card when its rarity is exhausted. In stage II, 10 % of offered cards arrive already upgraded; in stage III, 20 %.

After an elite, choose one of **three unowned common relics**. After the stage I and II guardians, choose one of **three unowned boss relics**. The final guardian awards a card only. An undelivered message still waiting when the fight ends opens on the reward screen; a crate's card choice is dropped (its card was for this encounter only).

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
| Signal in the Static | Fight a named stage encounter at `eventHealthScale` (1.4) × a normal room's health for 40 credits and a rare-first card reward (no relic) · walk on. The fight rolls its pack, designations, reinforcement and signal like the stage's normals, from its own seed stream, and pays their credits. |
| The Copper Letters (stage I) | +1 maximum integrity and restore 3 · upgrade a named card |
| The Bell-Ringer's Rest (stage II) | Take a named upgraded protocol card · restore 6 integrity |
| The Last Acknowledgement (stage III) | +2 maximum integrity and restore 2 · 60 credits |

Event prices and credit gains follow the ascension 7 multipliers. Choices that cannot be taken show why (not enough credits, integrity too low, nothing upgradable).

### Three keepers

| Archetype | Integrity | Starter relic | Console | Engine | Deck variation (from the shared 17) |
| --- | ---: | --- | --- | --- | --- |
| Architect | 14 | Hot Swap | Patch Cable | Mesh — width, bandwidth, balancers; width is destinations | Fiber → Duplex Link ×1 · Edge Switch → Signal Relay · Packet Guard → Load Balancer ×1 |
| Warden | 15 | Backpressure | Harden | Fortress — shield that turns into damage, returned to every attacker; Harden grows with the pack | Core Router → Hardened Router ×1 · Trust Gate → Bastion Firewall · Packet Burst → Trust Gate |
| Ghost | 12 | Deep Cache | Buffer | Surge — store transmissions, release one aimed spike | Fiber → Crosslink ×2 · Hot Patch → Deep Scan · Packet Guard → Store and Forward ×1 |

The shared starter deck (17 cards): Core Router ×2, Edge Switch, Trust Gate, Optic Fiber ×4, Hot Patch, Packet Guard ×2, Packet Burst, Startup Config, Resonance Field, Purge Field, Clab Inspect, Failover Policy.

Opening hands guarantee one router card and two cabling cards when present (Spare Parts adds an extra Optic Fiber), then fill to the draw count. A Core Router plus two Optic Fibers costs 4 before discounts and deals 5. Containerlab and Clabernetes never start in a deck and are never guaranteed draws.

---

## Turn rules and resources

- **Energy**: 5 per turn. +1 Anycast, +1 Jumbo Frames, +1 Storm Control. First turn of a battle: +1 Cold Start, −1 SDN Controller. Later turns add reserved energy (Power Capacitor), up to 2 unspent energy with Reserve Cell, and **+1 per PoE Injector online at the start of the turn**. Other unused energy is lost.
- **Draw**: 6 per turn. +1 Deep Cache, −1 Jumbo Frames, **+1 per Cache Server online at the start of the turn**, +1 Fanout while 3+ channels are live. Hand limit 10; cards beyond the limit stay in the draw pile. An empty draw pile reshuffles the discard pile with the expedition RNG.
- **Prepare**: set one hand card aside at no cost; it becomes the first card of your next hand, replacing one draw. Return it before transmitting if you have hand space. Junk cannot be prepared. The slot clears on victory.
- **Playing a card** spends its energy and removes it from hand. Normal cards go to discard; Exhaust cards go to the exhausted pile for the rest of the encounter; armed protocols wait in the protocol slots. Unplayed cards go to discard at end of turn, except Packet Loss, which exhausts.
- **Console command**: one archetype action per turn without a card (see Consoles).
- **Focus and aim**: free, and changeable until the transmission (see [Focus, aim and overflow](#focus-aim-and-overflow)). Both are undoable.
- **Relocate** a deployed device: 1 energy (`relocateCost`); unchanged positions are free. Relocation does not repair. A drop or a device-dock band never pays at once: the table shows the device at its new socket (its old socket keeps a faint ring) and a plate beside it names the move with its before → after forecast. **Relocate** (Enter) pays and moves it, undoable; **Cancel** (Esc, Z, right-click, a click elsewhere, or playing a card or transmitting) puts it back for free. A drop back in its own socket asks nothing.
- **Scrub** an installation: 1 energy per integrity point (`scrubCost`); 2 per point while a Quarantine Drone lives (`quarantineScrubCost`).
- **Repair** a worn device: 1 energy per condition point (`repairCost`); Field Engineer makes the first repair each turn free.
- **Offers** (a crate's card choice, an undelivered message) open at the start of the player turn, before the hand is dealt; up to 8 may wait in order.
- Hardware, cables and upgrades stay on the table for the encounter unless a device breaks. Block and burst last for the current turn only.
- Jams and cuts last for the following player turn (an escalated level-1 jam lasts two). Hot Patch, Fast Reroute and Link Recovery clear **every** active jam and cut at once; Faraday Shell clears its target's jam; Purge Field clears jams in its band. Old faults clear once at the start of the enemy phase, then each hostile installs its own.
- Scoring: +1 per card played, +10 per point of transmitted damage (all ports), +100 + 5 × integrity per victory.

### End-turn order (forecast and resolution)

`combatPreview` is pure: it consumes no RNG and mutates nothing. It runs the same resolver as `endTurn` on a copy of the state, and `endTurn` then performs only the RNG steps (junk positions, rewards, draws). Every number the forecast shows is therefore the number resolution uses: per port, per hostile, per installation, per worn device.

1. **The board as transmitted.** Routes, channels and the primary route; each living hostile's intent in port order (cadence, escalation, designations, riders); deliveries, merged packets per port, armor and overflow; disruption targets planned in port order against this board; every installation's next effect; quarantine targets; wear and breakdowns; Reclaim; arrivals and the signal; next turn's energy and draw on the post-phase board.
2. **Transmit.** Each living port takes its packet (after armor and overflow). Buffering (Ghost) stores the whole network sum ×2 and deals 0 to every port; stored backpressure is consumed into it. A transmission with a live route clears buffer and backpressure.
3. **Lethal per hostile.** A hostile at 0 health does nothing: its attack, fault, field, junk and installation are cancelled (Spiteful is the printed exception). A guardian whose own port took at least its break threshold on the ultimate turn is interrupted. If no hostile stands, rewards open and Repair Drone restores 1 integrity.
4. **Traps and quarantine.** Honeypot decoys bite each attacker; protocols fire (once per phase each); each firewall online at transmission time quarantines the nearest installation within reach; a destroyed installation grants Reclaim. A hostile killed here is cancelled; if none stands, you win. Then Phantom Nodes absorb the first remaining installations and disruptions in port order.
5. **Installs and heals.** Per hostile in port order: its installations are planted (a honeypot bite applies on arrival); Packet Leech, Tap Spinner and Static Nest heal; Hungry heals.
6. **Faults, fields and the table front.** Old faults clear once (a level-1 jam in its second turn stays); temporary fields tick down (not in an anchored band) and expire. Per hostile in port order: its field, its jams, its cuts (with level-1 frays), its overload, the ascension 6 wear riders and Total Blackout's wear. Then every installation in placement order: Jammer jams, Spike wear, Breaker Charge tick or detonation. Breakdowns apply at once: wreckage lands, routes and aims are recomputed.
7. **Junk** is inserted into the draw pile per caster, at seeded positions (the only RNG in the enemy phase).
8. **Attacks.** In port order, against one shared shield pool plus each attack's own firewall and protocol shield; corrosion, Worms and chip attach once, to the first attack that lands; Storm Control's damage comes last. Integrity loses what gets through. Backpressure stores half of everything prevented across the phase.
9. **Exposed on interrupt**, on the guardian's port; adds act regardless. Action counters advance (escalation, the guardian's step machine) and the phase's attackers are recorded for the Warden's release.
10. **End of the phase, next turn.** A reinforcement whose count reaches zero takes the first empty port; a guardian whose charge is now announced raises its adds; a signal is announced or fires. Fallen hostiles open crates, Laden messages and Salvaged drops (salvage lands on the table now). Next turn: energy and draw from the forecast on the post-phase board; if no live route exists now, a remaining buffer is lost (**packet loss**); block, burst, console uses, repairs and buffering reset (Grounded Core renews 1 block); aims of channels that no longer exist are dropped and a dead focus moves on (see [Focus, aim and overflow](#focus-aim-and-overflow)); the hand is discarded and redrawn with the prepared card first; waiting offers open before the hand is dealt.
11. Zero integrity ends the expedition.

A hostile forecast as defeated shows no incoming damage and no disruption; the others keep theirs (Spiteful prints "resolves anyway"). A half-health threshold crossed by this transmission changes the *next* intent, never the one already forecast.

---

## Packs and ports

### Ports and hostiles

An encounter holds one to three hostiles at three ports: **left, centre, right**. A leader (or a single hostile, or a guardian) stands at the centre; escorts take left, then right. A stage I duo leaves the centre empty. Reinforcements and adds take empty side ports, left before right.

- Every hostile has its own health, pattern, traits, enrage and action counter; leaders and singles carry designations (see [Designations](#designations)).
- Hostiles act in **port order**: left, centre, right.
- **Escorts and adds do not escalate.** They receive no stage bonus, no pressure and no enrage, and never reach an escalation level. Ascension 4 (+1), BGP Hijack (+2) and Ingress Filter (−1) still apply to their attacks.
- **Escorts act on alternate enemy phases.** The left escort acts on odd phases (1, 3, 5, …), the right escort on even ones; a dormant escort shows DORMANT and does nothing. In a trio exactly one escort acts each phase; a lone escort acts every other phase. Its pattern advances only on the phases it acts. Adds act every phase from the ultimate turn.
- A hostile at 0 health before its action resolves does nothing (Spiteful excepted). The encounter ends when every hostile is defeated; rewards, credits and Repair Drone trigger once. A guardian's death does not end the fight while its adds live.

### Deliveries

Every live channel of the forecast's channel set is a **delivery**. The channel containing the primary route is the **primary delivery**; the others are bandwidth deliveries, in the forecast's order.

- The **primary delivery** carries every route term (base route, switches, configured and overclocked routers, compressed switches, amplified and frayed cables, resonance and suppression), clusters, burst cards, BGP Hijack, backpressure, the buffer release and one point per online Load Balancer.
- Each **bandwidth delivery** carries bandwidth 3 (`bandwidthPerChannel`; Parallel Core 4, `parallelCorePerChannel`) plus one point per online Load Balancer (`balancerPerChannel`).
- **Siphon Taps** take −2 each (`malwarePenalty`) from the primary delivery first, then from bandwidth deliveries in port order. **Spanning Tree** doubles the primary delivery's route terms; bandwidth deliveries carry 0.
- Deliveries aimed at the same port **merge** into one packet. Armor and plating are subtracted once per port from the merged packet; the packet is clamped at 0.

**The single-hostile invariant.** With one hostile every delivery merges at its port: R + K + L + (c − 1)(B + L) − 2M equals the v3 transmission R + K + B·(c − 1) + L·c − 2M, clamped, minus armor. A regression test replays the v3 forecast and resolution on 160 randomized boards (every enemy of the v3 roster) and requires identical numbers wherever no install or overload is involved.

### Focus, aim and overflow

- **Focus.** One port is the focus. At the start of a fight: the leader; without one, the hostile with the most health. When the focus dies: the leader if alive, otherwise the living hostile with the least health (ties: port order). The player may set the focus at any time; the interface calls it the **target** (click a hostile, or F).
- **Aim.** Every delivery goes to the focus unless the player aims it at another living port. Aiming costs nothing and can be changed until the transmission. An aim persists between turns while its channel exists (a channel is identified by its sorted inner device ids, `channelKey`); a channel that disappears (cut, jam, breakdown) loses its aim, and a new channel follows the focus. The Ghost's buffer is one number released with the primary delivery, wherever it is aimed.
- **Overflow.** Damage beyond a hostile's remaining health flows to the focus if that is a different living hostile, otherwise to the next living port in order left, centre, right. Overflow pays the receiving port's armor. The forecast prints it ("overflow 3 → CENTRE").
- **Break thresholds** count only the packet that lands on the guardian's port, after armor and after overflow into it.
- **Traffic Shaping** sends every delivery to the focus this turn. **Broadcast Storm**, **Packet Storm** and **Flood Fill** add their amount to every living port's packet (they need a live route). **Demolition Charge** and Traffic Shaping add to the focus packet.

### The enemy phase with several hostiles

- **One shield pool.** Card block, Harden, Aegis, Null, separated circuits, Watchdog, Honeynet and Reclaim form one pool for the whole enemy phase; each attack draws from it in port order. Online firewalls block 2 of every breach and 1 of every strike, from any hostile (`firewallBreachBlock`, `firewallStrikeBlock`). Protocol shield belongs to the action it fired on. Shield Array stops up to 2 of the first hit that gets through each battle.
- **Chip once.** Corrosion, Worms in hand and "Exposed backbone" attach once per phase, to the first hostile that takes its turn; a pack does not multiply them.
- **Protocols once per phase.** Each armed protocol fires on the first matching action in port order (arming order among protocols); Failover Policy and Port Security cancel every cut or jam of that action, both halves of a twin or double fault included.
- **Fields and junk per caster.** Each caster installs its own field; a band still holds one hostile field, so a second caster on the same band replaces the first (announced). Junk is inserted per caster.
- **Targets never double up.** Disruptions are planned in port order against the board as transmitted; a later hostile never jams or cuts what an earlier one already took (honeypot decoys excepted). A fault whose target broke earlier in the phase lands on nothing.
- **Warden backpressure** lands in full on every port whose hostile struck or breached in the last enemy phase, provided two or more hostiles live and one of them attacked; otherwise it rides the primary delivery exactly as in v3.

### Pack shapes and health

A pack's summed health is `packHealthScale` (1.15) × the room's single-hostile health H; the shares (`packShares`) split it:

| Shape | Members | Health |
| --- | --- | --- |
| Duo (stage I, no leader) | two escorts, left and right | 0.575 H each |
| Pair | leader + one escort (left) | 0.75 H · 0.40 H |
| Trio | leader + two escorts | 0.63 H · 0.26 H · 0.26 H |

Each member's health is H × `packHealthScale` × share ÷ (sum of the shape's shares), rounded; with the shipped shares that is exactly share × H, and `packHealthScale` remains the single lever. Hardened adds 20 % to its carrier; ascension 1 (elites) and 2 (normals) scale H as usual, so they reach every pack member and reinforcement. Example: a stage II floor 3 room (H = 39) as Static Nest + Tap Spinner is 29 / 16.

Adds have fixed health: Gate Warden 8, Chorister 10, Quarantine Drone 14 (`addHealth`); ascension 6 multiplies it by `ascensionAddHealth` (1: unchanged, although the guardian gains 15 %).

### Pack frequency, templates and budget

Normal rooms hold a pack at `packRate` 25 % / 40 % / 55 % by stage (stage I from floor 3, `packFromFloor`); 40 % of stage III packs are trios (`trioShare`); ascension 9 adds 15 points (`packRateAscensionBonus`). Every elite from stage II leads its escort. Stage I elites and guardians fight alone. Signal in the Static rolls like the stage's normals.

Composition: an escort at most twice per pack, never two Splicers, never a Splicer and a Ward Node in one trio. Every template fits the threat budget: ≤ 1.3 × the stage's average single threat (`threatBudget`); reinforced fights ≤ 1.45 × (`reinforcedThreatBudget`). Threat is scored per three-action cycle (raw strike and breach damage, +2 per cut, jam or overload, +1 per field, junk batch or install, twin cut 3, a Breaker Charge 4; escorts over 1.5 actions per cycle). Headroom is the bad-designation weight a template can still carry; a bad designation that would exceed it falls back to Laden or Salvaged. Null Storm + Splicer (10.75 against a 10.5 budget) is the one template kept over budget.

| Stage · room | Templates (leader + escorts · threat · headroom) |
| --- | --- |
| I · normal | Spark Mite + Spark Mite · 6 · — · Spark Mite + Splicer · 6.75 · — (duos carry no designation) |
| II · normal | Packet Leech + Relay Drone · 10.5 · 0 · Null Storm + Splicer · 10.75 · 0 · Prism Widow + Ward Node · 10 · 0.5 · Glass Choir + Glass Echo · 9 · 1.5 · Wire Weaver + Tap Spinner · 10.5 · 0 · Static Nest + Tap Spinner · 9.5 · 1 |
| II · elite | Null Marshal + Glass Echo · 11.5 · 0 · Prism Widow + Glass Echo · 8.5 · 2 · Ferric Colossus + Tap Spinner · 11.5 · 0 · Scrap Foreman + Tap Spinner · 11.5 · 0 |
| III · normal pairs | Coil Serpent + Splicer · 10.75 · 1.5 · Ash Moth + Tap Spinner · 9.5 · 2 · Prism Widow + Ward Node · 10 · 2 · Wire Weaver + Rigger Drone · 12 · 0.5 · Glass Choir + Relay Drone · 11.25 · 1.5 · Static Nest + Tap Spinner · 10.5 · 2 · Root Blight + Ward Node · 10.5 · 2 |
| III · normal trios | Glass Choir + Glass Echo + Glass Echo · 12 · 0.5 · Coil Serpent + Splicer + Tap Spinner · 12.25 · 0 · Ash Moth + Spark Mite + Tap Spinner · 12.5 · 0 · Prism Widow + Ward Node + Glass Echo · 12.5 · 0 · Wire Weaver + Rigger Drone + Spark Mite · 12.5 · 0 · Root Blight + Rigger Drone + Glass Echo · 11.5 · 1 |
| III · elite | Grave Reaver + Relay Drone · 14.5 · 1.5 · Ferric Colossus + Ward Node · 15 · 1 · Gate Sentinel + Glass Echo · 14.5 · 1.5 · Scrap Foreman + Rigger Drone · 13.5 · 2 · Demolition Engine + Glass Echo · 14.5 · 1.5 |

Average single threat by stage: normals 6.2 / 8.1 / 9.75, elites — / 9.0 / 12.3 (`AVERAGE_SINGLE_THREAT` in `enemies.ts`).

---

## Routes, channels and online devices

A signal travels from ALPHA to OMEGA through at least one router. Cables are undirected. A jammed device or cut cable cannot carry a signal. Installations and wreckage are not part of the graph, but an unarmored cable whose straight span passes within 1.3 of a wreck is **frayed** (derived from positions, so relocating a device frays or mends its cables); a level-1 escalated cut also frays the next cable along the primary route for one player turn.

- **Route**: a simple ALPHA → … → OMEGA path through live cables containing at least one router. A direct terminal cable or a switch-only path is not a route.
- **Primary route**: the route with the highest route damage (below). Ties: fewer devices, then stable topology order (earliest-installed devices first). Only the primary route's devices contribute route terms.
- **Channels**: the maximum number of routes that share no intermediate device (ALPHA and OMEGA are shared). Computed exactly over at most twelve deployed devices. The forecast lists one maximum disjoint set, primary route first when it belongs to one; when it cannot, the list is the primary route followed by that set (so it may list one more path than the channel count). Each channel of the set is a delivery. In the game's words: **every device carries one channel; when two routes go through the same device, they are one channel, not two.**
- **Route count and shared devices** (display only, no rule reads them): the forecast counts live router routes, one per visited device set (`routeCount`; the ledger reads "4 routes · 3 channels"), and names the devices where routes merge (`sharedDevices`, each with the number of routes through it): the devices of a smallest set that every route passes through, whose size is the channel count on ordinary tables (Menger), preferring the sets the most routes pass through and keeping every device of a tied set, restricted to devices that two or more routes pass through. Two routers behind one switch mark the switch (2 routes, 1 channel); two routers with a cable between them mark both routers (3 routes, 2 channels); a dense mesh behind one hub marks only the hub.
- **Online device**: a non-terminal device that lies on at least one live route (any route, not only the channel set). Offline devices do nothing, with two exceptions: a cabled Honeypot decoys anywhere, and a Server Rack (never cabled, never online) shelters its ring and counts toward its band's cluster.

Enumeration keeps one strongest representative per visited device set and endpoint (for one device set, the path with the best amplified-minus-frayed cable signal), so a better route behind a dense branch is never missed; the forecast stays under 5 ms on a full fourteen-socket table with a trio and four installations (tested as the best of several batches; shared CI runners get a 15 ms budget).

### Why a transmission deals that much damage

| Term | Amount | Carried by | Stacking |
| --- | ---: | --- | --- |
| Live router route (primary) | +5 (`baseRouteDamage`) | primary | Once |
| Edge switches on the primary route | +1 each (Packet Lens: +2 each) | primary | No cap |
| Startup Config routers on the primary route | +1 each | primary | No cap |
| Overclocked routers on the primary route | +2 each | primary | No cap |
| Compressed switches on the primary route | +2 each | primary | No cap |
| Amplified cables on the primary route (Amplified Fiber, VXLAN; violet fibre on the table) | +1 each | primary | No cap |
| Frayed cables on the primary route (wreckage, or a level-1 cut's fray) | −1 each | primary | No cap |
| Resonance on a band crossed by primary-route hardware | +3 | primary | Per field per band (terrain, cast and signal fields stack) |
| Suppression on a band crossed by primary-route hardware | −3 | primary | Per field per band |
| Spanning Tree (boss relic) | + the route subtotal above (×2) | primary; bandwidth deliveries carry 0 | Replaces bandwidth and balancers |
| **Bandwidth** | +3 per channel beyond the first (Parallel Core: +4) | each bandwidth delivery | No cap |
| **Load Balancers** online | +1 per balancer | every delivery | No cap |
| **Cluster**: a band holding 3+ online devices (racks count) | +2 per band | primary | Terminals excluded |
| Siphon Taps on the table | −2 each | primary first, then bandwidth deliveries in port order | At most 4 installations |
| Burst this turn (cards) | Card amounts | primary | This turn only |
| BGP Hijack (boss relic) | +3 | primary | Every transmission |
| Backpressure (Warden) | Stored amount | primary; or in full on every port that attacked last phase (packs) | Consumed by the transmission |
| Buffer release (Ghost) | Whole buffer | primary | When not buffering |
| Priority Queue (relic) | +1 | primary, when its port's hostile has the least health (ties count) | — |
| Every port (Broadcast Storm, Packet Storm, Flood Fill) | Card amount | every living port | This turn only |
| Focus packet (Traffic Shaping, Demolition Charge) | Card amount | the focus port | This turn only |
| Exposed guardian | +3 (`exposedBonus`) | the guardian's port, when a delivery lands there | One transmission after an interrupt |
| Armor and plating | Negative, see Enemies | subtracted once per port from the merged packet | Bypassed while exposed; Spearhead's release ignores it |

Each port's packet is clamped at 0 ("Minimum signal damage"). A band counts once even if it holds both a terrain field and a cast field of the same kind. Resonance and suppression count bands crossed by deployed hardware; the fixed terminals never activate fields.

Examples:

- A basic router route deals **5**; with Startup Config **6**; a router + Edge Switch route with an overclocked router **5 + 1 + 2 = 8**.
- Two plain router channels: **5 + 3 bandwidth = 8**. Against Ferric Colossus the armor falls from 4 to 2: **6**, versus **1** on a single route.
- Three channels and one online Load Balancer: primary 5 + 1 and two bandwidth deliveries of 3 + 1: **6 / 4 / 4 = 14** on one port, or split across three.
- Against a Spark Mite + Splicer duo, two channels: 5 on the focus and 3 aimed at the other escort, or all 8 on the focus with anything beyond its health overflowing to the other.
- Containerlab: an overclocked router cabled to both terminals, **7**.
- Ghost buffers an 8-damage turn: **+16** stored; next turn **8 + 16 = 24** on the port the primary delivery is aimed at.

### Defense: why integrity damage is blocked

Each attack's raw damage is its intent amount (after pressure, stage threat, enrage, escalation, ascension, designation, trait and relic modifiers); corrosion, Worms in hand and chip terms join the first attack that lands. The phase's pool terms form one shield pool; each attack meets its own per-attack terms first, then draws from the pool in port order.

| Shield term | Amount | Scope |
| --- | ---: | --- |
| Block this turn (cards, Harden) | Card amount | pool |
| **Online firewalls** vs a breach / strike | 2 / 1 each; Stateful ×2; Zero Trust ×2; Bulkhead +1 per firewall; stacking | every attack |
| Separated circuits: two disjoint channels, one with a North router and one with a South router | 3 | pool |
| Aegis field: an online device in the band | 3 | pool |
| Null field: any hardware in the band | 2 | pool |
| Protocols: Failover Policy (on a cut), Rate Limiter (strike), IPS Signature (breach) | 3 (6+), 5 (8+), 6 | the action it fired on |
| Honeynet: a honeypot absorbed a disruption | 2 each | pool |
| Reclaim: an installation was destroyed | 2 each (`reclaimShield`; Sentry quarantine +2) | pool |
| Watchdog: first transmission of the battle with no live route | 5 | pool |
| Shield Array: first hit that gets through each battle | up to 2 | once per battle |

Firewalls only block strikes and breaches, and not on an interrupted ultimate. Faraday Shell is **jam protection**, Armored Fiber / VXLAN / Dark Fiber are **cut protection**, not block; jam protection does not stop an overload. An ordinary jam against an empty table, or a cut against a table without cables, deals 1 exposed-backbone damage; if a grid exists but every target is protected, the disruption fails harmlessly. Null Storm's and Ash Moth's band jams are exempt: an empty band is a successful dodge.

---

## The table front

The quarantine builds on your ground. Installations are hostile permanents; every deployed device has a condition and can break for the encounter; scrub, repair, firewalls, honeypots and racks answer.

### Reach

One radius for everything: two objects are within **reach** when their centres are at most 2.0 apart (`reach`). Jammers, Spikes, Breaker Charges, racks, firewall quarantine and honeypot bites all use it, and the table draws it as one ring on hover. Devices stand at least 1.55 apart; the auto-deploy grid's diagonal neighbours sit about 1.73 apart and its straight neighbours 2.4–2.5, so a reach ring catches diagonal and hand-placed neighbours and misses straight ones. Spacing is a decision.

### Installations

An installation stands at a table position, blocks placement within 1.3 (like wreckage), has integrity, and is never part of the graph. Integrity on arrival comes from `installationIntegrity`, capped at `maxInstallationIntegrity` (3).

| Installation | Integrity | Effect | Socket | Planted by |
| --- | ---: | --- | --- | --- |
| Siphon Tap | 1 | −2 transmission damage while it stands (the v3 malware), from the next transmission | band socket | Packet Leech, Tap Spinner, Static Nest, the enraged Blackout Core's jam, Nesting and level 3 (stages I–II) |
| Jammer | 2 | Each enemy phase it jams the nearest unprotected device within reach. A cabled honeypot decoys it and bites it; Port Security cancels it and hurts it. | reach socket beside its target | Static Nest, Quarantine Drone, Nesting and level 3 (stage III) |
| Spike | 2 (3 from a Rigger Drone while a leader lives) | Each enemy phase it wears the nearest device within reach by 1 (honeypots included, no bite; ties: primary route, then earliest installed) | reach socket | Scrap Foreman, Rigger Drone, Rigged |
| Anchor | 3 | Hostile fields in its band do not tick down. Purge Field on that band destroys the Anchor and nothing else. | band socket (Root Blight: the band it corroded) | Root Blight |
| Breaker Charge | 1 | Countdown 2 (`breakerCountdown`), shown on the table; it ticks each enemy phase once active. At 0 it detonates: every device within reach breaks regardless of condition (racks in the blast break too; a device sheltered by a rack outside it passes 1 wear to that rack instead), and its socket becomes wreckage. | reach socket (Demolition Engine: beside the device with the most cables) | Demolition Engine, ascension 10 guardian charges |

**Placement.** At most 4 installations stand at once (`maxInstallations`). An install against a full table instead gives the oldest installation +1 integrity (maximum 3); the forecast states which. Band sockets use the v3 malware rule: the free socket nearest the centre of the busiest band, Center then North then South on ties. Reach sockets choose a target device first (by default the most valuable primary-route router, ties: earliest installed; Rigger Drone: the device the leader's action names this phase; Demolition Engine: the most cabled device; Rigged: the cut cable's nearer device), then the first legal point of twelve compass points at 1.6 from it, starting at the point facing the far rail and turning clockwise, then the same twelve at 2.0 (`reachRings`); if none is legal, the band-socket rule applies. One install per hostile action, plus riders; a lethal packet on the planter cancels it.

**Timing.** An installation acts from the hostile action after the one that planted it. Installations act once per enemy phase, in placement order, after every hostile's own action; an installation is active in a phase when a later hostile acted after its planter (so a Rigger Drone's Spike planted from the left port can wear in the same phase if the centre hostile acts after it). A Siphon Tap is passive: its −2 applies from the next transmission.

### Removing installations, and Reclaim

- **Scrub**: click an installation (or its ledger tag): 1 energy removes 1 integrity; at 0 it is destroyed. While a Quarantine Drone lives each point costs 2.
- **Purge Field** destroys every installation in its band, plus hostile fields and jams. An Anchor takes the whole purge alone: the band's field needs a second purge (or the Anchor's removal first).
- **Firewall quarantine**: in the trap step of every enemy phase, each firewall online at transmission time deals 1 (`quarantineDamage`; Sentry Firewall 2, `sentryQuarantine`) to the nearest installation within reach, whatever its route delivers. Two firewalls may hit the same installation.
- **Honeypot bite**: an installation planted within reach of a cabled Honeypot arrives with 1 less integrity (`honeypotBite`); Taps and Breaker Charges arrive destroyed. Honeynet adds nothing to the arrival bite.
- **Demolition Charge** destroys one installation of your choice outright.
- **Reclaim**: every destroyed installation grants 2 shield (`reclaimShield`) to the coming enemy phase's pool (Sentry quarantine kills +2, `sentryReclaimBonus`). It feeds the Warden's backpressure at the normal rate and cannot be banked.
- **Scorched Earth** (boss relic): the planter of a destroyed installation takes 4 (the focus if the planter is dead).

### Condition, wear, breakdown and repair

- Every deployed device has condition 2 (`deviceCondition`); salvage pre-placed by terrain, dropped from crates or by a Salvaged hostile has 1 (`salvageCondition`). A Server Rack has 3 (`rackCondition`). Reinforced Frame adds 1 (`reinforcedFrameCondition`); Scorched Earth removes 1 (`scorchedEarthCondition`, minimum 1); Redundant PSU raises a device's maximum to 3 for the battle (`psuCondition`). Terminals and Phantom Nodes have no condition.
- **Overload** is an intent kind: no integrity damage, 1 wear to its target. It follows the jam rule: a cabled honeypot outside a rack's ring first (it bites for 3, Honeynet applies), then a primary-route device, then the first eligible device. Jam protection does not stop it; racks and phantoms are never its target. Scrap Foreman's overload prefers the most worn primary-route device.
- **Spikes** wear 1 each phase; a **detonation** breaks everything within reach; the enraged Blackout Core's **Total Blackout** wears every primary-route device by 1 (`blackoutWear`), before the right-port add acts; at ascension 6 the Regent's CLOSE THE GATES and the Choir's STOLEN VOICE also wear their target.
- **Racks shelter.** A device within reach of a Server Rack cannot be overloaded, spiked or detonated: the nearest rack takes the wear instead.
- **Breakdown** at condition 0: the device is removed with all its cables, its upgrades (configured, overclocked, amplified, shielded) and its aims; its socket becomes wreckage for the encounter (fresh, tinted in its role's colour), with the usual 1.3 clearance and fraying. Hardware cards already cycle to the discard pile when played, so a breakdown changes no pile; Containerlab, Emergency Rebuild and Clabernetes deployments are gone for the encounter anyway. Racks and phantoms leave no wreckage. Wreckage from terrain, breakdowns, detonations and COLLAPSE shares a cap of 6 (`wreckCap`); beyond it the socket is simply freed. Routes, channels, online state and aims are recomputed at once; a breakdown that removes the only route causes packet loss at the start of the next turn.
- **Repair**: click a worn device (or its Repair plate): 1 energy restores 1 condition. Hot Patch, Fast Reroute, Link Recovery and Harden also restore 1 (`faultClearRepair`) on the most worn device (ties: primary route first). Field Repair restores every device; Redundant PSU restores one to full. Condition resets when the encounter ends.
- The forecast names every wear point and breakdown a turn ahead ("breaks Core Router · wreckage remains").

---

## Escalation and the guardian charge

### Escalation levels

Pressure is `floor(actions already taken / 3)` and adds to strikes and breaches, unchanged in every stage. On the same per-hostile action counter the leader also reaches three **disruption levels**, on the stage's cadence: stages I–II from the 4th action and every 3 after (`escalationStart`, `escalationEvery`: actions 4 / 7 / 10); stage III from the 3rd and every 2 (`escalationStartLate`, `escalationEveryLate`: 3 / 5 / 7). Only leaders, singles and guardians escalate; in a pack the leader is the clock. Levels are cumulative:

| Level | Rule added |
| ---: | --- |
| 1 | A cut also frays the next cable along the primary route (toward OMEGA, else toward ALPHA) for one player turn: −1 while on the primary route; armored cables are immune. A jam lasts two player turns. |
| 2 | A jam hits two devices and a cut two cables (the normal target, then the next eligible). Hostile fields last one more turn. |
| 3 | Strikes and breaches +1. The first action of every pattern cycle also plants an installation at the forecast socket: a Siphon Tap in stages I–II, a Jammer in stage III (the cap of 4 holds). |

The enemy plate carries a three-pip gauge, and the intent panel names the next level two actions ahead ("Level 2 in 2 actions: jams hit two devices"). Escalated faults follow the normal target order, so one honeypot absorbs the first and the second lands; Failover Policy and Port Security cancel both. Stoked moves every level 1 action sooner (stage III: 2; `stokedAdvance`, `stokedAdvanceLate`); the SURGE signal advances the leader one level at once. Levels modify only the leader's own intents: a Jammer's jam lasts one turn at every level, a Spike wears 1, a charge counts 2. A reinforcement arrives with no counter and never escalates.

### Guardian charge timing

A guardian charges on its fifth action **or** on its first action after falling to half health (the enrage threshold: 50 %, 60 % at ascension 10), whichever comes first; the ultimate follows on the next action; the pattern then resumes where the charge pre-empted it. The half-health trigger only pre-empts the first charge of the fight; an early charge spends that cycle's charge and ultimate. The forecast labels an early charge "WOUNDED". The guardian's escalation counter keeps running through the charge: in stage III the Blackout Core reaches level 2 on its fifth action, so Total Blackout's corrosion lasts a turn longer and its next jam hits two devices.

**Adds.** When a guardian's charge is announced (the end of the phase before the charge), it raises two adds at the empty side ports. They stand on the charge turn with their intents shown (RISING, dormant through the charge phase) and can be killed there; they act from the ultimate turn, the left one before the guardian and the right one after, then every phase until killed. The next charge raises adds only at empty ports.

| Add | Raised by | Health | Ultimate-turn action | Afterwards | Trait |
| --- | --- | ---: | --- | --- | --- |
| Gate Warden ×2 | The Iron Regent, THE CROWN RISES | 8 | IRON STEP strike 2 | Strike 2 every phase | +4 break each. No armor. |
| Chorister ×2 | The Hollow Choir, ONE LAST BREATH | 10 | DESCANT strike 2 + 1 Packet Loss | HELD NOTE strike 2 every phase | +4 break each. While any lives the Choir's plating is 3 (`choirAddPlating`). |
| Quarantine Drone ×2 | Blackout Core, EVENT HORIZON | 14 | ISOLATE: plants a Jammer at 1.6 from the primary router | SEAL THE SHELL strike 3 every phase | +4 break each. While one lives, scrubbing costs 2 per point. |

Each add alive when the ultimate resolves raises the break threshold by 4 (`addBreakBonus`, raised from the design's 3 in balance; ascension 10: 5, `addBreakBonusLate`): Regent 12 → 16 → 20, Choir 15 → 19 → 23, Core 18 → 22 → 26. Interrupting the ultimate cancels the guardian's action only; the adds still act. Adds are hostiles, not installations: they cannot be scrubbed and carry no crates and no designations.

---

## Designations

A designation is one modifier on a leader or single hostile, never on an escort, an add or a guardian: one ribbon word, one plate line, one entry in the forecast. Ten exist; eight are bad, two are good (`DESIGNATIONS` in `enemies.ts`). In the story they are firmware revisions and cargo manifests.

| Designation | Rule | Kind | Threat | Weight | May carry it |
| --- | --- | --- | ---: | ---: | --- |
| NESTING | Its first action also plants a Siphon Tap at the forecast socket (stage III: a Jammer beside the primary router). | bad | 1.5 | 1 | Every leader and single except Packet Leech and Static Nest |
| ARMORED | Plating absorbs 2 (`armoredPlating`) of the merged packet unless a firewall is online; it stacks with a Ward Node's link. | bad | 1.5 | 1 | Hostiles without armor or plating (not Gate Sentinel, Ferric Colossus, Null Marshal) |
| STOKED | Every escalation level arrives 1 action sooner (stage III: 2). | bad | 2 | 1 | Every leader and single, from stage II; never with Shedding |
| SHEDDING | Below half health it raises one escort, with a crate, at an empty port at the end of that enemy phase: Spark Mite in stage I, Splicer in II, Ward Node in III, at 0.26 H. It is the fight's reinforcement. | bad | 2 | 1 | Every leader and single except Grave Reaver, with an empty port at roll time (never a trio leader) |
| HARDENED | +20 % health (`hardenedHealth`); its strikes deal 1 less (`hardenedStrike`). | bad | 1.5 | 1 | Every leader and single |
| RIGGED | Each of its cuts that lands or is decoyed also leaves a Spike (integrity 2) at a reach socket beside the cut cable's nearer device. Failover Policy or a Phantom Node stops them. | bad | 1.5 | 1 | Hostiles with a cut in their pattern (Coil Serpent, Wire Weaver, Prism Widow, Null Storm, Cable Wraith, Gate Sentinel), from stage II |
| HUNGRY | Heals 2 (`hungryHeal`) after any transmission that dealt it no damage (buffered, aimed elsewhere or no route). | bad | 1.5 | 1 | Every leader and single except Packet Leech and Static Nest |
| SPITEFUL | Its last announced action resolves even if it dies that turn. | bad | 1.5 | 1 | Stage III hostiles only; never hidden |
| LADEN | Carries an undelivered message: defeating it drops a message you answer with a named choice. | good | 0 | 1.5 | Every leader and single |
| SALVAGED | On defeat it drops salvage hardware at the first free auto-deploy socket, condition 1. | good | 0 | 1.5 | Every leader and single |

**Rolling.** Designations are rolled with the chart. A leader or single carries one at `designationRate` 20 % / 35 % / 50 % by stage (stage I from floor 3, `designationFromFloor`); every elite from stage II carries one; duos carry none. Bad and good roll from one weighted table (bad 1 each, Laden and Salvaged 1.5 each). A bad designation heavier than the template's headroom falls back to Laden or Salvaged, so the heaviest packs most often carry cargo. Ascension 7 gives elites a second designation half the time (`eliteSecondDesignation` 0.5); ascension 10 lets normals roll a second at half the room's designation chance (`normalSecondDesignation` 0.5). Two designations never repeat, never pair Stoked with Shedding, are never both good, and ignore the ascension 0 budget.

**Reveal.** The chart shows the ribbon when the room is scouted. In an interference room (`hiddenShare` 30 % / 40 % / 50 % of designated rooms by stage) the chart shows UNKNOWN DESIGNATION instead; the ribbon is revealed at the entrance line, before the first player turn, and the first forecast already includes it. Good and bad hide equally; Spiteful is never hidden.

**Details.** Hardened's −1 is part of the strike's amount and shown in its label. Spiteful keeps resolving its whole action after its death (trap damage and protocols answer it as usual; its installation still lands); if it was the last hostile, the fight ends after its action, and integrity 0 still loses.

---

## Surprises

### The surprise contract

1. Everything on the table is exact. Any hostile, installation, add, field, fault, wear point or wreck that exists when the forecast is computed resolves with the forecast's numbers and targets.
2. Arrivals are announced at least one enemy action ahead, with their exact effect: reinforcements name the escort and the count; adds are shown on the charge turn with their intents; signals are named in the forecast one turn before they fire, with their band, socket, device or hostile.
3. Hidden designations are revealed at the entrance line, before the first player turn, and the first forecast includes them. The chart's UNKNOWN DESIGNATION glyph is the only thing the player commits to blind.
4. Crate contents are rewards: fixed when the encounter begins (seeded by the chart, never the card RNG), revealed when the escort dies, and never able to change a number that resolves against the player in that phase. Crate contents and message options are never in the forecast.
5. Messages offer named choices; each states its exact result; nothing is rolled after the choice.
6. Spiteful is the one exception to "a dead hostile does nothing", printed on the plate, in the forecast ("resolves anyway") and in the Handbook.

A fight holds at most one reinforcement and at most one signal, and a fight with a reinforcement (or a Shedding hostile) rolls only good signals, so the worst case is one hidden designation, one announced arrival and the escalation clock.

### Reinforcements

| Stage | Frequency (`reinforcementRate`) | Escort | Count (enemy phases) |
| --- | --- | --- | ---: |
| I | none (a Shedding spawn only) | — | — |
| II | 15 % of packs and singles with an empty port; 15 % of elites, decided by the chart | Spark Mite, Splicer or Relay Drone | 2 (`reinforcementCount`) |
| III | 25 % of packs and singles with an empty port; every elite, decided by the chart | Splicer, Ward Node, Tap Spinner, Glass Echo or Rigger Drone | 2; elites 3 (`eliteReinforcementCount`) |

The entrance line announces it ("SIGNAL DETECTED · a Splicer arrives in 2 actions") and every forecast counts it down until arrival ("arrives after this action"). After the phase in which the count reaches zero it takes the first empty port (left before right) and acts from the next phase on its port's parity; if no port is empty it waits another phase. It has 0.40 H in a single's room and 0.26 H beside a leader and escort (`reinforcementShares`), on top of the pack budget; the escort must fit the 1.45 × reinforced band (in stage II a reinforced Static Nest pack receives a Relay Drone, and Leech packs are never reinforced). It carries a crate and is an escort in every respect. Guardian fights never roll one; trios never can. Elite reinforcements are decided on the chart floor by floor: an elite is reinforced unless a path through it already crosses a reinforced elite.

### Crates

Every escort (including reinforcements and Shedding spawns) carries a sealed crate glyph; the plate says that it carries something, not what. Adds carry none.

| Contents | Weight (`crateWeights`) | Exact effect |
| --- | ---: | --- |
| Salvage hardware | 30 % | A device lands unconnected at the first legal auto-deploy socket at the end of the enemy phase, condition 1, yours once cabled. Stage I: switch or firewall · II: switch, firewall, cache or power · III: cache, power, balancer or firewall. No legal socket, or the fight is over: 3 credits instead (`crateFallbackCredits`). |
| Credits | 25 % | 3–6 credits (seeded), banked and shown on the reward screen as "crates". |
| Encounter card | 20 % | Choose one of two named cards (each rolled like a normal reward slot, with the stage's pre-upgrade chance); it enters your hand before the next hand is dealt, exhausts when played and vanishes at encounter end. |
| Empty | 25 % (`crateEmptyShare`) | "Empty crate." Bill of Lading turns this share into credits. |

One in four non-empty crates (`crateMessageShare`) also holds an undelivered message. Each crate rolls from its own seeded stream, so one crate never shifts another's contents. A crate opens when its escort dies, after the phase's resolution; salvage lands at the end of that enemy phase, so it can never change a number or target resolving in it.

### Undelivered messages

Dropped by Laden hostiles and by one in four non-empty crates. A message is a journal dialog with two named choices (three with Bill of Lading), drawn without replacement by the chart seed; it opens at the start of the next player turn before the hand is dealt, or on the victory screen, and never interrupts the enemy phase. It has no close stud: the message was already opened.

| Option | Weight | Exact result |
| --- | ---: | --- |
| Restore | 3 | Restore 2 integrity now (`messageRestore`). |
| Reinforce | 1 | +1 maximum integrity, permanently (`messageMaxIntegrity`); it heals nothing. |
| Credit | 3 | 6 credits (`messageCredits`; ascension 7 applies), banked if taken mid-fight. |
| Recover | 2 | A named rare card enters your hand for this encounter only; it exhausts when played. Left out when no hostile is standing. |
| Purge | 2 | Every junk card leaves your piles for this encounter, and one CVE leaves your deck permanently if you carry one. |

### Signals

A signal is a one-time change to the ground or the leader. It is announced at the start of turn 2 with its target named ("NEXT TURN: interference suppresses the NORTH band for 2 turns, if the fight lasts") and fires at the start of turn 3 (`signalTurn`), before the hand is dealt, so turn 2's forecast of turn 3 already includes it. `signalRate`: 10 % of stage II fights, 15 % of stage III fights; never in a guardian fight or the expedition's first fight; one per fight; a fight that ends before turn 3 never fires it. Good and bad weigh equally, except beside a reinforcement or Shedding (good only); a bad signal that would push a pack over its budget turns good; RESYNC and SURGE need a leader.

| Signal | Kind | Target named at the announcement | Effect when it fires |
| --- | --- | --- | --- |
| RELAY FLICKER | good | The band with the most of your hardware (Center on ties) | A resonance field for 2 turns (`signalFieldTurns`) in its own slot; it stacks with a cast Resonance Field. |
| COLD START | good | A salvage device, or a socket and role | The salvage device is cabled to its nearest device at no cost and its condition becomes 2; with none, a salvage device lands at the named socket (or the next free one), uncabled. |
| RESYNC | good | The leader | The leader's next action is skipped and its counter does not advance. Escorts act as normal. |
| INTERFERENCE | bad | The band your primary route crosses most (Center on ties) | Suppression for 2 turns in its own slot; Purge Field clears it. |
| COLLAPSE | bad | The free auto-deploy socket nearest your primary route's midpoint | The socket becomes wreckage (cap 6); any device standing on it breaks; unarmored cables crossing it fray at once. |
| SURGE | bad | The leader | The leader's escalation advances one level at once. |

---

## Devices

| Role | Cards | Ability |
| --- | --- | --- |
| Router | Core Router, Hardened Router (jam-protected), Containerlab/Emergency Rebuild (auto-cabled), Clabernetes (clone) | Every route needs one. Configured +1, overclocked +2 on the primary route. |
| Switch | Edge Switch, Signal Relay (jam-protected), Linux Bridge (auto-cabled), Spine-Leaf (cabled to every router) | +1 on the primary route; compressed +2 more. |
| Firewall | Trust Gate, Bastion (jam-protected), Stateful Firewall (blocks double), Sentry Firewall (quarantine 2; jam-protected when upgraded) | Online: blocks 2 of every breach or 1 of every strike; firewalls stack. Online: quarantines the nearest installation within reach each phase. No damage bonus. |
| Honeypot | Honeypot | While it has at least one cable, jams, cuts and overloads target it first (at most one per hostile action) and each absorbed disruption deals 3 to the attacker (Honeynet +2 and 2 shield); it decoys a Jammer's jam and bites the Jammer. Installations planted within reach arrive with 1 less integrity. Works offline. Cable Wraith's cut ignores honeypots. |
| Cache | Cache Server | Online at the start of your turn: draw 1 more. |
| Power | PoE Injector | Online at the start of your turn: +1 energy. |
| Balancer | Load Balancer | Online: +1 damage on every delivery. |
| Rack | Server Rack | Never cabled, carries no signal. Devices within reach cannot be overloaded, spiked or detonated: the nearest rack takes the wear. Condition 3. Counts toward its band's cluster and corrosion. Leaves no wreckage. |
| Phantom | Phantom Node | Never cabled, on no route. Absorbs the next jam, cut, overload or installation aimed at your table (first in port order; two when upgraded), then fades. |

"Start of your turn" is evaluated on the post-phase board, after new faults and breakdowns, so a cut, a jam or a breakdown can take a cache or injector offline for that turn. The forecast shows next turn's energy and draw.

### Enemy disruption targeting (deterministic, forecast)

- **Jam**: a cabled, unprotected honeypot first → (Null Marshal) an online firewall → a primary-route device → the first eligible device; never racks or phantoms. Storm and Moth jams consider only their announced band. Level 2: a second device after the first.
- **Cut**: an unarmored honeypot cable first (not for Cable Wraith) → Cable Wraith: the longest unarmored cable (cable ID breaks ties); a cut longer than 6 units also deals 1 damage → others: a primary-route cable → the first eligible cable. Splicer's twin cut and level 2 take a second cable.
- **Overload**: a cabled honeypot outside a rack's ring → (Scrap Foreman) the most worn primary-route device → a primary-route device → the first eligible device.
- **Hostile field**: suppression targets the band holding the most primary-route hardware; corrosion the band holding the most deployed hardware. Ties prefer Center, North, then South. Band jams with a field use the jam band. Root Blight's CORRODE picks the busiest band and remembers it; SPREAD corrodes the adjacent band with the most hardware.
- **Installations**: band and reach sockets as in [The table front](#installations); a Jammer jams the nearest unprotected device within reach; a Spike wears the nearest device within reach.
- **Answer order** within a phase: honeypot decoys (targeting), then protocols (first matching action in port order), then Phantom Nodes (the first remaining unit in port order: within a hostile, its install, jams, cuts, overload). A Port Security left unfired by the hostiles may cancel a Jammer's jam later in the phase.

Every card play, aim, relocation, repair and scrub updates the forecast before you commit.

---

## Consoles and engines

Each archetype has one console command, usable once per turn (SDN Controller: twice, except Buffer), shown in the battle command dock (key **C**).

| Console | Cost | Rule |
| --- | ---: | --- |
| Patch Cable (Architect) | 1 (+1 Zero Trust) | Connect two devices with a standard cable. It is not an Optic Fiber, so Hot Swap does not apply. |
| Harden (Warden) | 1 | Gain 2 block, +1 per online firewall, +1 per hostile on the field beyond the first, +1 more per living guardian add, and restore 1 condition on your most worn device. |
| Buffer (Ghost) | 0 | Toggle: this turn's transmission is stored instead of dealt. Use again before transmitting to cancel and refund the use. |

**Mesh (Architect).** Width is power and destinations: every channel beyond the first adds a delivery, Load Balancers add a point to every delivery, clusters reward crowded bands, and Hot Swap plus Patch Cable make cables cheap. Three channels and a balancer deliver 6 / 4 / 4, enough to finish an escort and press the leader in one turn; Flood Fill cashes width in on every port, and Rapid Redeploy rebuilds a broken router the same turn. The cost is exposure: more cables to cut, more devices inside reach rings, Weaver's tension trap and corrosion on crowded bands.

**Harden against packs (v4 balance addition, pending the user's approval).** Harden's +1 per hostile beyond the first (`hardenPerHostile`) and +1 more per living guardian add (`hardenPerAdd`) are not in the Proposal 4 design: the balance probe found the Warden far below the target band (17 % at ascension 0 against 30–36 %), losing mostly to guardians whose adds and escalation stretch its fights into a second charge cycle, and no number alone fixed it (see [Balance evidence](#balance-evidence-v4)). With one hostile and no adds Harden is the v3 console; both keys at 0 restore the design's Harden.

**Fortress (Warden) — Backpressure.** Half the damage your shield prevents during an enemy phase (rounded up, `backpressureRatio`) is stored and added to your next transmission as "Backpressure", then consumed. Against a pack it lands in full on every port whose hostile struck or breached you last phase. It persists while you have no live route. Reflect doubles it. Prevented damage counts every raw source (attacks, corrosion, Worms, chip); Reclaim shield feeds it like block. Harden repairs 1 per use, so a Spike-plus-overload cadence costs the Warden nothing extra, and its block grows with the number of attackers.

**Surge (Ghost) — Buffer.** While buffering with a live route, the transmission stores `⌊max(0, sum) × 2⌋` (`bufferMultiplier`), where the sum is every delivery (backpressure and burst included) plus every-port and focus bonuses, before armor and the exposed bonus (stored packets meet armor when released). Aim does not matter while buffering: a buffered turn deals 0 to every port. The next normal transmission with a live route releases the whole buffer with the primary delivery ("Buffer release"), on whichever port that delivery is aimed; it counts toward interrupting an ultimate, and Spearhead makes it ignore armor and plating. **Packet loss**: if you would start a turn with a positive buffer and no live route (a cut, a jam or a breakdown), the buffer is lost; the forecast warns ahead. Store and Forward adds 4 (6+) directly; Replay Attack doubles the buffer. A buffered turn deals 0 to every port, so Packet Leech and a Hungry hostile heal. The buffer resets at encounter end.

---

## Protocols

Protocol cards (keyword **ARMED**) are paid and armed face down in one of **two** protocol slots (`maxProtocols`). They persist across turns until a matching hostile action triggers them, then go to discard. Unfired protocols vanish at encounter end (the deck is the master list). Each trigger fires **once per enemy phase**, on the first matching action in port order; among armed protocols of the same trigger, arming order decides. The forecast names every protocol that will trigger and includes its effect in every number.

| Protocol | Cost | Trigger → effect |
| --- | ---: | --- |
| Failover Policy | 1 | A hostile action would cut a cable → cancel all of that action's cuts (and any Rigged Spike), gain 3 shield for it (6+) |
| Port Security | 1 | A hostile action would jam a device → cancel all of that action's jams, the attacker takes 4 (7+); unfired by the hostiles, it cancels a Jammer's jam and the Jammer takes the damage |
| Rate Limiter | 1 | A strike hits → 5 shield against it (8+) |
| IPS Signature | 2 (1+) | A breach hits → 6 shield against it |
| Quarantine Rule | 1 (0+) | A hostile casts a field → cancel the field |
| Tarpit | 1 | A guardian charges or unleashes an ultimate → it takes 8 (12+) |

Details: protocols do not fire on a disruption a honeypot already absorbed; a lethal packet on a hostile fires none against it; on an interrupted ultimate no attack remains to trigger them. Protocol shield belongs to the attack it fired on. Honeypot, Port Security and Tarpit damage resolves in the trap step, before any hostile acts; if it defeats a hostile, that hostile's action is cancelled, and if none stands, you win.

---

## Bands, fields and placement

The table has three bands: **North** `z < −1.3`, **Center** `−1.3 ≤ z ≤ 1.3`, **South** `z > 1.3`. Terminals are fixed at `x = ±5.3`, `z = 0`. The build grid is `|x| ≤ 7.25`, `|z| ≤ 4.7`. Fourteen devices including both terminals fit on the table (racks and phantoms included); device centres must be at least 1.55 apart (`deviceSpacing`) and at least 1.3 (`debrisClearance`) from wreckage or installations. Illegal sockets explain why (`isBlocked`) and cost nothing. The installation cap (4) and the wreck cap (6) are hard limits: with four installations and six wrecks, every terrain layout the generator can produce (every wreck subset, with and without salvage; `src/core/sockets.test.ts`) keeps at least 8 legal auto-deploy sockets; the measured minimum is 27 with engine placement and 15 against a worst-case adversary.

Crowding versus spreading is the band tension (Gwent rows):

- **Cluster**: 3+ online devices in one band (racks count): +2 damage per clustered band.
- **Separated circuits**: two disjoint channels, one with a North router, the other with a South router: +3 shield.
- Corrosion, Null Storm and Ash Moth punish crowded bands; Prism Widow and Ash Moth suppress the band your primary route crosses; installations crowd the busiest band; reach rings punish tight spacing.

| Field | Effect |
| --- | --- |
| Resonance Field · 1 (0+) | +3 when the primary route crosses the band. 3 turns. |
| Aegis Field · 1 (0+) | +3 shield while an online device sits in the band. 3 turns. |
| Null Field · 1 (0+) | +2 shield while any of your hardware occupies the band. 3 turns. |
| Purge Field · 0 | Destroy every installation in the band and remove hostile fields (including terrain interference) and jams in it. An Anchor takes the whole purge alone. Draw 1 (2+). Exhaust. |
| Corrosion (hostile) | +2 incoming damage while your hardware occupies the band. |
| Suppression (hostile) | −3 when the primary route crosses the band. |

Each band holds one temporary allied and one temporary hostile field; recasting replaces that side, and a second hostile caster on a band replaces the first. Terrain fields and signal fields keep their own slots. Allied fields affect three transmissions; hostile fields are installed after the action that casts them and affect the next two turns (`hostileFieldTurns`; three at ascension 9; one more at escalation level 2). Fields in a band with an active Anchor do not tick down; when the Anchor dies they resume from their remaining turns. A lethal packet on the caster or Quarantine Rule cancels an incoming field. Dragging a device previews destination band, damage, shield and integrity loss; the drop then asks on the relocation plate before paying the relocation energy.

Deterministic auto-deployment (Containerlab, Emergency Rebuild, Clabernetes replicas, crate salvage, Salvaged drops, COLD START landings) uses the first legal socket in the order x ∈ {0, −2.5, 2.5, −5, 5, −1.25, 1.25, −3.75, 3.75, −7, 7}, z ∈ {0, 2.4, −2.4, 4.2, −4.2, 1.2, −1.2}.

### Encounter terrain

Every battle starts on a different table (`src/core/terrain.ts`), generated from seed, stage and room with a local generator that never consumes the run RNG:

- The first fight of an expedition is always calm: no wreckage, salvage or field.
- Otherwise **1–2 wreck sockets** in stage I and **1–3** later, chosen from fixed spots that are never within 2 units of the centre or 1.3 of the centre line, so the classic ALPHA → centre router → OMEGA opener always exists and never frays (tested). No device may sit within 1.3 of a wreck, and an unarmored cable crossing that scorched ring frays: −1 damage while it is on the primary route. Armored Fiber, VXLAN and Dark Fiber never fray. Link targeting marks devices a new cable would fray to, and the table previews the cable before you commit. Terrain wrecks share the cap of 6 with breakdowns, detonations and COLLAPSE.
- 50 %: one **salvage** device pre-placed unconnected, condition 1: switch or firewall in stage I; switch, firewall, cache or power in stage II; cache, power, balancer or firewall in stage III. It is yours once cabled.
- 30 %: a permanent terrain field in one band: **Crystal vein** (Resonance, 55 %) or **Interference** (Suppression, can be purged). A terrain field and a cast field of the same kind stack (e.g. Resonance Field on a Crystal vein band gives +6).
- A name and one-line description ("Collapsed rack row", "Flooded conduit", "Crystal vein", …) open the encounter, with the revealed designations and any reinforcement warning beneath.

---

## Siphon Taps, junk and curses

- **Siphon Tap** (Packet Leech's SIPHON TAP, Tap Spinner, Static Nest's LAY A TAP, the enraged Blackout Core's jam, Nesting and level 3 in stages I–II): the v3 malware, now an installation with integrity 1. Each Tap costs −2 damage per transmission and occupies its socket. Scrub it for 1 energy, purge its band, quarantine it with a firewall, or let a honeypot bite it on arrival. Packet Leech and Tap Spinner heal 1 per Tap after they act.
- **Packet Loss** (junk): unplayable; exhausts at end of turn if still in hand.
- **Worm** (junk): pay 1 to delete it (exhaust). Each Worm in your hand when you transmit adds 2 to the enemy phase's first attack (blockable, forecast).
- **CVE** (curse): unplayable, permanent. Enters the deck from The Unpatched Server or ascension 5. Remove it at a sanctuary, market or event; Rogue DHCP transforms it into a common; a message's Purge removes one.

Junk is inserted into the draw pile at seeded positions when the action resolves and never enters the deck; every encounter rebuilds its piles from the deck.

---

## Enemies and pressure

Normal health is `16 + 5 × floor + 13 × stage` (zero-based); elite health `30 + 2 × floor + 10 × stage`; guardians 67, 96 and 132; Signal in the Static ×1.4. A pack shares that health (see [Pack shapes and health](#pack-shapes-and-health)). Ascension multiplies them (below). Patterns repeat in order.

**Pressure** is `floor(actions already taken / 3)`. The strikes and breaches of leaders, singles and guardians add pressure plus the stage index (+1 in stage II, +2 in stage III), enrage and escalation level 3 (+1); every hostile's attacks add ascension 4 (+1) and BGP Hijack (+2) and lose 1 to Ingress Filter.

### Leaders and singles

| Enemy | Repeating pattern | Trait and counterplay |
| --- | --- | --- |
| Packet Leech | Strike 2 → **Siphon Tap** (install) → Breach 3 | Heals 1 per Tap after acting and 3 after a transmission that deals it nothing. Scrub taps; keep damage flowing. |
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
| Wire Weaver | Cut + suppression → **OVERTENSION** overload → Strike 3 | Strikes +2 with 6 or more cables on the table. Overtension wears a device by 1: repair between overloads, armor key cables, stay compact. Stage I meets wear only here. |
| Grave Reaver | Breach 3 + corrosion → Strike 3 → Corrosion | At half health: strikes and breaches +2. |
| Scrap Foreman (II, III elite) | CONDEMN overload → DRIVE A SPIKE (install) → HAMMER FALL strike 3 | Its overload prefers the most worn primary-route device; while a Spike stands its strikes deal +1 (`foremanSpikeBonus`). Repair between overloads, scrub the Spike or move its neighbour, a rack, a honeypot. |
| Static Nest (II, III normal) | HATCH A JAMMER (install) → STATIC BITE strike 2 → LAY A TAP (install) | Heals 1 per installation on the table after acting (`nestHeal`); its strike deals +1 per installation (`nestStrikeBonus`). Firewalls beside the busiest band, honeypots, Purge; its install turns deal nothing, so race it. |
| Demolition Engine (III elite) | SET A CHARGE (install Breaker) → PISTON STRIKE strike 3 → CRUSH overload | Its charge lands beside the device with the most cables; while a charge is armed its strikes deal +2 (`demolitionArmedBonus`). Scrub the charge, move out of the ring, Demolition Charge, a Phantom Node. |
| Root Blight (III normal) | CORRODE → SINK AN ANCHOR (install, in the corroded band) → OXIDE BREACH breach 3 → SPREAD corrosion on the adjacent band with the most hardware | Its Anchor keeps that band's corrosion from ticking; while an Anchor stands its breaches deal +1 per corroded band (`blightAnchorBonus`). Purge before the Anchor (or twice after), Quarantine Rule, empty the band. |
| **The Iron Regent** | Breach 4 → Cut + corrosion → Strike 3 → Corrosion → Charge → **Crownfall** breach 7 | Graded armor 4 − 2 × (channels − 1). At half health: +2 strikes/breaches, +1 alongside faults and fields. The crown raises two Gate Wardens. Break: 12 (+4 per living Warden). |
| **The Hollow Choir** | Field → Jam + suppression + 2 Packet Loss → Field → Breach 4 + corrosion → Charge → **Requiem** breach 8 + suppression | Absorbs 2 unless a firewall is online (3 while a Chorister lives). Alternates field types. At half health: +2 attacks, +1 alongside faults/fields. Its last breath raises two Choristers. Break: 15 (+4 per living Chorister). |
| **Blackout Core** | Cut + corrosion + Worm → Breach 4 → Jam + suppression → Strike 4 → Charge → **Total Blackout** breach 10 + corrosion | At half health: +2 attacks, +1 alongside faults/fields, its jam also plants a Siphon Tap, and Total Blackout wears every primary-route device by 1. Event Horizon raises two Quarantine Drones. Break: 18 (+4 per living Drone). |

The four new leaders (Scrap Foreman, Static Nest, Demolition Engine, Root Blight) have no armor and no enrage: the installation is the trait. Heavy machines (Ferric Colossus, Grave Reaver, Null Marshal, Gate Sentinel, Scrap Foreman, Demolition Engine) lead packs only in elite rooms.

### Escorts

Escorts appear beside a leader, in a stage I duo, as a reinforcement or as a Shedding spawn. They act on alternate phases, never escalate, and each carries one pack trait that couples it to another living hostile (never to itself), and a crate.

| Escort | Stages | Active pattern (dormant between) | Pack trait | Counterplay |
| --- | --- | --- | --- | --- |
| Spark Mite | I, II, III | SPARK BITE strike 1 → GNAW cut | Swarm: its strike deals +1 for every other living hostile (`swarmBonus`). | One online firewall blocks a lone Mite's whole strike; kill the others and it becomes chip. |
| Splicer | I, II, III | SPLICE cut → LASH strike 2 | Twin cut: while a leader lives its cut severs 2 cables (`twinCut`); a honeypot absorbs one. In a duo it cuts one. | Failover Policy cancels the action; Hot Patch clears both; armored cables; a second channel. |
| Relay Drone | II, III | STATIC JAB strike 1 | Uplink: while it lives the leader's strikes deal +1 (`uplinkBonus`). | Kill it first; a firewall blocks the uplinked point; the Ghost aims the release. |
| Ward Node | II, III | SEAL jam | Plating link: while it lives the leader has plating 2 (`wardPlating`), bypassed by an online firewall, on top of its own armor. | A firewall; merge every delivery on the leader so the plating is paid once; Spearhead. |
| Tap Spinner | II, III | SPIN A TAP (install) → BARB strike 1 | Web: after it acts it heals 1 per Siphon Tap on the table (`webHeal`). | Scrub, Purge Field, a honeypot's ring; kill it before the third Tap. |
| Glass Echo | II, III | REFRAIN suppression → SHARD strike 1 | Last echo: when it dies the leader's next strike or breach deals +3 (`lastEchoBonus`). | Kill it when the leader's next intent is a fault or field; kill both with overflow; Quarantine Rule. |
| Rigger Drone | III | RIG A SPIKE (install beside the leader's target) → PRY strike 1 | Rigging: while a leader lives its Spikes arrive with integrity 3 (`riggedSpikeIntegrity`). | Kill it before its second Spike; kill the leader and new Spikes arrive at 2; a rack; relocate the neighbour. |

Combined intents (a fault with a field, junk or an installation) are announced together, use the same forecast as resolution, and are all cancelled by a lethal packet on their hostile. Enrage takes effect on the next displayed intent after the threshold is crossed.

### Guardian ultimates and exposed windows

Every guardian follows four normal actions with a **charge** turn, then an **ultimate**; a wounded guardian charges early (see [Guardian charge timing](#guardian-charge-timing)). The charge deals no direct damage and raises the adds; the forecast shows the coming ultimate's damage and the adds' intents. Deal the break threshold (12 / 15 / 18, +4 per living add; ascension 10: +5) in **one transmission on the ultimate turn**, on the guardian's own port, after armor and suppression, to interrupt it: the guardian's attack and its new field are cancelled, existing fields still resolve, the adds still act, and the guardian is **exposed** for one transmission (armor ignored, +3 damage on its port). Interrupting is optional: shields, firewalls, protocols and integrity can absorb the ultimate. Tarpit punishes the charge or ultimate itself. A buffer release counts toward the break. The break meter shows one extra segment per add, lit while the add lives.

---

## Cards

Basic cards form the reliable starter infrastructure. Commons are efficient turn tools. Uncommons reward specialization or protect an investment. Rares provide orchestration, burst or recovery. Legendary Clabernetes is the single exceptionally scarce reward. Rarity never implies unconditional superiority. Every non-junk card has a `+` version (72 of 75), shown with a `+` and a gleam; upgrades change cost or numbers only, and card text always states the upgraded rule. Fourteen cards arrived with v4: for packs and ports, Broadcast Storm, Traffic Shaping, Flood Fill (Architect), Bulkhead (Warden), Spearhead (Ghost), Packet Storm and Quorum; for the table front, Server Rack, Redundant PSU, Sentry Firewall (Warden), Demolition Charge, Field Repair, Rapid Redeploy (Architect) and Phantom Node (Ghost). Each is useful in a single-hostile fight without installations.

Card targets: **ground** places hardware (including racks and phantoms), **link** connects two devices without an existing cable, **node** upgrades a valid device, **instant** resolves immediately (Demolition Charge then asks for an installation), **zone** chooses a band, **protocol** arms, **junk** deletes a Worm. Invalid targets spend neither energy nor cards. Overclock requires an unmodified router, Compression an unamplified switch, Startup Config an unconfigured router, Faraday Shell an unprotected device, Mesh Weave a device with an unconnected neighbour, Mirror Protocol two or more channels, Equal-Cost Multipath, Flood Fill and Wireshark a live route, Salvage Cycle a discarded cable card, Rapid Redeploy a discarded hardware card, Reflect stored backpressure, Replay Attack a non-empty buffer.

| Card | Cost | Rarity | Target | Pool | Rules | Upgrade (+) |
| --- | ---: | --- | --- | --- | --- | --- |
| Core Router | 2 | basic | ground | all | Place a router. Every route needs one: ALPHA → router → OMEGA deals 5. | cost 2 → 1 |
| Edge Switch | 1 | basic | ground | all | Place a switch. +1 damage while it is on your primary route. | Place a switch. +1 damage while it is on your primary route. Gain 3 block. |
| Hot Patch | 1 | basic | instant | all | Clear every active jam and cut cable. Restore 1 condition on your most worn device. Draw 1. | Clear every active jam and cut cable. Restore 1 condition on your most worn device. Draw 2. |
| Optic Fiber | 1 | basic | link | all | Connect two devices with a live cable. | Connect two devices with a live cable. Draw 1. |
| Clab Inspect | 0 | common | instant | all | Draw 2 if a route is live; otherwise draw 1. Exhaust. | Draw 3 if a route is live; otherwise draw 2. Exhaust. |
| Deep Packet Inspection | 1 | common | instant | warden | Gain 2 block for every online firewall (at least 2). | Gain 3 block for every online firewall (at least 3). |
| Deep Scan | 1 | common | instant | all | Draw 3 cards. Your hand holds at most 10. | Draw 4 cards. Your hand holds at most 10. |
| Demolition Charge | 1 | common | instant | all | Your focus packet deals +2 this turn. If an installation stands, destroy one of your choice. Exhaust. | Your focus packet deals +4 this turn. If an installation stands, destroy one of your choice. Exhaust. |
| Duplex Link | 1 | common | link | all | Connect two devices. Gain 3 block this turn. | Connect two devices. Gain 5 block this turn. |
| Failover Policy | 1 | common | protocol | all | Arm. When a hostile action would cut a cable: cancel all of that action's cuts and gain 3 shield for that action. | Arm. When a hostile action would cut a cable: cancel all of that action's cuts and gain 6 shield for that action. |
| Field Repair | 0 | common | instant | all | Restore every device to full condition. Gain 2 block. Exhaust. | Restore every device to full condition. Gain 4 block. Draw 1. Exhaust. |
| Honeypot | 1 | common | ground | all | Place a decoy. Cabled, it takes each action's jam, cut or overload and deals 3. Installations within 2.0 lose 1. Works offline. | cost 1 → 0 |
| Link Recovery | 1 | common | instant | all | Clear every active jam and cut cable. Restore 1 condition on your most worn device. Gain 3 block. | Clear every active jam and cut cable. Restore 1 condition on your most worn device. Gain 6 block. |
| Linux Bridge | 1 | common | ground | all | Place a switch automatically cabled to its nearest device (+1 on the primary route). | Place a switch automatically cabled to its two nearest devices (+1 on the primary route). |
| Packet Burst | 1 | common | instant | all | Your transmission deals +3 this turn. | Your transmission deals +5 this turn. |
| Packet Guard | 1 | common | instant | all | Gain 4 block this turn. | Gain 7 block this turn. |
| Power Capacitor | 0 | common | instant | all | Gain 3 block now and +2 energy next turn. Exhaust. | Gain 5 block now and +2 energy next turn. Exhaust. |
| Purge Field | 0 | common | zone | all | Cleanse a band: destroy its installations, hostile fields and jams (an Anchor takes the whole purge). Draw 1. Exhaust. | Cleanse a band: destroy its installations, hostile fields and jams (an Anchor takes the whole purge). Draw 2. Exhaust. |
| Quorum | 1 | common | instant | all | Gain 3 block, +2 for every other hostile on the field. Draw 1. | Gain 5 block, +3 for every other hostile on the field. Draw 1. |
| Rate Limiter | 1 | common | protocol | all | Arm. When a hostile strikes: gain 5 shield for that action. | Arm. When a hostile strikes: gain 8 shield for that action. |
| Redundant PSU | 1 | common | node | all | Restore a device to full condition and raise its maximum condition to 3 this battle. Gain 2 block. Exhaust. | cost 1 → 0 |
| Resonance Field | 1 | common | zone | all | Choose a band. Your primary route deals +3 for each resonant band it crosses. 3 turns. | cost 1 → 0 |
| Salvage Cycle | 0 | common | instant | all | Return up to 2 of your most recently discarded cable cards to your hand. Exhaust. | Return up to 3 of your most recently discarded cable cards to your hand. Exhaust. |
| Signal Relay | 2 | common | ground | all | Place a jam-protected switch (+1 on the primary route). Draw 1. | cost 2 → 1 |
| Startup Config | 1 | common | node | all | Configure a router: +1 while it is on your primary route. Gain 1 block. Exhaust. | cost 1 → 0 |
| Store and Forward | 1 | common | instant | ghost | Add 4 damage to your buffer. | Add 6 damage to your buffer. |
| Traffic Shaping | 0 | common | instant | all | Every delivery goes to the focus this turn; the focus packet deals +1. Draw 1. Exhaust. | Every delivery goes to the focus this turn; the focus packet deals +3. Draw 1. Exhaust. |
| Aegis Field | 1 | uncommon | zone | all | Choose a band. While an online device sits in it, gain 3 shield each turn. 3 turns. | cost 1 → 0 |
| Aegis Protocol | 2 | uncommon | instant | all | Gain 8 block this turn. | Gain 12 block this turn. |
| Amplified Fiber | 1 | uncommon | link | all | Connect two devices. This cable adds +1 while on your primary route. | cost 1 → 0 |
| Armored Fiber | 1 | uncommon | link | all | Connect two devices with a cable immune to cuts and fraying. | cost 1 → 0 |
| Broadcast Storm | 1 | uncommon | instant | all | Your transmission deals +2 to every port this turn. | Your transmission deals +3 to every port this turn. |
| Bulkhead | 1 | uncommon | instant | warden | Gain 3 block. This enemy phase every online firewall blocks 1 more against each attack. | Gain 5 block. This enemy phase every online firewall blocks 1 more against each attack. |
| Cache Server | 2 | uncommon | ground | all | Place a cache server. Online at the start of your turn: draw 1 more card. | cost 2 → 1 |
| Crosslink | 0 | uncommon | link | all | Connect two devices for free. Draw 1. Exhaust. | Connect two devices for free. Draw 2. Exhaust. |
| Dark Fiber | 0 | uncommon | link | ghost | Connect two devices with a cut- and fray-proof cable. Exhaust. | Connect two devices with a cut- and fray-proof cable. Draw 1. Exhaust. |
| Emergency Rebuild | 2 | uncommon | instant | all | Deploy a router cabled to both terminals: a new 5-damage route. Exhaust. | cost 2 → 1 |
| Equal-Cost Multipath | 1 | uncommon | instant | architect | Needs a live route. +2 burst for every live channel. | Needs a live route. +3 burst for every live channel. |
| Faraday Shell | 1 | uncommon | node | all | Protect a device from jams this battle and clear its jam. Exhaust. | cost 1 → 0 |
| Fast Reroute | 0 | uncommon | instant | all | Clear every active jam and cut cable. Restore 1 condition on your most worn device. Gain 2 block. Draw 1. Exhaust. | Clear every active jam and cut cable. Restore 1 condition on your most worn device. Gain 4 block. Draw 1. Exhaust. |
| Flood Fill | 1 | uncommon | instant | architect | Needs a live route. +1 damage per live channel to every port. | Needs a live route. +2 damage per live channel to every port. |
| Hardened Router | 2 | uncommon | ground | all | Place a router protected from jams. Gain 2 block. | Place a router protected from jams. Gain 5 block. |
| IPS Signature | 2 | uncommon | protocol | all | Arm. When a hostile breaches: gain 6 shield for that action. | cost 2 → 1 |
| Load Balancer | 2 | uncommon | ground | all | Place a load balancer. While online: +1 damage for every live channel. | cost 2 → 1 |
| Mesh Weave | 1 | uncommon | node | architect | Cable the chosen device to its two nearest unconnected devices. | Cable the chosen device to its three nearest unconnected devices. |
| Mirror Protocol | 1 | uncommon | instant | all | Needs 2+ channels. +2 burst and +2 block for every live channel. | Needs 2+ channels. +3 burst and +3 block for every live channel. |
| Null Field | 1 | uncommon | zone | all | Choose a band. While any of your hardware occupies it, gain 2 shield each turn. 3 turns. | cost 1 → 0 |
| Packet Compression | 1 | uncommon | node | all | Amplify a switch: +2 while it is on your primary route. Exhaust. | cost 1 → 0 |
| Phantom Node | 0 | uncommon | ground | ghost | Place a phantom off every route. It absorbs the next jam, cut, overload or installation, then fades. Exhaust. | Place a phantom off every route. It absorbs the next two jams, cuts, overloads or installations, then fades. Exhaust. |
| PoE Injector | 2 | uncommon | ground | all | Place a power injector. Online at the start of your turn: +1 energy. | cost 2 → 1 |
| Port Security | 1 | uncommon | protocol | all | Arm. When a hostile action would jam a device: cancel all of that action's jams; the attacker takes 4. | Arm. When a hostile action would jam a device: cancel all of that action's jams; the attacker takes 7. |
| Power Surge | 0 | uncommon | instant | all | Gain 2 energy. Draw 2. Exhaust. | Gain 3 energy. Draw 2. Exhaust. |
| Quarantine Rule | 1 | uncommon | protocol | all | Arm. When a hostile casts a field: cancel the field. | cost 1 → 0 |
| Rapid Redeploy | 1 | uncommon | instant | architect | Put a hardware card from your discard pile into your hand; it costs 1 less this turn. Exhaust. | Put a hardware card from your discard pile into your hand; it costs 1 less this turn. Draw 1. Exhaust. |
| Sentry Firewall | 2 | uncommon | ground | warden | Place a firewall (online: blocks 2 breach / 1 strike). Its quarantine deals 2, not 1; each installation it destroys: +2 shield. | Place a jam-protected firewall. Online, its quarantine deals 2, not 1; each installation it destroys grants +2 shield. |
| Server Rack | 2 | uncommon | ground | all | Place an uncabled rack: overloads, Spikes and blasts within 2.0 wear it instead. Condition 3, no wreckage. Gain 3 block. | cost 2 → 1 |
| Spearhead | 1 | uncommon | instant | ghost | Your buffer release this turn ignores armor and plating. | cost 1 → 0 |
| Stateful Firewall | 2 | uncommon | ground | warden | Place a firewall that blocks double: 4 of a breach or 2 of a strike while online. | Place a jam-protected firewall that blocks double: 4 of a breach or 2 of a strike while online. |
| Trust Gate | 2 | uncommon | ground | all | Place a firewall. While online it blocks 2 of a breach or 1 of a strike. Firewalls stack. | Place a firewall. While online it blocks 2 of a breach or 1 of a strike. Firewalls stack. Gain 3 block. |
| VXLAN Tunnel | 2 | uncommon | link | all | Connect two devices with a cut- and fray-proof cable that adds +1 on your primary route. | cost 2 → 1 |
| Wireshark | 1 | uncommon | instant | all | Capture your primary route: draw 2 and +1 burst for every distinct device type on it. Exhaust. | Capture your primary route: draw 3 and +1 burst for every distinct device type on it. Exhaust. |
| Bastion Firewall | 3 | rare | ground | all | Place a jam-protected firewall (online: blocks 2 breach / 1 strike). Gain 5 block. | Place a jam-protected firewall (online: blocks 2 breach / 1 strike). Gain 8 block. |
| Containerlab | 3 | rare | instant | all | Deploy an overclocked router cabled to both terminals: a 7-damage route. Exhaust. | cost 3 → 2 |
| Emergency Repair | 2 | rare | instant | all | Restore 3 integrity. Gain 3 block. Exhaust. | Restore 5 integrity. Gain 5 block. Exhaust. |
| Overclock | 1 | rare | node | all | Overclock a router: +2 while it is on your primary route. Exhaust. | cost 1 → 0 |
| Packet Storm | 2 | rare | instant | all | Your transmission deals +5 to every port this turn. Exhaust. | Your transmission deals +7 to every port this turn. Exhaust. |
| Reflect | 1 | rare | instant | warden | Double your stored backpressure. Exhaust. | cost 1 → 0 |
| Replay Attack | 1 | rare | instant | ghost | Double your buffer. Exhaust. | cost 1 → 0 |
| Spine-Leaf | 2 | rare | ground | architect | Place a switch cabled to every router on the table (+1 on the primary route). | cost 2 → 1 |
| Tarpit | 1 | rare | protocol | all | Arm. When a guardian charges or unleashes an ultimate: it takes 8. | Arm. When a guardian charges or unleashes an ultimate: it takes 12. |
| Zero Day | 2 | rare | instant | all | Your transmission deals +8 this turn. Exhaust. | Your transmission deals +12 this turn. Exhaust. |
| Clabernetes | 2 | legendary | node | all | Clone a router with its cables and upgrades. Both become jam-protected — instant bandwidth. Exhaust. | cost 2 → 1 |
| CVE | 0 | special | junk | curse | Unplayable. A permanent vulnerability. Remove it at a Sanctuary or Market. | — |
| Packet Loss | 0 | special | junk | junk | Unplayable. Vanishes at the end of your turn. Removed after the encounter. | — |
| Worm | 1 | special | junk | junk | Pay 1 to delete it. If it is in your hand when you transmit, the enemy phase's first attack deals 2 extra damage. | — |

Clabernetes clones a router with its cables, configuration and overclock into the first free socket; both routers become jam-protected, and the new disjoint path is instant bandwidth. Wireshark counts distinct device roles on the primary route (router, switch, firewall, cache, power, balancer, honeypot) with no cap. Linux Bridge and Mesh Weave cable to the nearest devices not already connected (distance ties use device IDs). Rapid Redeploy takes the most recently discarded hardware card; its discount is spent by the first matching card played this turn. Crate cards and Recover cards enter the hand for the encounter only, exhaust when played and never enter the deck.

---

## Relics

All relics are unique within a run; offers only contain unowned relics. v4 adds six common relics (Round Robin, Ingress Filter, Priority Queue, Reinforced Frame, Field Engineer, Bill of Lading) and two boss relics (Storm Control, Scorched Earth). Starter relics are never offered. Boss relics are strong rule changes with a real drawback and appear only after the stage I and II guardians.

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
| Round Robin | common | At the start of each battle every hostile takes 2 damage (reinforcements on arrival). |
| Ingress Filter | common | Every strike and breach against you deals 1 less. |
| Priority Queue | common | Your primary delivery deals +1 against the hostile with the least remaining health. |
| Reinforced Frame | common | Every device you deploy has 1 more condition (3; salvage and crate hardware 2). |
| Field Engineer | common | The first repair each turn costs 0. |
| Bill of Lading | common | Crates are never empty (the empty share becomes credits) and undelivered messages offer three choices. |
| Storm Control | boss | +1 energy every turn. Every hostile jam or cut that lands also deals 1 damage to you. |
| Scorched Earth | boss | Whenever one of your actions or devices destroys an installation, its planter takes 4 (the focus if the planter is dead). Your devices deploy with 1 less condition. |

Round Robin never ends a fight before it starts: a hostile keeps at least 1. Priority Queue's ties count (any hostile at the least health). Storm Control counts landing jams, cuts and Jammer jams, not decoyed ones. Bill of Lading is worth nothing in fights without escorts or Laden hostiles.

---

## Ascension

Win an expedition at ascension N with an archetype to unlock N + 1 for that archetype (stored locally in `faultline-progress-v1`). Levels are cumulative.

| Level | Name | Rule |
| ---: | --- | --- |
| 1 | Hardened Elites | Elite hostiles have 15 % more integrity. |
| 2 | Stubborn Signals | Normal hostiles have 10 % more integrity: every member of a pack and every reinforcement. |
| 3 | Scarce Parts | Sanctuary repair restores 25 % less integrity. |
| 4 | Sharper Teeth | Hostile strikes and breaches deal 1 more damage. |
| 5 | Known Vulnerability | Begin the expedition with a CVE curse in your deck. |
| 6 | Ancient Guardians | Stage guardians have 15 % more integrity. Close the Gates and Stolen Voice also wear their target by 1. |
| 7 | Lean Markets | Market prices rise 20 %. Credits earned fall 10 %, crates and messages included. Elites carry a second designation 50 % of the time. |
| 8 | Worn Backbone | Begin with 2 less maximum integrity. |
| 9 | Lingering Corruption | Hostile fields last 3 turns instead of 2. Packs are 15 points more common in every stage. |
| 10 | The Last Signal | Guardians enrage at 60 % integrity and their ultimates deal 2 more damage. Each living add raises the break by 5 instead of 4. Normal hostiles may carry a second designation. Every guardian's charge also plants a Breaker Charge beside your primary router. |

Ascension 2 reaches every pack member and reinforcement. The v4 riders are `RULES` keys that the level texts read, tuned in the ascension pass (the design values left ascension 10 at 2 / 4 / 4 %): ascension 6's adds gain nothing (`ascensionAddHealth` 1; the design had ×1.15) while the wear rider stays (`ascensionRiderWear` 1); ascension 7's second elite designation rolls at 50 % (`eliteSecondDesignation`; design: always); ascension 9's extra installation integrity is 0 (`ascensionInstallationIntegrity`; design: +1, applied before a honeypot bite); ascension 10's second normal designation rolls at half the room's chance (`normalSecondDesignation`), and its charge Breaker Charge stays (`ascensionChargeBreaker` 1): it ticks on the ultimate turn and detonates in the phase after it unless it is scrubbed, purged or quarantined first.

---

## Save compatibility and deterministic behaviour

Expeditions save as **version 4** (still under the `faultline-expedition-v2` storage key). A version 3 save is a strict subset and migrates in memory, one way: the single hostile stands at the centre as a `single` (uid `h1`), malware becomes Siphon Taps (integrity 1, active, owned by `h1`), the single jam and cut become lists, every deployed device gets its condition (salvage 1, otherwise 2), the focus is the centre, the enemy-phase and action counters take the hostile's action count, and every other v4 field takes its empty value. Saves before version 3 predate the network redesign and are not continued; the title screen simply offers a new expedition. Local run records (`faultline-records-v2`) and progress (`faultline-progress-v1`) are unchanged.

Validation covers every field: archetype and ascension, credits and removals, shop offers and prices, event state and picks, protocols (≤ 2), console uses (≤ 2), buffer and backpressure, field slots (one allied, one hostile, one terrain and one signal field per band), the chart (19 rooms, exits, packs of escorts, 1–2 designations, hidden and reinforced flags), piles, relics and topology references; hostiles (0–3, 1–3 in battle, distinct ports and uids, at most one leader or single, roles matching their definitions, cadence, designations, crates, guardian step state); installations (≤ 4, valid kinds, integrity 1–3, countdown 1–2 on Breaker Charges only, points inside the grid); device condition (0 to its maximum, maximum ≤ 4), phantom charges and deploying cards; faults naming existing devices; aims whose keys name existing devices and whose values are ports; wrecks (≤ 6, inside the grid); the reinforcement (an escort, count −1 to 3, health, crate); the signal; offers (≤ 8, two named cards or 1–3 message options); encounter cards and the credit ledger. Invalid values reject the save.

Maps (packs, designations, hidden flags and reinforced elites included) derive from seed + stage; encounter plans (health, crates, reinforcements, signals, message options, salvage roles) from seed + stage + room; terrain from seed + stage + room; all use local generators. Card draws, rewards, market stock, events and junk positions use the expedition RNG. Daily seeds derive from the UTC date; identical seed, archetype, ascension and decisions repeat the expedition. There is no remote leaderboard.

---

## Presentation, learning and feedback contract

- **Every number has a cause.** Every number the interface shows comes from `combatPreview`, the same pure forecast that `endTurn` resolves; an element may summarise, but it never hides a number that resolution uses. The battle HUD shows signal damage, shield, burst, routes and channels ("4 routes · 3 channels", one diamond per channel colour, the shared devices named in its tooltip) and bandwidth, online and offline devices, clusters on the band seals (with an installation count and an anchor glyph for a pinned field), the Ghost buffer (stored, gain, packet-loss risk), the Warden's stored backpressure, the console command (cost, uses, Buffer state), armed protocols with "will trigger" highlights, trap damage, installations, wear and junk in the intent panel, and next turn's energy and draw.
- **The far rail.** Up to three hostiles stand at the rail as whole **portraits** in the band above the table, the leader at the centre and tallest (a guardian taller still), escorts and adds to either side at most 0.8 and 0.72 of its height; nothing is ever drawn over a portrait. The rail is laid out in screen space for the resting camera: each sprite is sized so its painted body fills the room above its plate, clear of the header's items (a portrait under one may lean in over its plate, and the whole rail may slide a little off centre to let it stand taller), and a lunge, rear or swell lifts the body rather than letting its foot sink onto the plate. Under each portrait hangs one engraved brass **plate** (`#intent-layer`, placed every frame from the 3D rail, for one hostile or three): its **next move** (`.hostile-intent[data-port]`, the part lessons spotlight) with a big glyph, the number after every term (strike and breach) and a short verb in the move's colour (STRIKE 7, BREACH 5, JAM ROUTER1, CUT ROUTER1 ↔ SWITCH1, CORRODE NORTH, PLANT JAMMER · NORTH, OVERLOAD, CHARGE · ultimate next turn, the ultimate's own name) with its target and riders on one line (a field beside a fault, extra plantings, junk, healing), a leader's three escalation pips, RESTS · acts next phase for a dormant escort, FALLS THIS TURN (struck through in gold), FALLS · ACTS ANYWAY for a Spiteful hostile and BROKEN for an interrupted ultimate; then its **health bar** in the hostile's colour with its name and integrity engraved in it, the forecast loss as the striped band and the loss beside it (−10), or LETHAL in gold. A dashed ARRIVES plate holds a port an announced reinforcement will take. The plates stay while the enemy phase plays out: health drops as packets land, the moves still to come rest dim, the hostile acting now is lit, and a falling hostile's plate leaves as it starts to fall. The **target** (the focus) wears a lit brass rim, brass corner brackets and the crest jewel on its plate's crown; a click on a hostile's portrait, plate or port row targets it. Far-row device nameplates, their junction seals and installation tags that would rise into the plates hang at their device's foot instead. Hovering a hostile (portrait or plate) opens its card: the full forecast sentences, designations and rules, riders, shield terms, escalation, health now → after the transmission, and the deliveries and overflow that land on it. Hostiles still read as sprites with rim lighting, embers, anticipation and lunges; guardians are larger with a presence seal.
- **The port strip and deliveries ledger.** With two or more hostiles, the right plate gains a **port strip**: one row per port in phase order, with health, intent and the states (acting, "rests", "falls", "broken"); the whole row targets its hostile, the target's row carries a lit brass rim and the crest, and hovering a row opens that hostile's card. Under the target's medallion, the **Deliveries ledger** lists one row per live channel in its channel's colour (a hexagon for the primary delivery, a diamond for bandwidth), its amount and three port studs L · C · R; clicking a stud re-aims the delivery at once. Clicking a row, or the channel's packet glyph on the table, **picks the delivery up**: the row and the glyph light in the channel's colour, a tether runs from the glyph to the pointer, every badge offers itself, the hint under the table reads "Aim Ch 2: click a hostile", and hovering a hostile previews each port's health with the delivery landing there. The next hostile clicked (body, plate, badge or row) receives it and the delivery is put down; Escape, the empty table or the same row again put it down unaimed. Per-port totals and "overflow 3 → CENTRE" close the ledger; the transmit dial adds "3 ports" when deliveries are split. On the table each channel parks a packet glyph at its OMEGA end with a dashed line to its port; dragging it to a sprite, rail plate or badge re-aims it.
- **Intent panel.** The selected port's medallion adds install and overload kinds; an escalation gauge of three diamonds sits beside the pressure warning and names the next level two actions ahead; designation ribbons (coral for bad, teal for good, a static pattern for UNKNOWN until the entrance) sit under the hostile's name with the rule on hover; extras list installs, wear, crates and a named signal; the guardian window reads "12 / 20 damage · +4 per living add" with one break segment per add; a Spiteful port keeps its intent under LETHAL with "acts anyway".
- **The table front.** Installations are Blender bodies in their planter's colour (Tap magenta, Jammer cold blue, Spike rust, Anchor violet, Breaker Charge ember) with integrity pips on their tags ("JAMMER ◆◆"), a dashed reach ring on hover, a countdown numeral and blast ring on a Breaker Charge, an anchor tether to its band's seal, and a ghost beam with the kind's glyph at the forecast socket. Device nameplates carry condition pips; a worn device's rim turns the fray colour and sparks; a breakdown leaves a fresh wreck tinted in the device's colour.
- **Channels on the table.** Every delivering channel has its own colour (`src/channel-palette.ts`: gold for the primary, then cyan, green, blue, silver, rose), on its cables' sheath, haze and beads, on its devices' skirts, on the ledger chip's diamonds and on its delivery; a cable on a live route outside the channel set stays a dim neutral. An amplified cable is wound with violet fibre whichever channel carries it (a compressed switch's amplifier ring is the same violet). A device where routes merge wears a brass **junction seal** on its nameplate: the merge glyph and the number of routes through it.
- **Hover cards.** Resting the pointer on a device, cable or installation shows one engraved plate beside it, read from the forecast: a device's name, id, band, online state (and why it is offline), condition pips, what it does now (route terms, firewall block and quarantine, draws, energy, balancer, decoys, shelter, absorbs), its channel with its colour, the shared explanation, forecast threats and upgrades; a cable's ends, channel, amplified fibre, armor, fraying and forecast cuts; an installation's integrity, next effect and scrub cost. ALPHA and OMEGA show the route and channel count. Crates drop from a dead escort's port and open with a toast ("Crate · +5 credits"); a message fragment rises over the fallen port before its dialog opens.
- **Repair and scrub plates.** Clicking a device opens its plate in the target dock with condition pips and a **Repair** button (disabled with the reason when energy is short or the device is intact); clicking an installation opens a sibling plate with kind, pips, its next effect and a **Scrub** button ("Scrub · 1 energy · ◆◆ → ◆◇"). Ledger tags list every installation and every worn device ("Worn · R1 ◆◇ · Repair 1"). All three surfaces use the same actions, so undo and the cues work alike. Demolition Charge lights the installations as targets.
- **Keys.** 1–0 play cards, C console, P prepare, Z undo, Space/Enter transmit, Esc cancel, I inspect (all unchanged; while the relocation plate asks, Enter relocates and Esc or Z cancels); **F** cycles the target through living ports; **[** and **]** pick up the previous or next delivery; **T** sends the picked-up delivery to the next living port (it stays picked up); Esc puts it down; **R** repairs the selected device, or the most worn one; **S** scrubs the selected installation one point, or the one the forecast names most dangerous (a charge, then a Jammer, a Spike, an Anchor, a Tap), with a toast naming it and Z to undo. Installations and devices are also reachable through the Devices journal, which lists them as tiles with the same Repair and Scrub buttons, so keyboard-only play never needs the canvas; every new button carries an aria-label that states its number.
- **Message dialog.** A message opens the journal dialog "An Undelivered Message" with its sender line and archive fragment, and two (three with Bill of Lading) choice rows with their exact effect; keys 1–3 choose; there is no close stud. A crate card opens "A Crate Opens" with two named cards. Further offers follow in order.
- **Details dialog.** Deliveries (one trace per channel with its port and amount, per-port totals with armor and lethal marks, overflow), Defenses (each attack in port order against the shared pool, with per-attack firewall and protocol terms), The Table Front (every installation with pips and next effect, every worn device with its repair cost, each firewall's quarantine target), and a five-step sequence: your signal per port · traps and quarantine · hostiles act in port order · installations act · recharge and draw. Nothing in it is computed in the dialog.
- **Route chart, entrance and reward.** Pack ordinals (×2, ×3), designation diamonds and the UNKNOWN glyph with the map legend; the encounter title card adds the revealed designation and the reinforcement warning ("SIGNAL DETECTED · a Splicer arrives in 2 actions"), also logged; the guardian intro adds the adds and the threshold. The reward screen itemises credits and names the pack ("Static Nest and escort silenced").
- **Reduced motion and fast mode.** Arrivals and crates appear in place with one pulse and the toast; the countdown changes without a pulse; the designation reveal swaps text and plays its cue; aim lines, the picked-up glyph's halo and its tether are static and the target reticle rests; worn devices keep the rim colour without sparks; fast mode combines per-port impacts with stacked numbers.
- **Field Training** (`src/tutorial.ts`, `src/tutorial/lessons.ts`): a lesson menu of 14 entries in 12 chapters (13 short, hand-built practice battles and an illustrated expedition walkthrough), played through the real rules with hard rails (only the current step's action is playable; everything else is blocked and parked, with a spotlight on the one control): The First Signal; Read the Enemy; When the Line Is Cut (rerouting, bandwidth); Online Devices; Hold the Ground (bands and fields); Traps & Decoys; three console lessons (Architect, Warden, Ghost); Danger & Guardians (charge, ultimate, Siphon Taps, junk, Prepare); the expedition walkthrough; and three v4 drills: **Aim the Signal** (a full rail of three hostiles, one idea per step: read each port's next move, click the Relay Drone to target it so every delivery lands there, transmit, pick up channel 2 and click the Spark Mite to aim just that one, and watch the kill's surplus overflow to the target), **Clear the Ground** (scrub a Jammer twice, repair a worn router, Purge Field the band where the next Jammer lands) and **The Crown and Its Wardens** (read the break meter, aim both bandwidth channels at a Gate Warden on the charge turn, prepare Packet Burst, break Crownfall). The rails cover aim, focus, repair and scrub like any card; the drills follow the board, so Z reopens a step. A reading step is met by Got it or a click on its spotlit control, which then does nothing else. When the last goal is met the lesson is over: the board freezes (no card, console, device, target, aim, relocation, transmission or shortcut plays), and a beat later, once the final transmission or card has landed, a completion plate shows the steps and the takeaway with Next lesson, Replay (a fresh board) and Training menu (which leaves the lesson). The expedition guide ends the same way. Completion is stored in `faultline-training-v1`. Lesson runs never touch the saved expedition. Tests play every lesson to completion.
- **Handbook** (`src/tutorial/handbook.ts`): 16 illustrated chapters (first turn, routes and channels, online devices, intents and shield, bands and fields, rerouting, protocols and console, **Packs & Ports**, **The Table Front**, **Escalation & Designations**, **Crates, Messages & Signals**, the three keepers, a Danger Playbook with a Breaker Charge beside your router, a Jammer you cannot reach and a Spiteful hostile at lethal, guardians, cards and keywords, the expedition). Every number is read from `RULES`, `CARDS`, `RELICS`, `ENEMIES`, `DESIGNATIONS`, `SIGNALS`, `CONSOLES`, the ascension levels and market constants.
- **Screens** (`src/screens.ts`): title (continue with ascension, Field Training, Handbook), archetype select with console, engine and an ascension selector, route chart with packs, ribbons, market and event rooms, reward (itemised credits, upgraded cards), relic (boss relics show the drawback in red, v4 relics have their own glyphs), sanctuary with a deck picker showing upgrade before → after, market, illustrated events, outcome with ascension unlocks.
- **Audio cue contract** (`src/audio-effects.ts`, 58 cues, 98 stereo masters from six CC0 Kenney packs, loudness-matched by tier). One cue per moment: `pickup` when a card is lifted (never a shuffle), `undo` on cancel/undo, card plays sound by effect (`deploy`, `connect`, `protocol`, `field`, `cleanse`, `block`, `instant`), `route` when a route or extra channel comes online, `move` on relocation, `console`, `scrub`, `transmit` on launch, `buffer`/`release` for the Ghost, `trigger` for protocols and honeypots, `hit` on packet arrival, enemy action cues on the contact frame, `malware` when a Siphon Tap is planted and `junk` from the turn result, `deal` for the new hand and `shuffle` **only** when the discard pile is actually reshuffled, `navigate` then `turn`/`event`/`coins` when a room is chosen, `coins` for purchases, `upgrade` for upgrades, `reward` for rewards. v4 adds `arrive` (an escort, reinforcement or add takes a port), `dormant`, `aim` (a delivery re-aimed or the focus changed), `install` (Jammer, Spike, Anchor, Breaker Charge), `wear`, `breakdown`, `repair`, `quarantine`, `detonate`, `crate` (its master chosen by contents), `message` (a fragment drops, and again when the choice resolves), `reveal` (a hidden designation), `warning` (a reinforcement announced) and `signal`. Hover sounds only on meaningful controls, including port rows, the rail's plates, delivery rows and studs.

---

## Strategies and balance intent

**Mesh (Architect).** Build a second and third disjoint channel early; place routers North and South for separated-circuit shield or crowd a band for a cluster; Load Balancers and Parallel Core scale the payoff; Equal-Cost Multipath, Mirror Protocol and Flood Fill cash it in. Width is destinations: split deliveries to finish an escort and press the leader in the same turn. Market routers feed the width; Rapid Redeploy answers a breakdown. Cost: more exposed cables, more devices inside reach rings, Weaver's tension trap and corrosion on crowded bands.

**Fortress (Warden).** Keep firewalls online on any live route, Harden (+1 per extra hostile and per add) and block exactly what the intents need; every prevented point returns as backpressure, in full on every attacker. Firewalls also quarantine installations for free, and Sentry Firewall doubles it; Harden repairs. Stateful firewalls, Deep Packet Inspection, Bulkhead and Reflect scale it; protocols answer in advance. Cost: the shield pool is shared, two breaches drain it faster than one, and backpressure needs the enemy to attack.

**Surge (Ghost).** Protect the line (Failover Policy, armored or dark fiber, a second channel, Phantom Node), buffer on turns where no intent can break every route, then flush one aimed spike: delete the escort whose death matters, or hold it for a guardian's ultimate turn and break through both adds. Spearhead removes armor from the release. Store and Forward and Replay Attack amplify it. Cost: buffered turns deal nothing, so Packet Leech and Hungry hostiles heal, Tap Spinner and Static Nest keep what they heal, and every escort gets a free action; a cut or a breakdown on your only route loses everything.

**All keepers — the charge turn.** Kill the adds now (spread), brace (block, firewalls, protocols, then repair the wear), or break at +4 per add. Each keeper has one natural line and can borrow the others with cards.

No build requires a specific rare; Containerlab and Clabernetes are optional discoveries. Honeypots, protocols, fields, racks and firewall placement give every archetype answers to disruption and to the table front. Persistent structures give each turn a changing context; exhausted orchestration prevents rebuilding a board every shuffle; fourteen sockets, four installations and enemy disruption, not artificial caps, bound the ceiling. Every new threat has at least two answers from different pools, one of them in the shared starter deck or a starter console.

Intended arc of a pack fight: turn one reads up to three intents and builds the classic route; from turn two the forecast shows the focus, the destination of every channel and the first installation; around turn three deliveries first outnumber living bodies, the first escort dies and its crate opens; then escalation and arrivals push the enemy phase back up around turn four or five, the intended kill window.

---

## Balance evidence (v4)

`node --experimental-strip-types scripts/balance.ts <seeds> [--ascension=N] [--policy=..] [--archetype=..] [--elite] [--no-signature] [--summary]` plays complete three-stage expeditions with deterministic bots (`scripts/bot.ts` for combat, `scripts/bot-meta.ts` for every non-battle phase). The v4 tactical line reads every choice from `combatPreview`: it tries every focus and, for each other port, the smallest set of deliveries that kills it, and keeps the plan with the best outlook (damage, kills weighted by threat, adds before the ultimate, an interrupt, minus incoming damage, disruption and installs; `--kill-order=leader` keeps the leader focus instead); it places a phantom before a disruption, saves a device the forecast breaks, scrubs or demolishes installations by value per energy (charges, then Jammers, Spikes, Taps), steps a device out of reach when that is cheaper, repairs a worn primary-route device, racks threatened devices, bursts on the ultimate turn only when that reaches the break (otherwise braces), and answers offers by a fixed priority. Experiment flags `--hp-scale=N` (normal battles), `--boss-scale=N` (guardians) and `--rule=key:value,…` (override any `RULES` number; `a/b/c` for arrays, `packShares.trio:0.6/0.3/0.3` for nested keys) probe alternatives without editing the game. Metrics per profile include turns per fight by shape (single, duo, pair, trio), kill order, installations planted and destroyed, wear, repairs and breakdowns, maintenance share of energy, crates by contents, messages chosen, reinforcement fights, designation win rates, guardian interrupts versus braces with adds alive, and integrity lost per stage. Results are recorded in [balance-v4.json](balance-v4.json).

### Phase flags for A/B probes

Every layer ships on. Each can be turned off by its `RULES` values, which is what the balance script's layer flags do (`--packs`, `--front`, `--escalation`, `--designations`, `--surprises`, `--adds`, each `=on|off`, `--no-<layer>`, or `--layers=off` for the v3 baseline with every layer off):

| Layer | Off values in `RULES` | Script flag |
| --- | --- | --- |
| Packs and ports | `packRate: [0, 0, 0]` | `--packs=off` |
| The table front | `maxInstallations: 0`, `deviceCondition: 99` | `--front=off` |
| Escalation (levels and the guardians' charge at half health) | `escalationStart: 99` | `--escalation=off` |
| Designations | `designationRate: [0, 0, 0]` | `--designations=off` |
| Surprises | `reinforcementRate: [0, 0, 0]`, `signalRate: [0, 0, 0]`, `crateEmptyShare: 1` | `--surprises=off` |
| Guardian adds (also raises no adds) | `addBreakBonus: 0` | `--adds=off` |

With every layer off, a fight is the v3 fight (the single-hostile invariant test runs the v3 fixture with the escalation and adds flags off).

### Results against the targets

[balance-v4.json](balance-v4.json) records the M3 tuning pass, the M4 Warden and ascension passes, every A/B layer probe and the rejected levers. Tactical bot, final values; the A0 target protocol is 150 seeds per keeper, and 600 seeds are the confidence measurement (a 150-seed win rate moves about ±4 points).

| Tactical wins | Architect | Warden | Ghost |
| --- | ---: | ---: | ---: |
| Ascension 0, 600 seeds | 36 % | 36 % | 30 % |
| Ascension 0, 150 seeds | 32 % | 40 % | 24 % |
| Ascension 5, 300 seeds | 14 % | 21 % | 14 % |
| Ascension 10, 600 seeds | 5 % | 9 % | 7 % |
| v3 baseline: the same engine and bot with every layer off, 600 seeds | 44 % | 42 % | 57 % |

| Metric | Target | Measured (600 seeds: Architect · Warden · Ghost) | Met |
| --- | --- | --- | --- |
| Tactical win rate, ascension 0 | 30–36 % | 36 · 36 · 30 % | Yes at 600 seeds; the Warden only with the Harden addition (17 % without); the Ghost's 150-seed run reads 24 % |
| Turns per normal fight | 4–6 (singles 4–5, packs 4.5–6.5) | 4.1 · 5.2 · 3.3 (packs 4.1–4.8 · 5.0–7.1 · 3.4–4.2) | Architect and Warden; not the Ghost (singles keep v3's numbers by the invariant) |
| Turns per elite | 6–8 | 5.1 · 6.6 · 4.1 | Warden only |
| Turns per guardian | 8–11 | 7.4 · 11.3 · 6.3 | No |
| Ultimate turn reached | ≥ 70 % | 94 · 99.5 · 86 % | Yes (resolved or interrupted: the Ghost 58 %, its charge-turn buffer often kills the Regent on the ultimate turn) |
| Interrupts | 40–70 % | 73 · 5 · 79 % (pooled 41.5 %) | Pooled only: the Architect and Ghost break, the Warden braces |
| Kill-order variety | neither order above 75 % | escort first 48 · 45 · 55 %, leader first 47 · 48 · 37 % | Yes |
| Maintenance share, stage III | ≤ 10 % of energy | 6 · 9.7 · 5.3 % | Yes |
| Credits over v3 | +8–10 % | +9.9 · +9.6 · +9.8 % (the design values ran +21 %) | Yes |

The turn, interrupt, kill-order, maintenance and credit figures were measured before the Warden's Harden addition; it leaves the Architect and the Ghost unchanged.

**Tuned in balance** (numbers only): `addBreakBonus` 3 → 4 and `addBreakBonusLate` 4 → 5 (the breaking keepers interrupted 76–85 % of ultimates); `crateCredits` 8–15 → 3–6, `crateFallbackCredits` 10 → 3, `messageCredits` 12 → 6, `packCredits` 4 → 2, `designationCredits` 2 → 1 (income); the ascension riders `ascensionAddHealth` 1.15 → 1, `eliteSecondDesignation` 1 → 0.5, `ascensionInstallationIntegrity` 1 → 0, `normalSecondDesignation` 1 → 0.5 (ascension 10 was 2 / 4 / 4 %). **Measured and kept at the design values**: pack health 1.15 (1.10–1.32 changed nothing beyond noise), designation and reinforcement rates, add health, reach, the Warden's full backpressure release, both escalation cadences.

**The Warden finding.** At the design's numbers the Warden won 17 % (the v3 baseline with the same bot: 42 %). Its losses are guardians: the Hollow Choir (88 % of fights won in v3, 64 % in v4) and the Blackout Core (56 % → 33 %). A fortress line dealing about 7 per turn needs 10.6 turns for the Choir; its Choristers absorb about 45 damage per fight, stretching it to 12.5 turns, a second charge cycle and escalation level 2–3 against one or two channels. No number fixed it without pushing another keeper out of the band (add health, escalation starts, pack health and reward lists were all tried). The resolution is a keeper-level rule: Harden +1 block per hostile beyond the first and +1 more per living add (`hardenPerHostile`, `hardenPerAdd`), which puts the Warden at 36 % at 600 and 1200 seeds and leaves the others unchanged. **It is pending the user's approval**; both keys at 0 restore the design's Harden.

### v3 baseline

The v3 rules were recorded with the v3 bots in [balance-v3.json](balance-v3.json) (the v4 bots play the same rules better; see the baseline row above) with normal health `16 + 5 × floor + 13 × stage`, guardians 67 / 96 / 132, 150 seeds per archetype and policy:

| 150 seeds, ascension 0 (v3) | Architect | Warden | Ghost |
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

Guardian health was raised 20 % in the final v3 pass (from 56 / 80 / 110) because Architect and Ghost guardian fights ended before the charge-and-ultimate climax; v4 keeps every health formula and reaches the climax through the charge at half health and the adds instead.

Caveats and watchpoints:

- These bots are regression probes: they know the rules perfectly, do not search full tactical lines, and do not measure comprehension or enjoyment. Human playtests must set the final difficulty.
- Forecast readability with three hostiles and four installations is the design's largest risk; the port strip, the rail's plates and deliveries ledger are measured against "every per-port packet and every installation effect visible without opening Details", which only human sessions can confirm.
- Older probes (`balance-alpha.json`, `balance-fields.json`, `balance-expedition.json`, `balance-routes.json`, `balance-tactics.json`) measured pre-v3 rules and are kept for history only.

The core tests verify forecast purity and exact agreement with resolution on 160 randomized single-hostile boards and on randomized pack boards (per port, per hostile, per installation), the single-hostile invariant against a v3 fixture, channel and online computation, bandwidth, clusters, firewalls anywhere, honeypots, cache/power/balancer timing, consoles including buffer and packet loss, backpressure (single and multi-port), protocols once per phase including trap lethal, ports, cadence, focus, aims and overflow, installation placement, cap, timing, effects, quarantine, bites, Reclaim and scrub, condition, wear, racks, breakdown and repair, escalation by stage, guardian charges and adds, every designation, reinforcements, crates, messages and signals, terrain legality, junk, card upgrades, relic effects, ascension hooks, map invariants over 2,400 maps, market, sanctuary and event flows, save validation and v3 migration, the Handbook, and every Field Training lesson.

---

## Implementation readings

Where the Proposal 4 design was silent, ambiguous or superseded by a measurement, the implementation chose as follows (the rules above already state the result):

- **Pack health** follows the stated shares (duo 0.575 H, pair 0.75 / 0.40 H, trio 0.63 / 0.26 / 0.26 H), not the design's 11.2 table, whose pair and trio numbers applied 1.15 twice; worked example B's 34 / 18 becomes 29 / 16.
- **Pack rooms may substitute the rolled leader** with a template of the rolled shape; stage II elite reinforcements (15 %) are decided by the chart like stage III's, so no path crosses two reinforced elites in any stage.
- **Budgets**: the 1.3 × headroom fallback applies to pack templates only (a single has no headroom limit); the 1.45 × band is checked for pack rooms; a bad signal that would push a pack over its budget becomes a good one; second designations (ascension 7 and 10) ignore the ascension 0 budget.
- **Crates** roll from their own seeded streams; crate credits are stored with ascension 7 applied; a crate card still pending at victory is dropped. **Messages** leave Recover out when no hostile stands; Reinforce raises maximum integrity only. The designation credit is paid once per room; the reinforced credit only for a rolled arrival.
- **Rigger Drone** strikes with PRY (the design's 4.6 one-liner said BARB). A reinforcement taking the centre port gets the odd cadence.
- **Breakdown** returns no card: hardware cards already cycle to the discard pile when played, so the text reads "breaks Core Router · wreckage remains".
- **Targets** are planned after the transmission, in port order, against the board as transmitted; a Jammer's jam is decoyed by any cabled, unshielded honeypot (one per honeypot per phase); chip attaches to the first hostile that takes its turn; a full table boosts the oldest installation; a rack whose ring holds a wear target takes the wear.
- **Escalation** counts the hostile's own actions; the escalation flag also turns off the guardians' charge at half health. **Adds rise** when the charge is announced and act from the ultimate turn. **Shedding** arms at the half crossing and its escort appears at the end of that enemy phase.
- **Crate salvage and Salvaged drops** land at the end of the enemy phase; card and message offers open before the next hand (or on the victory screen); once the fight is over, salvage yields its credits.
- **Balance** changed numbers, not rules, except one addition: the break bonus per add (4, ascension 10: 5), the v4 credit sources and four ascension riders were tuned (see [Balance evidence](#balance-evidence-v4)); the Warden's Harden gained +1 block per extra hostile and per living add, **pending the user's approval**.
- **Field Training drills**: Aim the Signal fights a Rust Prophet (a strike, then a breach: nothing that changes the board) with a Relay Drone and a Spark Mite, so the rail is full from the first step and no arrival interrupts the lesson; the Drone's health is exactly both deliveries and the Mite's is channel 2 less one, so the overflow is always 1. Clear the Ground adds a Spike beside the worn router, so a breakdown is telegraphed (twice, and never happens) although the Static Nest has no wear of its own; The Crown and Its Wardens prepares Packet Burst before the charge-turn transmission (a prepared card arrives next turn), and its thresholds are read from `RULES` (20 → 16 with the tuned add bonus, not the design's 18 → 15).
