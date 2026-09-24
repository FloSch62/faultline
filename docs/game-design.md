# FAULTLINE — game design (v5 · Three Energy)

The player restores a living network while the quarantine tries to cut it apart. Each turn spends **three energy** on competing needs: grow the network, keep it alive under announced disruption, defend against the announced attacks, maintain the table the enemy is building on, or spend a burst to end the encounter first. The network is your army. Devices are permanents that work while they are reachable; more independent paths mean more bandwidth, and every channel is a delivery that lands on the player's target; every enemy question has more than one answer. Every number on screen has a visible cause.

v5 keeps every v4 rule (packs and ports, the table front, escalation, designations and surprises, all described below) and rebuilds the economy and the card game on the Slay the Spire model: **three energy and five cards a turn** (`baseEnergy`, `handDraw`), energy relics at boss tier that raise the turn's base to at most five (`relicEnergyCap`) with temporary energy uncapped on top, **twelve-card starters**, **keywords** (Exhaust, Retain, Innate, Volatile, Armed) and a new card type, the **Daemon**, a shared **colorless** pool beside **23 cards per keeper in three build paths**, **curses** as the price of deals, rarity-driven rewards and **four ascension levels**. Saves from v4 are not continued (no players yet, so no migration).

This document describes the implemented v5 rules and is the balance reference for tuning. Every tunable combat number lives in the `RULES` object in `src/core/rules.ts` (re-exported by `cards.ts` and `run.ts`); card text, relic text, trait text, the HUD and the Handbook all read it. Where this document quotes a number it names the `RULES` key beside it, so a tuning change can be checked against the code. Card definitions are data, one file per owner in `src/core/cards/` (`colorless.ts`, `architect.ts`, `warden.ts`, `ghost.ts`, `curses.ts`), with faces generated from each card's `values`; their behaviour and the daemon hooks live beside them in `src/core/effects/`; `src/core/cards.ts` merges them into `CARDS` (every `+` version included) and holds the starter decks, the reward pool and the relics; `src/core/rewards.ts` rolls card offers and market slots. The card, relic, starter, ascension and health tables below are **generated from that data** by `.work/docs/card-tables.ts` (between `<!-- generated:… -->` markers), so they cannot drift from a tuning pass. Hostiles, designations, pack templates, signals and message options live in `src/core/enemies.ts`; encounter plans (who stands at the rail, health, crates, arrivals, signals, credits) in `src/core/encounter.ts`; combat and its forecast share one resolver in `src/core/combat/resolve.ts` (with `board.ts`, `network.ts`, `intent.ts` and `surprises.ts` beside it), and `src/core/run.ts` keeps the public API (`combatPreview`, `endTurn`, the play actions, `playDaemon`). The expedition layer (rooms, rewards, market, sanctuary, events) lives in `src/core/meta.ts` and `src/core/events.ts`; the route chart and its rolls in `src/core/map.ts`; encounter terrain in `src/core/terrain.ts`; ascension in `src/core/ascension.ts`.

Design pillars (Slay the Spire, Hearthstone, Gwent, Magic and Into the Breach are the reference points):

1. Every draw is a real decision; few cards go dead once the first route stands.
2. Devices are permanents with abilities. They only work while online, so disruption is removal and redundancy protects an engine. Wear gives the permanent a life bar; breakdown is a telegraphed, per-encounter loss.
3. Synergy scales without artificial "max +2 / once" caps. Natural limits do the balancing: three energy, fourteen table sockets, four installations and the enemy's disruption. A small energy budget and small starter decks make every card choice and every removal count.
4. Readable threats with several answers. Enemy traits, installations and designations are questions (graded armor, band attacks, decoy-able disruption, kill order), not single-key taxes.
5. Tension between acting now and investing: tempo versus a network that pays every turn. Maintenance is the fourth use of energy and stays a choice: a fast kill is the cheapest maintenance.
6. Meaningful choices between fights: a build path to commit to, upgrades, removals, a market, events that trade in curses, rule-bending boss relics, ascension, and a route chart that scouts packs and designations.
7. Rules a network engineer could guess: "a device works while reachable", "more paths, more bandwidth", "multipath delivers to several destinations", "a buffer can lose packets", "a honeypot attracts attackers", "a jammer next to a router jams it", "a firewall next to a rogue device quarantines it", "hardware under load wears".
8. Surprise without hidden dice. Everything on the table resolves with the forecast's numbers; arrivals are announced ahead with their exact effect; rewards are revealed on death or offered as named choices (see [The surprise contract](#the-surprise-contract)).

---

## The expedition

One expedition crosses **three stages of seven sectors**. Choose one reachable room per sector. Each stage has its own route chart, encounter pool, chapter names and guardian.

| Stage | Region | Encounters | Elites | Guardian |
| --- | --- | --- | --- | --- |
| I | The Copper Reach | Packet Leech, Cable Wraith, Rust Prophet, Coil Serpent, Ash Moth | Gate Sentinel, Ferric Colossus, Wire Weaver | The Iron Regent |
| II | The Glass Cathedral | Null Storm, Prism Widow, Null Marshal, Glass Choir, Wire Weaver, Static Nest | Null Marshal, Prism Widow, Ferric Colossus, Scrap Foreman | The Hollow Choir |
| III | The Blackout Heart | Ferric Colossus, Grave Reaver, Coil Serpent, Null Marshal, Glass Choir, Wire Weaver, Ash Moth, Prism Widow, Static Nest, Root Blight | Grave Reaver, Ferric Colossus, Gate Sentinel, Scrap Foreman, Demolition Engine | Blackout Core |

Guardian health is `guardianHealth` per stage and every room's health is a `RULES` formula (see [Enemy health](#enemy-health)).

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

Integrity persists between rooms. Topology, condition, installations, faults, fields, the target, protocols, buffer, backpressure, block, energy, exhaust and combat piles reset for every encounter. The deck, credits and relics persist. Defeating a stage guardian and taking its rewards restores up to **6 integrity** and opens the next stage's chart. Loss at zero integrity ends the expedition; defeating the Blackout Core and taking its card ends it in victory.

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

Ascension 2 (Lean Supply, `leanMarkets`) multiplies earned credits by `ascensionCredits` (0.9, rounded), crates and messages included. Credits banked during a fight (crates, a message's Credit) are paid with the room's credits. The reward screen shows an itemised ledger ("+16 credits · 14 room · 2 pack"). The v4 credit values were cut in balance so a run earns about 10 % more than v3 (the design values ran +21 %).

### Rewards

A battle, elite, guardian, event fight or cache offers **three different cards** (two with the Air Gap boss relic); take one or skip. Offers never include basics, junk, curses or tokens. Each slot rolls, in order, from the expedition RNG (`src/core/rewards.ts`):

1. **The pool**: the keeper's own cards with `keeperShare`, otherwise the colorless pool.
2. **The rarity** from `rewardRarity` by room kind: `normal` (normal fights and caches), `elite` (elites and Signal in the Static; the first slot is uncommon or better) and `guardian` (half uncommon, half rare). `legendaryShare` of the rare band of the same roll becomes legendary (Clabernetes), so it costs no extra draw.
3. **The card**: one of that rarity in the chosen pool, else the other pool, else any rarity (chosen pool first); never a card already offered in this reward.
4. **The pre-upgrade**: `upgradedOfferRate` by stage (none in stage I).

Crate cards roll the same slot with the crate's own seeded stream. After an elite, choose one of **three unowned common relics**. After the stage I and II guardians, choose one of **three unowned boss relics**. The final guardian awards a card only. An undelivered message still waiting when the fight ends opens on the reward screen; a crate's card choice is dropped (its card was for this encounter only).

**Progression intent** (the Slay the Spire arc): stage I builds the first engine piece and one or two keeper cards; stage II commits to a build path, and the boss relic often adds energy; stage III pays the path off. A typical winning deck ends at 22–30 cards after three to six removals.

### Sanctuary

Choose **one** service:

- **Repair**: restore 30 % of maximum integrity, at least 4 (Lean Supply, `scarceParts`: × `ascensionRepair` 0.75, rounded down). Refused under Legacy Mainframe, with the reason; a sanctuary with no possible service then offers **Move on**.
- **Upgrade**: one deck card becomes its `+` version. The picker shows the before → after change.
- **Remove**: one deck card leaves the deck.
- **Salvage**: permanently lose 2 maximum integrity (must leave at least 6), then choose one of three unowned common relics.

Removal (at a sanctuary, market or event) keeps at least `deckFloor` (8) cards, one router card (Core Router or Hardened Router) and two cabling cards, so a twelve-card starter can be trimmed. **Curses can always be removed**, whatever the size of the deck.

### Market

The market (`phase: "shop"`) sells:

- **Hardware bench**: a Core Router. Routers are never card rewards, and wide networks need more than the two starter routers.
- **Five cards** in fixed slots (`MARKET_SLOTS`): keeper common, colorless common, keeper uncommon, colorless uncommon, keeper rare. A slot whose pool is empty at its rarity takes the other pool. The rare slot is legendary 6 % of the time; 15 % of market cards are pre-upgraded.
- **Two common relics**.
- **Card removal**, +1 step for every earlier *market* removal this expedition.
- **Card upgrade**.

<!-- generated:market -->
Card prices: common 35, uncommon 55, rare 85, legendary 140 (`CARD_PRICES`), each with a seeded −5 / 0 / +5; a pre-upgraded card costs +20. Relics 100–130 in steps of 5. Removal 50, +25 for every earlier market removal. Upgrade 40. The bench's Core Router 30.
<!-- /generated:market -->

Each service can be bought once per visit. Lean Supply (ascension 2, `leanMarkets`) raises every price by `ascensionPrices` (+20 %); all prices round to 5. Purchases are refused, with the shortfall stated, when credits are insufficient.

### Unknown signals (events)

An event (`phase: "event"`) is drawn from the unseen events valid for the stage; the three story beats (`story: true`) are three times as likely as any other. An event with a `stage` appears only in that stage. Events never repeat within an expedition (general events may repeat only if every eligible one was seen). Seeded picks (a named card, relic, curse or card set) are rolled when the event opens and are named in the choice text; no choice hides a coin flip. **Every choice that costs a curse names it.** After a choice resolves, the outcome is shown with a Continue button. Events hold up to four choices; "Walk on" is always last.

| Event | Choices |
| --- | --- |
| The Unpatched Server | Take a named rare card **and** a CVE curse · lose 3 integrity to upgrade a chosen card · walk on |
| The Abandoned Rack | Take a named device card (Honeypot, Cache Server, PoE Injector or Load Balancer) · 45 credits |
| The Firmware Mirror | Upgrade two named cards for 3 integrity · pay 25 to upgrade a chosen card · **upgrade three named cards and take a Bitrot** · walk on |
| The Operator's Log | Restore 5 integrity · remove a card |
| Rogue DHCP | Transform a card into a random card one rarity higher (curses become commons; upgraded cards stay upgraded) · 20 credits |
| Cold Storage | Lose 2 maximum integrity (must leave 6) for a named common relic · **take the named relic and a Memory Leak** (no integrity cost) · walk on |
| The Echo Chamber | Pay 30 to duplicate a card (not a curse) · **duplicate a card for nothing and take a Kernel Panic** · restore 2 integrity |
| The Quiet Broker | Sell your newest non-starter relic for 80 · buy a named uncommon card for 45 · **take a named rare card and a Backdoor** · walk on |
| Signal in the Static | Fight a named stage encounter at `eventHealthScale` × a normal room's health for 40 credits and an elite-odds card reward (no relic) · walk on. The fight rolls its pack, designations, reinforcement and signal like the stage's normals, from its own seed stream, and pays their credits. |
| **The Zombie Farm** (stage II) | Take 60 credits and a Zombie Process · lose 3 integrity to remove a named curse from your deck (closed without a curse, or at 3 integrity or less) · walk on |
| The Copper Letters (stage I story) | +1 maximum integrity and restore 3 · upgrade a named card |
| The Bell-Ringer's Rest (stage II story) | Take a named upgraded protocol card · restore 6 integrity |
| The Last Acknowledgement (stage III story) | +2 maximum integrity and restore 2 · 60 credits |

The curse deals' numbers live in `CURSE_DEALS` in `events.ts` (`unsignedUpgrades` 3, `farmCredits` 60, `farmKillIntegrity` 3). Event prices and credit gains follow the Lean Supply multipliers. Choices that cannot be taken show why (not enough credits, integrity too low, nothing upgradable, no curse to remove).

### Three keepers

Every keeper starts with **twelve cards**: the shared ten plus two signature cards (`STARTER_DECK`, `STARTER_SIGNATURES` in `cards.ts`).

<!-- generated:starters -->
The shared ten: Core Router ×2, Optic Fiber ×3, Packet Guard ×2, Packet Burst ×2, Hot Patch.

| Keeper | Integrity | Starter relic | Console (cost) | Signature cards |
| --- | ---: | --- | --- | --- |
| Architect | 14 | Hot Swap | Patch Cable (1) | Edge Switch, Branch Line |
| Warden | 15 | Backpressure | Harden (1) | Trust Gate, Deep Packet Inspection |
| Ghost | 12 | Deep Cache | Buffer (0) | Store and Forward, Dark Fiber |
<!-- /generated:starters -->

| Keeper | Engine | Build paths (see [Keeper cards](#keeper-cards)) |
| --- | --- | --- |
| Architect — "Make a way through" | Width: Hot Swap makes the first link card each turn cost 0, the Patch Cable console lays a cable without a card, so routers become channels quickly | **Mesh** (channels and width) · **Backbone** (one long, upgraded primary route) · **Deployment** (hardware tempo, clusters, device triggers) |
| Warden — "Hold what remains" | Fortress: shield that turns into damage (Backpressure stores every prevented point), returned to every attacker; Harden grows with every online firewall | **Fortress** (block that becomes backpressure, block that stays) · **Firewall wall** (many firewalls, per-firewall payoffs) · **Protocols** (armed traps and retaliation) |
| Ghost — "Find the hidden path" | Surge: store transmissions, release one targeted spike (Buffer); Deep Cache draws one more | **Buffer** (store, multiply, release) · **Evasion** (misses, dodges, phantoms, cut-proof lines) · **Payloads** (tokens, card chains, exhaust) |

Opening hands draw every **Innate** card first (beyond the draw count if needed; hand limit 10), then guarantee one router card (Core Router or Hardened Router) and two link cards when the deck holds them (Spare Parts adds an extra Optic Fiber), then fill to the draw count. At three energy a Core Router plus two Optic Fibers is exactly one turn and deals 5; the Architect has one energy spare thanks to Hot Swap. Containerlab and Clabernetes never start in a deck and are never guaranteed draws.

---

## Turn rules and resources

- **Energy**: `baseEnergy` (3) every turn. Energy relics raise that **turn base** by 1 each, never above `relicEnergyCap` (5): `turnEnergyBase = min(relicEnergyCap, baseEnergy + energy relics owned)`. The energy relics are the boss relics Anycast, Jumbo Frames, Storm Control, Air Gap, Legacy Mainframe and Overvolt (`ENERGY_RELICS`). **Temporary energy comes on top of the base and is never capped**: next-turn energy (Power Capacitor, kept in `reserveEnergy`), up to 2 unspent energy carried by Reserve Cell, **+1 per PoE Injector online at the start of the turn**, and energy a card gives now (Power Surge). First turn of a battle: +1 Cold Start, −1 SDN Controller. Memory Leak takes 1 when drawn (never below 0). Other unused energy is lost. The energy orb reads `current / base` (`2/3`); energy above the base glows with a lit rise marker, and its tooltip names every source. Energy devices are a legitimate build and are priced in: PoE Injector is rare and costs 2.
- **Draw**: `handDraw` (5) per turn. +1 Deep Cache, −1 Jumbo Frames, **+1 per Cache Server online at the start of the turn**, +1 Fanout while 3+ channels are live, plus next-turn draw (`nextTurn.draw`). Hand limit `handLimit` (10); cards beyond the limit stay in the draw pile. An empty draw pile reshuffles the discard pile with the expedition RNG.
- **Keywords** (capitalised on the face, explained by a glossary tooltip; long exceptions live in a card's `detail`, shown when it is inspected): **Exhaust** leaves play for the rest of the encounter; **Retain** stays in hand at the end of the turn (it does not replace a draw); **Innate** starts in the opening hand; **Volatile** exhausts if it is still in hand at the end of the turn; **Armed** is a protocol waiting in its slot. See [Keywords, Daemons and tokens](#keywords-daemons-and-tokens).
- **Prepare**: set one hand card aside at no cost; it becomes the first card of your next hand, replacing one draw (a hand already full of retained cards leaves it on top of the draw pile). Return it before transmitting if you have hand space. Junk and curses cannot be prepared. The slot clears on victory.
- **Playing a card** spends its energy and removes it from hand. Normal cards go to discard; Exhaust cards and tokens go to the exhausted pile for the rest of the encounter; armed protocols wait in the protocol slots; **daemons** join the daemon strip and run until the encounter ends. Unplayed cards go to discard at end of turn, except Retain cards (kept) and Volatile ones (exhausted). While Kernel Panic is in hand you can play at most 3 cards that turn (console, scrub, repair and relocation are not card plays; deleting a Worm is).
- **Modified costs** are shown on the card's cost gem with their cause: Hot Swap (the first link card each turn costs 0), a free link (Patch Panel), a hardware discount (Rack and Stack), discounted or free hand cards (Blueprint, Rapid Redeploy, Rearm) and Zero Trust (+1 on cable cards and Patch Cable).
- **Console command**: one archetype action per turn without a card (see Consoles).
- **Target**: free, and changeable until the transmission (see [Target and overflow](#target-and-overflow)). Undoable.
- **Relocate** a deployed device: 1 energy (`relocateCost`); unchanged positions are free. Relocation does not repair. A drop or a device-dock band never pays at once: the table shows the device at its new socket (its old socket keeps a faint ring) and a plate beside it names the move with its before → after forecast. **Relocate** (Enter) pays and moves it, undoable; **Cancel** (Esc, Z, right-click, a click elsewhere, or playing a card or transmitting) puts it back for free. A drop back in its own socket asks nothing.
- **Scrub** an installation: 1 energy per integrity point (`scrubCost`); 2 per point while a Quarantine Drone lives (`quarantineScrubCost`).
- **Repair** a worn device: 1 energy per condition point (`repairCost`); Field Engineer makes the first repair each turn free.
- **Offers** (a crate's card choice, an undelivered message) open at the start of the player turn, before the hand is dealt; up to 8 may wait in order.
- Hardware, cables and upgrades stay on the table for the encounter unless a device breaks. Block and burst last for the current turn only (Persistent State carries up to its cap of what the attacks leave; Brace adds next-turn block).
- Jams and cuts last for the following player turn (an escalated level-1 jam lasts two). Hot Patch, Fast Reroute and Link Recovery clear **every** active jam and cut at once; Faraday Shell clears its target's jam; Purge Field clears jams in its band. Old faults clear once at the start of the enemy phase, then each hostile installs its own.
- Scoring: +1 per card played, +10 per point of transmitted damage (all ports), +100 + 5 × integrity per victory.

The v5 economy, reward and health keys (generated from `RULES`):

<!-- generated:rules -->
| `RULES` key | Value | Meaning |
| --- | --- | --- |
| `baseEnergy` | 3 | Energy every turn before relics |
| `relicEnergyCap` | 5 | Energy relics raise the turn base, never above this |
| `handDraw` | 5 | Cards drawn every turn |
| `handLimit` | 10 | Most cards in hand |
| `deckFloor` | 8 | Removal keeps at least this many cards (curses can always go) |
| `keeperShare` | 0.55 | A reward slot draws from the keeper pool at this share, else colorless |
| `rewardRarity` | {normal: [0.65, 0.32, 0.03], elite: [0.55, 0.37, 0.08], guardian: [0, 0.5, 0.5]} | [common, uncommon, rare] per reward kind |
| `legendaryShare` | 0.05 | Share of rare rolls that become legendary |
| `upgradedOfferRate` | [0, 0.12, 0.25] | Share of offered cards that arrive upgraded, per stage |
| `normalHealth` | [20, 5, 16] | Normal room: [base, per floor, per stage], floors and stages zero-based |
| `eliteHealth` | [38, 3, 13] | Elite room: [base, per floor, per stage] |
| `guardianHealth` | [90, 128, 176] | Guardian per stage |
| `eventHealthScale` | 1.4 | Signal in the Static: × a normal room |
| `payloadDamage` | 2 | Payload token: damage this turn |
| `maxProtocols` | 2 | Protocol slots (Policy Engine adds more) |
| `bufferMultiplier` | 1.5 | Buffer console: stored × this (Deep Queue raises it) |
| `backpressureRatio` | 1 | Backpressure relic: share of prevented damage stored (Flow Control raises it) |
| `hardenShield` | 1 | Harden console: block before its bonuses |
| `hardenPerFirewall` | 1 | Harden: block per online firewall |
| `hardenPerHostile` | 0 | Harden: block per hostile beyond the first (the v4 pack addition) |
| `hardenPerAdd` | 0 | Harden: block per living guardian add (the v4 pack addition) |
<!-- /generated:rules -->

### End-turn order (forecast and resolution)

`combatPreview` is pure: it consumes no RNG and mutates nothing. It runs the same resolver as `endTurn` on a copy of the state, and `endTurn` then performs only the RNG steps (junk positions, rewards, draws). Every number the forecast shows is therefore the number resolution uses: per port, per hostile, per installation, per worn device. Every enemy-phase effect of a daemon, a curse in hand or a turn effect is computed inside the resolver and appears in the forecast as a labelled term, wear record or evasion; the only exception is a daemon's `turnStart` gain (Keepalive's block, Trickle's buffer, Botnet's Payload), which happens after the draw and is not part of `nextTurn`.

1. **The board as transmitted.** Routes, channels and the primary route; each living hostile's intent in port order (cadence, escalation, designations, riders); deliveries, merged packets per port (daemon terms included: Carrier Grade's route term, Deep Buffers per switch, Fabric Controller per bandwidth delivery, Datacenter per cluster, Payloads and Exploit Kit), armor and overflow; disruption targets planned in port order against this board; every installation's next effect; quarantine targets; wear and breakdowns; Reclaim; arrivals and the signal; next turn's energy, draw and block on the post-phase board.
2. **Transmit.** Each living port takes its packet (after armor and overflow). Buffering (Ghost) stores the whole network sum × the buffer multiplier (`bufferMultiplier`; Deep Queue raises it) and deals 0 to every port; stored backpressure is consumed into it. A transmission with a live route clears buffer and backpressure.
3. **Lethal per hostile.** A hostile at 0 health does nothing: its attack, fault, field, junk and installation are cancelled (Spiteful is the printed exception). A guardian whose own port took at least its break threshold on the ultimate turn is interrupted. If no hostile stands, rewards open and Repair Drone restores 1 integrity (curses in hand then cost nothing: the enemy phase never happens).
4. **Traps and quarantine.** Honeypot decoys bite each attacker; protocols fire (once per phase each; Tripwire and Port Security deal their damage here, Incident Response adds its retaliation to every protocol that fires); each firewall online at transmission time quarantines the nearest installation within reach; a destroyed installation grants Reclaim. A hostile killed here is cancelled; if none stands, you win. Then **misses** (Spoof, Obfuscation) take the first remaining jams and cuts, and Phantom Nodes absorb the first remaining installations and disruptions, in port order.
5. **Installs and heals.** Per hostile in port order: its installations are planted (a honeypot bite applies on arrival); Packet Leech, Tap Spinner and Static Nest heal; Hungry heals.
6. **Faults, fields and the table front.** Old faults clear once (a level-1 jam in its second turn stays); temporary fields tick down (not in an anchored band) and expire. Per hostile in port order: its field, its jams, its cuts (with level-1 frays), its overload, The Last Signal's wear riders and Total Blackout's wear. Then every installation in placement order: Jammer jams, Spike wear, Breaker Charge tick or detonation. Then a Bitrot in hand wears the first router on the primary route. Breakdowns apply at once: wreckage lands, routes are recomputed.
7. **Junk** is inserted into the draw pile per caster, at seeded positions (the only RNG in the enemy phase).
8. **Attacks.** In port order, against one shared shield pool plus each attack's own firewall and protocol shield; **dodges** (Ghost Protocol) make the first strikes or breaches deal 0, and Null Route cancels a breach's damage (its riders still resolve); corrosion, Worms and chip attach once, to the first attack that lands; Storm Control's damage comes last, and a Backdoor in hand costs its integrity with the attacks (unblockable). Integrity loses what gets through. Backpressure stores `backpressureRatio` (all of it since the v5 balance pass; Flow Control: 150 %) of everything prevented across the phase.
9. **Exposed on interrupt**, on the guardian's port; adds act regardless. Action counters advance (escalation, the guardian's step machine) and the phase's attackers are recorded for the Warden's release.
10. **End of the phase, next turn.** A reinforcement whose count reaches zero takes the first empty port; a guardian whose charge is now announced raises its adds; a signal is announced or fires. Fallen hostiles open crates, Laden messages and Salvaged drops (salvage lands on the table now). Next turn: energy (`turnEnergyBase` + next-turn energy + Reserve Cell's carry + online PoE Injectors), draw (`handDraw` ± relics + online Cache Servers + Fanout + next-turn draw) and block (Grounded Core 1 + what Persistent State carries + next-turn block) from the forecast on the post-phase board; if no live route exists now, a remaining buffer is lost (**packet loss**); burst, console uses, repairs, buffering and this turn's effects reset; a dead target moves on (see [Target and overflow](#target-and-overflow)); the hand keeps its Retain cards, exhausts its Volatile ones and discards the rest; the prepared card comes first and the hand is redrawn; then running daemons act (`turnStart`); waiting offers open before the hand is dealt.
11. Zero integrity ends the expedition.

A hostile forecast as defeated shows no incoming damage and no disruption; the others keep theirs (Spiteful prints "resolves anyway"). A half-health threshold crossed by this transmission changes the *next* intent, never the one already forecast.

---

## Packs and ports

### Ports and hostiles

An encounter holds one to three hostiles at three ports: **left, centre, right**. A leader (or a single hostile, or a guardian) stands at the centre; escorts take left, then right. A stage I duo leaves the centre empty. Reinforcements and adds take empty side ports, left before right.

- Every hostile has its own health, pattern, traits, enrage and action counter; leaders and singles carry designations (see [Designations](#designations)).
- Hostiles act in **port order**: left, centre, right.
- **Escorts and adds do not escalate.** They receive no stage bonus, no pressure and no enrage, and never reach an escalation level. BGP Hijack (+2) and Ingress Filter (−1) still apply to their attacks; Sharper Teeth does not (`ascensionAttackRoles` 1: leaders, singles and guardians only).
- **Escorts act on alternate enemy phases.** The left escort acts on odd phases (1, 3, 5, …), the right escort on even ones; a dormant escort shows DORMANT and does nothing. In a trio exactly one escort acts each phase; a lone escort acts every other phase. Its pattern advances only on the phases it acts. Adds act every phase from the ultimate turn.
- A hostile at 0 health before its action resolves does nothing (Spiteful excepted). The encounter ends when every hostile is defeated; rewards, credits and Repair Drone trigger once. A guardian's death does not end the fight while its adds live.

### Deliveries

Every live channel of the forecast's channel set is a **delivery**. The channel containing the primary route is the **primary delivery**; the others are bandwidth deliveries, in the forecast's order.

- The **primary delivery** carries every route term (base route, switches, configured and overclocked routers, compressed switches, amplified and frayed cables, resonance and suppression), clusters, burst cards, BGP Hijack, backpressure, the buffer release and one point per online Load Balancer.
- Each **bandwidth delivery** carries bandwidth 3 (`bandwidthPerChannel`; Parallel Core 4, `parallelCorePerChannel`) plus one point per online Load Balancer (`balancerPerChannel`).
- **Siphon Taps** take −2 each (`malwarePenalty`) from the primary delivery first, then from bandwidth deliveries in channel order. **Spanning Tree** doubles the primary delivery's route terms; bandwidth deliveries carry 0.
- Every delivery lands on the **target** (below): the deliveries **merge** into one packet. Armor and plating are subtracted once from the merged packet; the packet is clamped at 0. There is no per-channel aiming: the forecast still lists one delivery per channel (the table flies one packet per channel, and Details itemises each), but every delivery's port is the target.

**The single-hostile invariant.** With one hostile every delivery merges at its port: R + K + L + (c − 1)(B + L) − 2M equals the v3 transmission R + K + B·(c − 1) + L·c − 2M, clamped, minus armor. A regression test replays the v3 forecast and resolution on 160 randomized boards (every enemy of the v3 roster) and requires identical numbers wherever no install or overload is involved.

### Target and overflow

- **Target.** One port is the target (the rules call it the **focus**, `RunState.focus`). At the start of a fight: the leader; without one, the hostile with the most health. When the target dies: the leader if alive, otherwise the living hostile with the least health (ties: port order). The player may change the target at any time, for free and undoable: click a hostile (its body, rail plate, intent badge or port row), or press F to move it along the rail.
- **Every delivery lands on the target.** All channels merge there into one packet and pay its armor once. There is no per-channel aiming; the Ghost's buffer is one number released with the primary delivery, so it lands on the target too.
- **Overflow.** Damage beyond a hostile's remaining health flows to the target if that is a different living hostile, otherwise to the next living port in order left, centre, right. Overflow pays the receiving port's armor. The forecast prints it ("overflow 3 → CENTRE"). Since every delivery lands on the target, a target's own surplus always goes to the first standing port from the left; surplus from another port (an every-port card) goes to the target.
- **Break thresholds** count only the packet that lands on the guardian's port, after armor and after overflow into it. Targeting an add on the charge turn kills it and overflows the rest into the guardian.
- **Broadcast Storm**, **Packet Storm** and **Flood Fill** add their amount to every living port's packet (they need a live route). **Traffic Shaping** and **Demolition Charge** add to the target's packet.
- Saves from before the change may carry `aims`; they load, and the aims are dropped (as is Traffic Shaping's old `forceFocus` flag).

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

Each member's health is H × `packHealthScale` × share ÷ (sum of the shape's shares), rounded; with the shipped shares that is exactly share × H, and `packHealthScale` remains the single lever. Hardened adds 20 % to its carrier; Hardened Quarantine (ascension 1: elites `hardenedElites` × `ascensionEliteHealth`, normals `stubbornSignals` × `ascensionNormalHealth`) scales H as usual, so it reaches every pack member and reinforcement. Example: a stage II floor 3 room (H = 39) as Static Nest + Tap Spinner is 29 / 16.

Adds have fixed health: Gate Warden 8, Chorister 10, Quarantine Drone 14 (`addHealth`); The Last Signal (ascension 4, `ancientGuardians`) multiplies it by `ascensionAddHealth` (1: unchanged, although the guardian gains `ascensionGuardianHealth`, +5 %).

### Pack frequency, templates and budget

Normal rooms hold a pack at `packRate` 25 % / 40 % / 55 % by stage (stage I from floor 3, `packFromFloor`); 40 % of stage III packs are trios (`trioShare`); Sharper Teeth (ascension 3, `lingeringCorruption`) adds 15 points (`packRateAscensionBonus`). Every elite from stage II leads its escort. Stage I elites and guardians fight alone. Signal in the Static rolls like the stage's normals.

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
| Edge switches on the primary route | +1 each (Packet Lens: +2 each; Deep Buffers daemon: +1 more each per copy) | primary | No cap |
| Startup Config routers on the primary route | +1 each | primary | No cap |
| Overclocked routers on the primary route | +2 each | primary | No cap |
| Compressed switches on the primary route | +2 each | primary | No cap |
| Amplified cables on the primary route (Amplified Fiber, VXLAN; violet fibre on the table) | +1 each | primary | No cap |
| Frayed cables on the primary route (wreckage, or a level-1 cut's fray) | −1 each | primary | No cap |
| Resonance on a band crossed by primary-route hardware | +3 | primary | Per field per band (terrain, cast and signal fields stack) |
| Suppression on a band crossed by primary-route hardware | −3 | primary | Per field per band |
| Spanning Tree (boss relic) | + the route subtotal above (×2) | primary; bandwidth deliveries carry 0 | Replaces bandwidth and balancers |
| Carrier Grade (daemon) | +1 per device on the primary route, per copy | primary; it also counts when the primary route is chosen | No cap |
| **Bandwidth** | +3 per channel beyond the first (Parallel Core: +4; Fabric Controller daemon: +2 more per copy) | each bandwidth delivery | No cap |
| **Load Balancers** online | +1 per balancer | every delivery | No cap |
| **Cluster**: a band holding 3+ online devices (racks count) | +2 per band (Datacenter daemon: +3 more per copy) | primary | Terminals excluded |
| Siphon Taps on the table | −2 each | primary first, then bandwidth deliveries in channel order | At most 4 installations |
| Burst this turn (cards; per-channel, per-device, per-firewall and per-card burst is counted when the card is played) | Card amounts | primary | This turn only |
| Payload tokens played this turn | `payloadDamage` each (Payload+ 3; Exploit Kit daemon: +1 more each per copy) | primary, as the terms "Payload ×N" and "Exploit Kit · Payloads ×N" | This turn only |
| BGP Hijack (boss relic) | +3 | primary | Every transmission |
| Backpressure (Warden) | Stored amount | primary; or in full on every port that attacked last phase (packs) | Consumed by the transmission |
| Buffer release (Ghost) | Whole buffer | primary | When not buffering; Exfiltrate deals it at once instead, ignoring armor |
| Priority Queue (relic) | +1 | primary, when the target has the least health (ties count) | — |
| Every port (Broadcast Storm, Packet Storm, Flood Fill) | Card amount | every living port | This turn only |
| Target packet (Traffic Shaping, Demolition Charge) | Card amount | the target's port | This turn only |
| Exposed guardian | +3 (`exposedBonus`) | the guardian's port, when a delivery lands there | One transmission after an interrupt |
| Armor and plating | Negative, see Enemies | subtracted once per port from the merged packet | Bypassed while exposed; Spearhead's release ignores it |

Each port's packet is clamped at 0 ("Minimum signal damage"). A band counts once even if it holds both a terrain field and a cast field of the same kind. Resonance and suppression count bands crossed by deployed hardware; the fixed terminals never activate fields.

Examples:

- A basic router route deals **5**; with Startup Config **6**; a router + Edge Switch route with an overclocked router **5 + 1 + 2 = 8**.
- Two plain router channels: **5 + 3 bandwidth = 8**. Against Ferric Colossus the armor falls from 4 to 2: **6**, versus **1** on a single route.
- Three channels and one online Load Balancer: primary 5 + 1 and two bandwidth deliveries of 3 + 1: **6 / 4 / 4 = 14** on the target.
- Against a Spark Mite + Splicer duo, two channels: all 8 on the target, and anything beyond its health overflows to the other.
- Containerlab: an overclocked router cabled to both terminals, **7**.
- Ghost buffers an 8-damage turn: **+12** stored at ×1.5 (Deep Queue: ×2.5, **+20**); next turn **8 + 12 = 20** on the target.
- A Ghost plays Fork Bomb and its two Payloads with Exploit Kit running: **+2 × (2 + 1) = +6** on the primary delivery.

### Defense: why integrity damage is blocked

Each attack's raw damage is its intent amount (after pressure, stage threat, enrage, escalation, ascension, designation, trait and relic modifiers); corrosion, Worms in hand and chip terms join the first attack that lands. The phase's pool terms form one shield pool; each attack meets its own per-attack terms first, then draws from the pool in port order.

| Shield term | Amount | Scope |
| --- | ---: | --- |
| Block this turn (cards, Harden with Hardening Guide's bonus, daemons' turn-start block such as Keepalive) | Card amount | pool |
| Block carried (Persistent State daemon) and next-turn block (Brace) | What the attacks left of last turn's block, up to the daemon's cap (`values.amount`: 2, upgraded 4; the highest running cap counts), then the card amount | pool |
| **Online firewalls** vs a breach / strike | 2 / 1 each; Stateful ×2; Zero Trust ×2; Bulkhead and Defense in Depth +1 per firewall per attack (the daemon per copy); stacking | every attack |
| Separated circuits: two disjoint channels, one with a North router and one with a South router | 3 | pool |
| Aegis field: an online device in the band | 3 | pool |
| Null field: any hardware in the band | 2 | pool |
| Protocols: Failover Policy (on a cut), Rate Limiter (strike), IPS Signature (breach) | as printed | the action it fired on |
| Null Route (Warden protocol) | cancels a breach's damage; its riders still resolve | the breach it fired on |
| Dodges: Ghost Protocol | the first N strikes or breaches this enemy phase deal 0 | in port order |
| Honeynet: a honeypot absorbed a disruption | 2 each | pool |
| Reclaim: an installation was destroyed | 2 each (`reclaimShield`; Sentry quarantine +2) | pool |
| Watchdog: first transmission of the battle with no live route | 5 | pool |
| Shield Array: first hit that gets through each battle | up to 2 | once per battle |

Firewalls only block strikes and breaches, and not on an interrupted ultimate. **Misses** (Spoof, Obfuscation) are not shield: the next jams or cuts of the phase miss, taken after protocols and before Phantom Nodes; they never take overloads or installations, and a Jammer's jam can miss. Faraday Shell is **jam protection**, Armored Fiber / VXLAN / Dark Fiber are **cut protection**, not block; jam protection does not stop an overload. An ordinary jam against an empty table, or a cut against a table without cables, deals 1 exposed-backbone damage; if a grid exists but every target is protected, the disruption fails harmlessly. Null Storm's and Ash Moth's band jams are exempt: an empty band is a successful dodge.

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
| Breaker Charge | 1 | Countdown 2 (`breakerCountdown`), shown on the table; it ticks each enemy phase once active. At 0 it detonates: every device within reach breaks regardless of condition (racks in the blast break too; a device sheltered by a rack outside it passes 1 wear to that rack instead), and its socket becomes wreckage. | reach socket (Demolition Engine: beside the device with the most cables) | Demolition Engine, guardian charges at ascension 4 |

**Placement.** At most 4 installations stand at once (`maxInstallations`). An install against a full table instead gives the oldest installation +1 integrity (maximum 3); the forecast states which. Band sockets use the v3 malware rule: the free socket nearest the centre of the busiest band, Center then North then South on ties. Reach sockets choose a target device first (by default the most valuable primary-route router, ties: earliest installed; Rigger Drone: the device the leader's action names this phase; Demolition Engine: the most cabled device; Rigged: the cut cable's nearer device), then the first legal point of twelve compass points at 1.6 from it, starting at the point facing the far rail and turning clockwise, then the same twelve at 2.0 (`reachRings`); if none is legal, the band-socket rule applies. One install per hostile action, plus riders; a lethal packet on the planter cancels it.

**Timing.** An installation acts from the hostile action after the one that planted it. Installations act once per enemy phase, in placement order, after every hostile's own action; an installation is active in a phase when a later hostile acted after its planter (so a Rigger Drone's Spike planted from the left port can wear in the same phase if the centre hostile acts after it). A Siphon Tap is passive: its −2 applies from the next transmission.

### Removing installations, and Reclaim

- **Scrub**: click an installation (or its ledger tag): 1 energy removes 1 integrity; at 0 it is destroyed. While a Quarantine Drone lives each point costs 2.
- **Purge Field** destroys every installation in its band, plus hostile fields and jams. An Anchor takes the whole purge alone: the band's field needs a second purge (or the Anchor's removal first).
- **Firewall quarantine**: in the trap step of every enemy phase, each firewall online at transmission time deals 1 (`quarantineDamage`; Sentry Firewall 2, `sentryQuarantine`) to the nearest installation within reach, whatever its route delivers. Two firewalls may hit the same installation.
- **Honeypot bite**: an installation planted within reach of a cabled Honeypot arrives with 1 less integrity (`honeypotBite`); Taps and Breaker Charges arrive destroyed. Honeynet adds nothing to the arrival bite.
- **Demolition Charge** destroys one installation of your choice outright.
- **Reclaim**: every destroyed installation grants 2 shield (`reclaimShield`) to the coming enemy phase's pool (Sentry quarantine kills +2, `sentryReclaimBonus`). It feeds the Warden's backpressure at the normal rate and cannot be banked.
- **Scorched Earth** (boss relic): the planter of a destroyed installation takes 4 (the target if the planter is dead).

### Condition, wear, breakdown and repair

- Every deployed device has condition 2 (`deviceCondition`); salvage pre-placed by terrain, dropped from crates or by a Salvaged hostile has 1 (`salvageCondition`). A Server Rack has 3 (`rackCondition`). Reinforced Frame adds 1 (`reinforcedFrameCondition`); Scorched Earth removes 1 (`scorchedEarthCondition`, minimum 1); Redundant PSU raises a device's maximum to 3 for the battle (`psuCondition`). Terminals and Phantom Nodes have no condition.
- **Overload** is an intent kind: no integrity damage, 1 wear to its target. It follows the jam rule: a cabled honeypot outside a rack's ring first (it bites for 3, Honeynet applies), then a primary-route device, then the first eligible device. Jam protection does not stop it; racks and phantoms are never its target. Scrap Foreman's overload prefers the most worn primary-route device.
- **Spikes** wear 1 each phase; a **detonation** breaks everything within reach; the enraged Blackout Core's **Total Blackout** wears every primary-route device by 1 (`blackoutWear`), before the right-port add acts; at ascension 4 (The Last Signal) the Regent's CLOSE THE GATES and the Choir's STOLEN VOICE also wear their target.
- **Racks shelter.** A device within reach of a Server Rack cannot be overloaded, spiked or detonated: the nearest rack takes the wear instead.
- **Breakdown** at condition 0: the device is removed with all its cables, its upgrades (configured, overclocked, amplified, shielded); its socket becomes wreckage for the encounter (fresh, tinted in its role's colour), with the usual 1.3 clearance and fraying. Hardware cards already cycle to the discard pile when played, so a breakdown changes no pile; Containerlab, Emergency Rebuild and Clabernetes deployments are gone for the encounter anyway. Racks and phantoms leave no wreckage. Wreckage from terrain, breakdowns, detonations and COLLAPSE shares a cap of 6 (`wreckCap`); beyond it the socket is simply freed. Routes, channels and online state are recomputed at once; a breakdown that removes the only route causes packet loss at the start of the next turn.
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

A guardian charges on its fifth action **or** on its first action after falling to half health (the enrage threshold: 50 %; The Last Signal's `ascensionEnrageThreshold` is 0.5 too, so it no longer enrages them earlier), whichever comes first; the ultimate follows on the next action; the pattern then resumes where the charge pre-empted it. The half-health trigger only pre-empts the first charge of the fight; an early charge spends that cycle's charge and ultimate. The forecast labels an early charge "WOUNDED". The guardian's escalation counter keeps running through the charge: in stage III the Blackout Core reaches level 2 on its fifth action, so Total Blackout's corrosion lasts a turn longer and its next jam hits two devices.

**Adds.** When a guardian's charge is announced (the end of the phase before the charge), it raises two adds at the empty side ports. They stand on the charge turn with their intents shown (RISING, dormant through the charge phase) and can be killed there; they act from the ultimate turn, the left one before the guardian and the right one after, then every phase until killed. The next charge raises adds only at empty ports.

| Add | Raised by | Health | Ultimate-turn action | Afterwards | Trait |
| --- | --- | ---: | --- | --- | --- |
| Gate Warden ×2 | The Iron Regent, THE CROWN RISES | 8 | IRON STEP strike 2 | Strike 2 every phase | +4 break each. No armor. |
| Chorister ×2 | The Hollow Choir, ONE LAST BREATH | 10 | DESCANT strike 2 + 1 Packet Loss | HELD NOTE strike 2 every phase | +4 break each. While any lives the Choir's plating is 3 (`choirAddPlating`). |
| Quarantine Drone ×2 | Blackout Core, EVENT HORIZON | 14 | ISOLATE: plants a Jammer at 1.6 from the primary router | SEAL THE SHELL strike 3 every phase | +4 break each. While one lives, scrubbing costs 2 per point. |

Each add alive when the ultimate resolves raises the break threshold by 4 (`addBreakBonus`, raised from the design's 3 in balance; ascension 4: 5, `addBreakBonusLate`): Regent 12 → 16 → 20, Choir 15 → 19 → 23, Core 18 → 22 → 26. Interrupting the ultimate cancels the guardian's action only; the adds still act. Adds are hostiles, not installations: they cannot be scrubbed and carry no crates and no designations.

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
| HUNGRY | Heals 2 (`hungryHeal`) after any transmission that dealt it no damage (buffered, another target with no overflow into it, or no route). | bad | 1.5 | 1 | Every leader and single except Packet Leech and Static Nest |
| SPITEFUL | Its last announced action resolves even if it dies that turn. | bad | 1.5 | 1 | Stage III hostiles only; never hidden |
| LADEN | Carries an undelivered message: defeating it drops a message you answer with a named choice. | good | 0 | 1.5 | Every leader and single |
| SALVAGED | On defeat it drops salvage hardware at the first free auto-deploy socket, condition 1. | good | 0 | 1.5 | Every leader and single |

**Rolling.** Designations are rolled with the chart. A leader or single carries one at `designationRate` 20 % / 35 % / 50 % by stage (stage I from floor 3, `designationFromFloor`); every elite from stage II carries one; duos carry none. Bad and good roll from one weighted table (bad 1 each, Laden and Salvaged 1.5 each). A bad designation heavier than the template's headroom falls back to Laden or Salvaged, so the heaviest packs most often carry cargo. Sharper Teeth (ascension 3) gives elites a second designation half the time (`eliteSecondDesignation` 0.5); The Last Signal (ascension 4) lets normals roll a second at half the room's designation chance (`normalSecondDesignation` 0.5). Two designations never repeat, never pair Stoked with Shedding, are never both good, and ignore the ascension 0 budget.

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
| Credit | 3 | 6 credits (`messageCredits`; Lean Supply applies), banked if taken mid-fight. |
| Recover | 2 | A named rare card enters your hand for this encounter only; it exhausts when played. Left out when no hostile is standing. |
| Purge | 2 | Every junk card leaves your piles for this encounter, and one curse leaves your deck permanently if you carry one, named in the option (`PURGE_ORDER`: CVE, Zombie Process, Kernel Panic, Backdoor, Bitrot, Memory Leak; one copy also leaves this battle's piles). |

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
| Router | Core Router, Hardened Router (jam-proof), Standby Router (Architect; cabled to its nearest device, two when upgraded), Containerlab/Emergency Rebuild (auto-cabled), Clabernetes (clone) | Every route needs one. Configured +1, overclocked +2 on the primary route. |
| Switch | Edge Switch, Signal Relay (jam-proof), Linux Bridge (auto-cabled), Spine-Leaf (Architect; cabled to every router), Rack and Stack (Architect), Splice (Architect; spliced into the primary route's longest cable) | +1 on the primary route; compressed +2 more. |
| Firewall | Trust Gate (colorless), ACL Gate (Warden; cabled to its two nearest devices), Bastion (Warden; jam-proof), Stateful Firewall (Warden; blocks double), Sentry Firewall (Warden; quarantine 2; jam-proof when upgraded) | Online: blocks 2 of every breach or 1 of every strike; firewalls stack. Online: quarantines the nearest installation within reach each phase. No damage bonus. |
| Honeypot | Honeypot | While it has at least one cable, jams, cuts and overloads target it first (at most one per hostile action) and each absorbed disruption deals 3 to the attacker (Honeynet +2 and 2 shield); it decoys a Jammer's jam and bites the Jammer. Installations planted within reach arrive with 1 less integrity. Works offline. Cable Wraith's cut ignores honeypots. |
| Cache | Cache Server | Online at the start of your turn: draw 1 more. |
| Power | PoE Injector | Online at the start of your turn: +1 energy. |
| Balancer | Load Balancer | Online: +1 damage on every delivery. |
| Rack | Server Rack | Never cabled, carries no signal. Devices within reach cannot be overloaded, spiked or detonated: the nearest rack takes the wear. Condition 3. Counts toward its band's cluster and corrosion. Leaves no wreckage. |
| Phantom | Phantom Node, Decoy Swarm (Ghost; two phantoms, three upgraded, at free auto-deploy sockets) | Never cabled, on no route. Absorbs the next jam, cut, overload or installation aimed at your table (first in port order; Phantom Node+ two), then fades. |

"Start of your turn" is evaluated on the post-phase board, after new faults and breakdowns, so a cut, a jam or a breakdown can take a cache or injector offline for that turn. The forecast shows next turn's energy and draw.

### Enemy disruption targeting (deterministic, forecast)

- **Jam**: a cabled, unprotected honeypot first → (Null Marshal) an online firewall → a primary-route device → the first eligible device; never racks or phantoms. Storm and Moth jams consider only their announced band. Level 2: a second device after the first.
- **Cut**: an unarmored honeypot cable first (not for Cable Wraith) → Cable Wraith: the longest unarmored cable (cable ID breaks ties); a cut longer than 6 units also deals 1 damage → others: a primary-route cable → the first eligible cable. Splicer's twin cut and level 2 take a second cable.
- **Overload**: a cabled honeypot outside a rack's ring → (Scrap Foreman) the most worn primary-route device → a primary-route device → the first eligible device.
- **Hostile field**: suppression targets the band holding the most primary-route hardware; corrosion the band holding the most deployed hardware. Ties prefer Center, North, then South. Band jams with a field use the jam band. Root Blight's CORRODE picks the busiest band and remembers it; SPREAD corrodes the adjacent band with the most hardware.
- **Installations**: band and reach sockets as in [The table front](#installations); a Jammer jams the nearest unprotected device within reach; a Spike wears the nearest device within reach.
- **Answer order** within a phase: honeypot decoys (targeting), then protocols (first matching action in port order), then misses (Spoof, Obfuscation: the next jams or cuts), then Phantom Nodes (the first remaining unit in port order: within a hostile, its install, jams, cuts, overload). A Port Security left unfired by the hostiles may cancel a Jammer's jam later in the phase, and Incident Response also hits a Jammer that Port Security answered.

Every card play, target, relocation, repair and scrub updates the forecast before you commit.

---

## Consoles and engines

Each archetype has one console command, usable once per turn (SDN Controller: twice, except Buffer), shown in the battle command dock (key **C**). Console uses are not card plays (Kernel Panic ignores them).

| Console | Cost | Rule |
| --- | ---: | --- |
| Patch Cable (Architect) | 1 (+1 Zero Trust) | Connect two devices with a standard cable. It is not a link card, so Hot Swap and Patch Panel do not apply. |
| Harden (Warden) | 1 | Gain `hardenShield` (1) block, +1 per online firewall (`hardenPerFirewall`), + Hardening Guide's bonus per copy, and restore 1 condition on your most worn device. The v4 pack additions `hardenPerHostile` and `hardenPerAdd` are 0. Double Shift runs the same Harden without using the console. |
| Buffer (Ghost) | 0 | Toggle: this turn's transmission is stored instead of dealt. Use again before transmitting to cancel and refund the use. |

**Mesh (Architect).** Width is power and destinations: every channel beyond the first adds a delivery, Load Balancers add a point to every delivery, clusters reward crowded bands, and Hot Swap plus Patch Cable make cables cheap. Three channels and a balancer deliver 6 / 4 / 4, enough to finish an escort and press the leader in one turn; Flood Fill cashes width in on every port, and Rapid Redeploy rebuilds a broken router the same turn. At three energy a new channel (a router and two links) is a whole turn, so the Architect's cheap links (Hot Swap, Patch Panel, Branch Line, Standby Router) are its tempo. The cost is exposure: more cables to cut, more devices inside reach rings, Weaver's tension trap and corrosion on crowded bands.

**Harden against packs (removed in v5).** v4 added +1 Harden block per hostile beyond the first (`hardenPerHostile`) and +1 more per living guardian add (`hardenPerAdd`), pending the user's approval, because the v4 Warden lost to guardian fights (see [Balance evidence (v4, history)](#balance-evidence-v4-history)). The v5 balance pass set both keys to 0, restoring the design's Harden, and answered the Warden with the Backpressure rule instead (see [Balance evidence (v5)](#balance-evidence-v5)).

**Fortress (Warden) — Backpressure.** `backpressureRatio` (1: all of it, the v5 Warden rule; Flow Control running: `values.amount` 1.5, rounded up) of the damage your shield prevents during an enemy phase is stored and added to your next transmission as "Backpressure", then consumed. Against a pack it lands in full on every port whose hostile struck or breached you last phase. It persists while you have no live route. Pushback adds to it, Vent turns it into block (and keeps it), Reflect doubles it. Prevented damage counts every raw source (attacks, corrosion, Worms, chip); Reclaim shield feeds it like block. Harden repairs 1 per use, so a Spike-plus-overload cadence costs the Warden nothing extra, and its block grows with every online firewall and Hardening Guide.

**Surge (Ghost) — Buffer.** While buffering with a live route, the transmission stores `⌊max(0, sum) × multiplier⌋` (`bufferMultiplier`, 1.5; each running Deep Queue adds 1: ×2.5, ×3.5), where the sum is every delivery (backpressure, burst and Payloads included) plus every-port and target bonuses, before armor and the exposed bonus (stored packets meet armor when released). The target does not matter while buffering: a buffered turn deals 0 to every port. The next normal transmission with a live route releases the whole buffer with the primary delivery ("Buffer release"), on the target; it counts toward interrupting an ultimate, and Spearhead makes it ignore armor and plating. Exfiltrate deals the buffer to the target at once, ignoring armor (not a transmission). **Packet loss**: if you would start a turn with a positive buffer and no live route (a cut, a jam or a breakdown), the buffer is lost; the forecast warns ahead. Store and Forward, Jitter Buffer, Hold Queue (while buffering), Trickle (each turn) and Man-in-the-Middle (per card played) add to the buffer directly; Replay Attack doubles it. A buffered turn deals 0 to every port, so Packet Leech and a Hungry hostile heal. The buffer resets at encounter end.

---

## Protocols

Protocol cards (keyword **Armed**) are paid and armed face down in one of **two** protocol slots (`maxProtocols`; each running Policy Engine adds one, `protocolLimit`). They persist across turns until a matching hostile action triggers them, then go to discard (Rearm returns the last one, free this turn). Unfired protocols vanish at encounter end (the deck is the master list). Each trigger fires **once per enemy phase**, on the first matching action in port order; among armed protocols of the same trigger, arming order decides. The forecast names every protocol that will trigger and includes its effect in every number. A protocol's effect is data (`protocol`: its trigger; `cancels`; `values.shield` / `reduce`; `values.damage` in the trap step), so the resolver needs no code per card.

<!-- generated:protocols -->
| Protocol | Card | Cost | Rarity | Trigger | Face | Upgrade (+) |
| --- | --- | ---: | --- | --- | --- | --- |
| Failover Policy | Colorless | 1 | common | cut | Armed. When a hostile would cut a cable: cancel its cuts and gain 3 shield. | Armed. When a hostile would cut a cable: cancel its cuts and gain 6 shield. |
| Port Security | Colorless | 1 | uncommon | jam | Armed. When a hostile would jam: cancel its jams; it takes 4. | Armed. When a hostile would jam: cancel its jams; it takes 7. |
| Rate Limiter | Colorless | 1 | common | strike | Armed. When a hostile strikes: gain 5 shield against it. | Armed. When a hostile strikes: gain 8 shield against it. |
| IPS Signature | Colorless | 1 | uncommon | breach | Armed. When a hostile breaches: gain 6 shield against it. | Armed. When a hostile breaches: gain 9 shield against it. |
| Quarantine Rule | Colorless | 1 | uncommon | field | Armed. When a hostile casts a field: cancel it. | cost 1 → 0 |
| Tarpit | Colorless | 1 | rare | ultimate | Armed. When a guardian charges or unleashes its ultimate: it takes 8. | Armed. When a guardian charges or unleashes its ultimate: it takes 12. |
| Tripwire | Warden | 1 | common | strike | Armed. When a hostile strikes: it takes 7. | Armed. When a hostile strikes: it takes 10. |
| Null Route | Warden | 2 | rare | breach | Armed. When a hostile breaches: cancel the breach. | cost 2 → 1 |
<!-- /generated:protocols -->

Details: protocols do not fire on a disruption a honeypot already absorbed; a lethal packet on a hostile fires none against it; on an interrupted ultimate no attack remains to trigger them. Protocol shield belongs to the attack it fired on. A cancelled strike or breach (Null Route) deals 0, but its riders (fields, faults, junk, installations) still resolve; the breach trigger also matches an ultimate's breach. Honeypot, Port Security, Tripwire, Tarpit and Incident Response damage resolves in the trap step, before any hostile acts; if it defeats a hostile, that hostile's action is cancelled, and if none stands, you win.

---

## Keywords, Daemons and tokens

Card faces stay short (≤ 90 characters where possible, never above 130) and use one vocabulary ("+3 damage this turn.", "Gain 4 block.", "Draw 2.", "Next turn: +1 energy.", "Deploy a router.", "Link two devices.", "jam-proof", "cut-proof"); numbers are read from the card's `values`, so tuning changes the face. Long exceptions live in the card's `detail`, shown when it is inspected and in the tables below. Keywords are capitalised words with a glossary tooltip, read from the card's flags (`src/card-marks.ts`), never parsed from the face:

| Keyword | Rule | Data |
| --- | --- | --- |
| **Exhaust** | Leaves play for the rest of the encounter. | `exhaust` |
| **Retain** | Stays in your hand at the end of your turn (it does not replace a draw). | `retain` |
| **Innate** | Starts in your opening hand, drawn before the guaranteed router and links, beyond the draw count if needed (hand limit 10). | `innate` |
| **Volatile** | If it is still in your hand at the end of your turn, it exhausts. | `volatile` (Packet Loss) |
| **Armed** | A protocol waiting in its slot; it fires once, by itself, on its trigger. | `target: "protocol"` |
| **Daemon** | A card type: playing it starts a process that runs for the rest of the encounter; it never goes to the discard pile. Copies stack (each adds its effect). | `target: "daemon"`, `RunState.daemons` |
| **Token** | Made for this encounter only: it exhausts when played and never enters the deck. | `token` (Payload) |
| **Curse** | Unplayable, permanent until removed at a Sanctuary or Market, even at the deck floor. | `curse` |

**Daemons.** `playDaemon` pays for the card and pushes it to `RunState.daemons` (cleared at encounter start and end). The **daemon strip** beside the protocol dock shows each running daemon as a plate with its name, copies (×2) and effect line; the tooltip and inspect show the full text and `detail`. Every hook receives the number of running copies of its id (a base and its `+` are separate ids and separate terms). Player-turn hooks: `turnStart` (after the draw: Keepalive, Trickle, Botnet), `cardPlayed`, `deviceDeployed` (Provisioning Script, Zero-Touch Provisioning), `linkPlaced`, `channelsGained` (Peering Session), `cardExhausted` (Cover Tracks). Pure resolver hooks, printed as labelled forecast terms: `routeTerms` (Carrier Grade), `bandwidthBonus` (Fabric Controller), `switchBonus` (Deep Buffers), `clusterBonus` (Datacenter), `payloadBonus` (Exploit Kit), `firewallBonus` (Defense in Depth), `hardenBonus` (Hardening Guide), `backpressureRatio` (Flow Control; highest wins), `bufferMultiplier` (Deep Queue), `protocolSlots` (Policy Engine), `protocolFired` (Incident Response), `blockCarry` (Persistent State: a cap, highest wins), `missDisruptions` (Obfuscation).

<!-- generated:daemons -->
| Daemon | Card | Cost | Rarity | Face | Upgrade (+) |
| --- | --- | ---: | --- | --- | --- |
| Keepalive | Colorless | 1 | uncommon | Daemon. At the start of your turn, gain 2 block. | Daemon. At the start of your turn, gain 3 block. |
| Peering Session | Architect | 1 | uncommon | Daemon. Whenever you add a channel, gain 3 block. | Daemon. Whenever you add a channel, gain 4 block. |
| Fabric Controller | Architect | 1 | rare | Daemon. Every channel beyond the first deals +2 more. | cost 1 → 0 |
| Deep Buffers | Architect | 1 | uncommon | Daemon. Switches on your primary route deal +2 more. | cost 1 → 0 |
| Carrier Grade | Architect | 1 | rare | Daemon. Your primary route deals +2 per device on it. | cost 1 → 0 |
| Provisioning Script | Architect | 1 | uncommon | Daemon. Whenever you deploy a device, gain 2 block. | Daemon. Whenever you deploy a device, gain 3 block. |
| Zero-Touch Provisioning | Architect | 1 | rare | Daemon. Whenever you deploy a device, draw 1. | cost 1 → 0 |
| Datacenter | Architect | 1 | rare | Daemon. Every cluster deals +3 more. | cost 1 → 0 |
| Defense in Depth | Warden | 2 | rare | Daemon. Each online firewall blocks 1 more per attack. | cost 2 → 1 |
| Hardening Guide | Warden | 1 | uncommon | Daemon. Harden gains 1 more block. | cost 1 → 0 |
| Persistent State | Warden | 2 | rare | Daemon. Up to 2 of your block carries into the next turn. | Daemon. Up to 4 of your block carries into the next turn. |
| Flow Control | Warden | 2 | rare | Daemon. Backpressure stores 150 % of the damage your shield prevents. | cost 2 → 1 |
| Policy Engine | Warden | 1 | uncommon | Daemon. You can arm 1 more protocol. | cost 1 → 0 |
| Incident Response | Warden | 1 | rare | Daemon. Whenever a protocol fires, the hostile that set it off takes 4. | Daemon. Whenever a protocol fires, the hostile that set it off takes 6. |
| Trickle | Ghost | 1 | uncommon | Daemon. At the start of your turn, add 2 to your buffer. | Daemon. At the start of your turn, add 3 to your buffer. |
| Deep Queue | Ghost | 2 | rare | Daemon. Buffering stores ×2.5 instead of ×1.5. | cost 2 → 1 |
| Obfuscation | Ghost | 2 | rare | Daemon. The first jam or cut each enemy phase misses. | cost 2 → 1 |
| Exploit Kit | Ghost | 1 | uncommon | Daemon. Payloads deal +1 more. | Daemon. Payloads deal +2 more. |
| Botnet | Ghost | 1 | uncommon | Daemon. At the start of your turn, add a Payload to your hand. | Daemon. Innate. At the start of your turn, add a Payload to your hand. |
| Cover Tracks | Ghost | 1 | uncommon | Daemon. Whenever a card exhausts, gain 1 block. | Daemon. Whenever a card exhausts, gain 2 block. |
<!-- /generated:daemons -->

**Payload** is the Ghost's token (`payload`, rarity `special`, cost 0): "+`payloadDamage` damage this turn. Exhaust." Fork Bomb, Shell Access and Botnet add Payloads to the hand as encounter-only cards (a full hand sends the rest to the discard pile, where they return with a shuffle); played, each counts in the forecast as "Payload ×N" (Payload+ from Firmware Update deals +1 more), and Exploit Kit adds to each. Payloads are not Volatile.

**Turn effects** (reset every turn, `TurnEffects`): `freeLinks` (Patch Panel; Hot Swap is spent first), `hardwareDiscount` (Rack and Stack), `discounted` (Blueprint, Rapid Redeploy: these hand ids cost 1 less), `freeCards` (Rearm), `misses` and `dodges` (Spoof, Ghost Protocol, labelled by source), `mitm` (Man-in-the-Middle), `payloads` / `payloadDamage`, `cardsPlayed` (the ids in order: Rollback, Side Channel's count). Next-turn gains live in `RunState.nextTurn` (`block`: Brace; `draw`); next-turn energy keeps using `reserveEnergy` (Power Capacitor).

---

## Bands, fields and placement

The table has three bands: **North** `z < −1.3`, **Center** `−1.3 ≤ z ≤ 1.3`, **South** `z > 1.3`. Terminals are fixed at `x = ±5.3`, `z = 0`. The build grid is `|x| ≤ 7.25`, `|z| ≤ 4.7`. Fourteen devices including both terminals fit on the table (racks and phantoms included); device centres must be at least 1.55 apart (`deviceSpacing`) and at least 1.3 (`debrisClearance`) from wreckage or installations. Illegal sockets explain why (`isBlocked`) and cost nothing. The installation cap (4) and the wreck cap (6) are hard limits: with four installations and six wrecks, every terrain layout the generator can produce (every wreck subset, with and without salvage; `src/core/sockets.test.ts`) keeps at least 8 legal auto-deploy sockets; the measured minimum is 27 with engine placement and 15 against a worst-case adversary.

Crowding versus spreading is the band tension (Gwent rows):

- **Cluster**: 3+ online devices in one band (racks count): +2 damage per clustered band.
- **Separated circuits**: two disjoint channels, one with a North router, the other with a South router: +3 shield.
- Corrosion, Null Storm and Ash Moth punish crowded bands; Prism Widow and Ash Moth suppress the band your primary route crosses; installations crowd the busiest band; reach rings punish tight spacing.

| Field | Effect |
| --- | --- |
| Resonance Field | +3 (`resonanceDamage`) when the primary route crosses the band. `alliedFieldTurns` (3) turns. |
| Aegis Field | +3 shield (`aegisShield`) while an online device sits in the band. 3 turns. |
| Null Field | +2 shield (`nullFieldShield`) while any of your hardware occupies the band. 3 turns. |
| Purge Field | Destroy every installation in the band and remove hostile fields (including terrain interference) and jams in it. An Anchor takes the whole purge alone. Draw 1 (2+). Exhaust. |
| Corrosion (hostile) | +2 incoming damage while your hardware occupies the band. |
| Suppression (hostile) | −3 when the primary route crosses the band. |

Each band holds one temporary allied and one temporary hostile field; recasting replaces that side, and a second hostile caster on a band replaces the first. Terrain fields and signal fields keep their own slots. Allied fields affect three transmissions; hostile fields are installed after the action that casts them and affect the next two turns (`hostileFieldTurns`; three from ascension 3; one more at escalation level 2). Fields in a band with an active Anchor do not tick down; when the Anchor dies they resume from their remaining turns. A lethal packet on the caster or Quarantine Rule cancels an incoming field. Dragging a device previews destination band, damage, shield and integrity loss; the drop then asks on the relocation plate before paying the relocation energy.

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
- **Junk** (Packet Loss, Worm) is inserted into the draw pile at seeded positions when the action resolves and never enters the deck; every encounter rebuilds its piles from the deck. Packet Loss is Volatile; each Worm in your hand when you transmit adds `wormDamage` to the enemy phase's first attack (blockable, forecast); pay 1 to delete it.
- **Curses** are the price of deals: unplayable, `curse: true`, permanent until removed. Removal at a Sanctuary or Market ignores the deck floor; a message's Purge removes one (`PURGE_ORDER`), Rogue DHCP transforms one into a common, and The Zombie Farm kills a named one for 3 integrity. Curses cannot be prepared. Their end-of-turn effects are forecast (Backdoor as an unblockable "Backdoor ×N · in hand" term, Bitrot as a wear record); a transmission that ends the battle spares you.

| Curse | Comes from |
| --- | --- |
| CVE | Lean Supply (ascension 2, `knownVulnerability`) · The Unpatched Server |
| Zombie Process | The Zombie Farm |
| Kernel Panic | The Echo Chamber |
| Backdoor | Overvolt (on pickup and after every elite you defeat) · The Quiet Broker |
| Bitrot | The Firmware Mirror |
| Memory Leak | Cold Storage |

<!-- generated:curses -->
| Card | Kind | Cost | Flags | Face | Detail (inspect) |
| --- | --- | ---: | --- | --- | --- |
| CVE | curse | 0 | unplayable | Unplayable. | A permanent vulnerability. Remove it at a Sanctuary or Market, whatever the size of your deck. |
| Zombie Process | curse | 0 | unplayable, innate | Unplayable. Innate. | Innate: it starts every battle in your opening hand and counts toward its draws. Remove it at a Sanctuary or Market, whatever the size of your deck. |
| Kernel Panic | curse | 0 | unplayable | Unplayable. While it is in your hand, you can play at most 3 cards. | Per turn, counting the cards you played before it arrived. Your console, scrubbing, repairs and moving devices are not card plays; deleting a Worm is. Remove it at a Sanctuary or Market, whatever the size of your deck. |
| Backdoor | curse | 0 | unplayable | Unplayable. End of turn in hand: lose 1 integrity. | Unblockable: block and shield never stop it. It resolves with the hostiles' attacks, so a transmission that ends the battle spares you. Remove it at a Sanctuary or Market, whatever the size of your deck. |
| Bitrot | curse | 0 | unplayable | Unplayable. End of turn in hand: the first router on your primary route loses 1 condition. | The router nearest ALPHA wears in the enemy phase, after the installations; at 0 it breaks. A Server Rack's ring takes the wear instead. No primary route: nothing happens. Remove it at a Sanctuary or Market, whatever the size of your deck. |
| Memory Leak | curse | 0 | unplayable | Unplayable. When you draw it, lose 1 energy. | Never below 0. Drawn into your opening hand, it takes the energy from your first turn. Remove it at a Sanctuary or Market, whatever the size of your deck. |
| Packet Loss | junk | 0 | unplayable, volatile | Unplayable. Volatile. Removed after the encounter. | Volatile: if it is still in your hand at the end of your turn, it exhausts. |
| Worm | junk | 1 | — | Pay 1 to delete it. If it is in your hand when you transmit, the enemy phase's first attack deals 2 extra damage. |  |
<!-- /generated:curses -->

---

## Enemies and pressure

### Enemy health

Every room's single-hostile health is a `RULES` formula, read live so the balance probe can `--rule` it (`encounterHealth` in `map.ts`, floors and stages zero-based): normal `normalHealth` [base, per floor, per stage]; elite `eliteHealth`; guardians `guardianHealth` per stage; Signal in the Static `eventHealthScale` × a normal room. A pack shares that health (see [Pack shapes and health](#pack-shapes-and-health)). Ascension multiplies it (Hardened Quarantine: normals × `ascensionNormalHealth` 1.1, elites × `ascensionEliteHealth` 1.15; The Last Signal: guardians × `ascensionGuardianHealth` 1.05). v4 was 16 / 5 / 13, 30 / 2 / 10 and 67 / 96 / 132; the v5 balance pass raised all three above v4 (at the contract's lower starting guesses the bots rarely lost in stages I–II). Patterns repeat in order.

<!-- generated:health -->
| Stage | Normal, floors 1–5 | Elite, floors 4 / 6 | Guardian | Signal in the Static, floors 2 / 5 |
| --- | --- | --- | --- | --- |
| I | 20 / 25 / 30 / 35 / 40 | 47 / 53 | 90 | 35 / 56 |
| II | 36 / 41 / 46 / 51 / 56 | 60 / 66 | 128 | 57 / 78 |
| III | 52 / 57 / 62 / 67 / 72 | 73 / 79 | 176 | 80 / 101 |
<!-- /generated:health -->

**Pressure** is `floor(actions already taken / 3)`. The strikes and breaches of leaders, singles and guardians add pressure plus the stage index (+1 in stage II, +2 in stage III), enrage and escalation level 3 (+1); the attacks of leaders, singles and guardians add Sharper Teeth from stage II (ascension 3, `ascensionAttackBonus` 1, `ascensionAttackFromStage` 1, `ascensionAttackRoles` 1); every hostile's attacks add BGP Hijack (+2) and lose 1 to Ingress Filter. Break thresholds, pressure, escalation and hostile damage are unchanged from v4.

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
| Relay Drone | II, III | STATIC JAB strike 1 | Uplink: while it lives the leader's strikes deal +1 (`uplinkBonus`). | Kill it first; a firewall blocks the uplinked point; the Ghost releases its buffer on it. |
| Ward Node | II, III | SEAL jam | Plating link: while it lives the leader has plating 2 (`wardPlating`), bypassed by an online firewall, on top of its own armor. | A firewall; target the Ward Node first; Spearhead. |
| Tap Spinner | II, III | SPIN A TAP (install) → BARB strike 1 | Web: after it acts it heals 1 per Siphon Tap on the table (`webHeal`). | Scrub, Purge Field, a honeypot's ring; kill it before the third Tap. |
| Glass Echo | II, III | REFRAIN suppression → SHARD strike 1 | Last echo: when it dies the leader's next strike or breach deals +3 (`lastEchoBonus`). | Kill it when the leader's next intent is a fault or field; kill both with overflow; Quarantine Rule. |
| Rigger Drone | III | RIG A SPIKE (install beside the leader's target) → PRY strike 1 | Rigging: while a leader lives its Spikes arrive with integrity 3 (`riggedSpikeIntegrity`). | Kill it before its second Spike; kill the leader and new Spikes arrive at 2; a rack; relocate the neighbour. |

Combined intents (a fault with a field, junk or an installation) are announced together, use the same forecast as resolution, and are all cancelled by a lethal packet on their hostile. Enrage takes effect on the next displayed intent after the threshold is crossed.

### Guardian ultimates and exposed windows

Every guardian follows four normal actions with a **charge** turn, then an **ultimate**; a wounded guardian charges early (see [Guardian charge timing](#guardian-charge-timing)). The charge deals no direct damage and raises the adds; the forecast shows the coming ultimate's damage and the adds' intents. Deal the break threshold (12 / 15 / 18, +4 per living add; ascension 4: +5) in **one transmission on the ultimate turn**, on the guardian's own port, after armor and suppression, to interrupt it: the guardian's attack and its new field are cancelled, existing fields still resolve, the adds still act, and the guardian is **exposed** for one transmission (armor ignored, +3 damage on its port). Interrupting is optional: shields, firewalls, protocols and integrity can absorb the ultimate. Tarpit punishes the charge or ultimate itself. A buffer release counts toward the break. The break meter shows one extra segment per add, lit while the add lives.

---

## Cards

<!-- generated:counts -->
**137 cards**: 60 colorless, 23 / 23 / 23 for the Architect / Warden / Ghost (the Ghost's count includes the Payload token), 6 curses and 2 junk cards. 129 have an upgraded `+` version (every card but curses and junk). 119 can be offered as rewards (never basics, curses, junk or tokens; keeper cards only to their keeper).
<!-- /generated:counts -->

Rarity per keeper is about 1 basic / 7–8 common / 8 uncommon / 6–7 rare. Basic cards form the reliable starter infrastructure and are never offered (Packet Guard and Packet Burst are basics now). Commons are efficient turn tools. Uncommons reward specialization or protect an investment. Rares provide orchestration, burst, daemons or recovery. Legendary Clabernetes is the single exceptionally scarce reward. Rarity never implies unconditional superiority. Every card but curses and junk has a `+` version, shown with a `+` and a gleam; upgrades change cost, numbers or a keyword (Botnet+ is Innate), and the face always states the upgraded rule. Each card is useful in a single-hostile fight without installations.

**Pools.** Colorless cards (no `archetype`) are the shared pool every keeper can be offered; keeper cards are offered only to their keeper, and each keeper has three **build paths**, each with enablers, payoffs and at least one colorless partner (the grouping lives in `src/tutorial/paths.ts`, shared with the Handbook; every keeper card belongs to exactly one path). Mirror Protocol moved to the Architect and Bastion Firewall to the Warden; Store and Forward and Deep Packet Inspection became their keepers' basics.

Card targets: **ground** places hardware (including racks and phantoms; `values.links` auto-cables the device to its nearest devices: Linux Bridge, Standby Router, ACL Gate), **link** connects two devices without an existing cable, **node** upgrades or repairs a valid device, **instant** resolves immediately (Demolition Charge then asks for an installation), **zone** chooses a band, **protocol** arms, **daemon** starts a process, **junk** deletes a Worm. Invalid targets and refused plays spend neither energy nor cards, and every refusal states its reason. Overclock requires an unmodified router, Compression an unamplified switch, Startup Config an unconfigured router, Faraday Shell an unprotected device, Hotfix a worn device, Mesh Weave a device with an unconnected neighbour, Mirror Protocol two or more channels, Flood Fill and Wireshark a live route, Splice and Line Rate a primary route (Line Rate also something on it still to upgrade), Salvage Cycle a discarded link card, Rapid Redeploy a discarded hardware card, Rearm a discarded protocol, Rollback a card played this turn still in the discard pile, Firmware Update an upgradable card in hand, Reflect stored backpressure, Entrench block, Replay Attack, Flush and Exfiltrate a non-empty buffer, Decoy Swarm, Containerlab and Emergency Rebuild a free auto-deploy socket.

The tables below are generated from `CARDS` (face and `+` face as the game prints them; "cost 2 → 1" when only the cost changes).

### Keeper cards

#### The Architect

<!-- generated:architect -->
##### Mesh

Channels and width: every channel beyond the first is another delivery. Standby Router, Branch Line and Patch Panel make channels cheap; Peering Session and Redundant Paths pay block for them; Equal-Cost Multipath, Flood Fill, Mirror Protocol and Fabric Controller cash the width in.

| Card | Cost | Rarity | Target | Face | Upgrade (+) |
| --- | ---: | --- | --- | --- | --- |
| Branch Line | 1 | basic | link | Link two devices. If this adds a channel, draw 1. | Link two devices. If this adds a channel, draw 2. |
| Patch Panel | 1 | common | link | Link two devices. Your next link card this turn costs 0. | Link two devices. Your next link card this turn costs 0. Draw 1. |
| Redundant Paths | 1 | common | instant | Gain 3 block per live channel. | Gain 4 block per live channel. |
| Standby Router | 1 | common | ground · router | Deploy a router linked to its nearest device. | Deploy a router linked to its two nearest devices. |
| Equal-Cost Multipath | 1 | uncommon | instant | +3 damage this turn per live channel. | +4 damage this turn per live channel. |
| Flood Fill | 1 | uncommon | instant | +2 damage to every hostile per live channel this turn. | +3 damage to every hostile per live channel this turn. |
| Mesh Weave | 0 | uncommon | node | Link a device to its two nearest unlinked devices. | Link a device to its three nearest unlinked devices. |
| Mirror Protocol | 1 | uncommon | instant | Needs 2 channels. +2 damage and 2 block per live channel. | Needs 2 channels. +3 damage and 3 block per live channel. |
| Peering Session | 1 | uncommon | daemon | Daemon. Whenever you add a channel, gain 3 block. | Daemon. Whenever you add a channel, gain 4 block. |
| Fabric Controller | 1 | rare | daemon | Daemon. Every channel beyond the first deals +2 more. | cost 1 → 0 |
| Spine-Leaf | 1 | rare | ground · switch | Deploy a switch linked to every router (+1 on your primary route). | cost 1 → 0 |

Colorless partners: Load Balancer (2), Linux Bridge (1), Crosslink (0), Duplex Link (1).

Edge cases (`detail`, shown when the card is inspected):

- **Branch Line**: It draws when the live channel count after the cable is higher than before it.
- **Patch Panel**: The next link card uses it, even one that already costs 0; it lasts until the end of your turn. While Hot Swap's free link is unspent, Hot Swap pays first and this one waits.
- **Redundant Paths**: Counts your live channels when you play it; with no live route it gives nothing.
- **Standby Router**: It links to the nearest devices it is not already cabled to, ALPHA and OMEGA included (distance ties: device ids).
- **Flood Fill**: Needs a live route.
- **Mesh Weave**: Distance ties: device ids.
- **Peering Session**: It pays for every channel added. Any card, console use or relocation of yours that raises your live channel count counts, clearing a jam or a cut too.
- **Fabric Controller**: Each channel beyond the first is a bandwidth delivery of +3; this adds to every one of them. Under Spanning Tree bandwidth gives nothing, and neither does this.

##### Backbone

One long, upgraded primary route that hits harder every turn. Splice lengthens the route, Line Rate upgrades all of it at once; Deep Buffers and Carrier Grade make every device on it count; Trunk Line and Traceroute read it as burst.

| Card | Cost | Rarity | Target | Face | Upgrade (+) |
| --- | ---: | --- | --- | --- | --- |
| Splice | 1 | common | instant | Deploy a switch into the longest cable of your primary route. | cost 1 → 0 |
| Traceroute | 0 | common | instant | Draw 1. +2 damage this turn per switch on your primary route. | Draw 2. +2 damage this turn per switch on your primary route. |
| Trunk Line | 1 | common | instant | +2 damage this turn per device on your primary route. | +2 damage this turn per device on your primary route. Draw 1. |
| Deep Buffers | 1 | uncommon | daemon | Daemon. Switches on your primary route deal +2 more. | cost 1 → 0 |
| Carrier Grade | 1 | rare | daemon | Daemon. Your primary route deals +2 per device on it. | cost 1 → 0 |
| Line Rate | 2 | rare | instant | Overclock every router and compress every switch on your primary route. Exhaust. | cost 2 → 1 |

Colorless partners: Packet Compression (1), Overclock (1), Wireshark (1), Amplified Fiber (1).

Edge cases (`detail`, shown when the card is inspected):

- **Splice**: The cable becomes two cables through a new switch (+1 on your primary route) at the free socket nearest its middle; both keep armor and amplification. Ties: the cable nearest ALPHA.
- **Traceroute**: Counts the switches on your primary route when you play it.
- **Trunk Line**: Counts the devices on your primary route when you play it; ALPHA and OMEGA are not devices.
- **Deep Buffers**: A switch on your primary route deals +1 (compressed +2 more); this adds to each.
- **Carrier Grade**: ALPHA and OMEGA are not devices. Your primary route is still the route that deals the most, this bonus included.
- **Line Rate**: Overclocked routers deal +2 and compressed switches +2 while on your primary route. Needs a router or switch there that is not upgraded yet.

##### Deployment

Hardware tempo: cheap deploys, clusters and device triggers. Rack and Stack, Blueprint and Rapid Redeploy discount hardware; Provisioning Script and Zero-Touch Provisioning pay for every deploy; Datacenter rewards crowded bands.

| Card | Cost | Rarity | Target | Face | Upgrade (+) |
| --- | ---: | --- | --- | --- | --- |
| Blueprint | 1 | common | instant | Draw 2. Hardware drawn this way costs 1 less this turn. | Draw 3. Hardware drawn this way costs 1 less this turn. |
| Rack and Stack | 1 | common | ground · switch | Deploy a switch. Your next hardware card this turn costs 1 less. | cost 1 → 0 |
| Provisioning Script | 1 | uncommon | daemon | Daemon. Whenever you deploy a device, gain 2 block. | Daemon. Whenever you deploy a device, gain 3 block. |
| Rapid Redeploy | 1 | uncommon | instant | Return your last discarded hardware card to hand. It costs 1 less this turn. Exhaust. | Return your last discarded hardware card to hand. It costs 1 less this turn. Draw 1. Exhaust. |
| Datacenter | 1 | rare | daemon | Daemon. Every cluster deals +3 more. | cost 1 → 0 |
| Zero-Touch Provisioning | 1 | rare | daemon | Daemon. Whenever you deploy a device, draw 1. | cost 1 → 0 |

Colorless partners: PoE Injector (2), Cache Server (2), Emergency Rebuild (2), Containerlab (3), Clabernetes (2).

Edge cases (`detail`, shown when the card is inspected):

- **Blueprint**: Hardware cards are the ones that deploy a device.
- **Rack and Stack**: The switch deals +1 on your primary route. Hardware cards are the ones that deploy a device. The next one uses the discount, even one that already costs 0; it lasts until the end of your turn.
- **Provisioning Script**: Every device your cards deploy counts, auto-deployed ones too (Emergency Rebuild, Containerlab, Clabernetes, Splice); salvage does not.
- **Datacenter**: A cluster is a band holding 3 or more online devices (Server Racks count); each deals +2 on your primary route, and this adds to each.
- **Zero-Touch Provisioning**: Every device your cards deploy counts, auto-deployed ones too (Emergency Rebuild, Containerlab, Clabernetes, Splice); salvage does not.
<!-- /generated:architect -->

#### The Warden

<!-- generated:warden -->
##### Fortress

Block that becomes backpressure, and block that stays. Brace, Stand Firm, Pushback and Double Shift raise the wall; Hardening Guide grows every Harden; Persistent State carries part of it into the next turn, Entrench doubles it; Flow Control, Vent and Reflect turn what it stopped into damage.

| Card | Cost | Rarity | Target | Face | Upgrade (+) |
| --- | ---: | --- | --- | --- | --- |
| Brace | 1 | common | instant | Gain 3 block. Next turn, gain 2 block. | Gain 5 block. Next turn, gain 3 block. |
| Double Shift | 1 | common | instant | Harden once, without using your console. Draw 1. | cost 1 → 0 |
| Pushback | 1 | common | instant | Gain 4 block. Add 1 to your backpressure. | Gain 6 block. Add 2 to your backpressure. |
| Stand Firm | 2 | common | instant | Gain 8 block. | Gain 12 block. |
| Vent | 0 | common | instant | Gain block equal to your backpressure. | Gain block equal to your backpressure. Draw 1. |
| Entrench | 2 | uncommon | instant | Double your block. | cost 2 → 1 |
| Hardening Guide | 1 | uncommon | daemon | Daemon. Harden gains 1 more block. | cost 1 → 0 |
| Flow Control | 2 | rare | daemon | Daemon. Backpressure stores 150 % of the damage your shield prevents. | cost 2 → 1 |
| Persistent State | 2 | rare | daemon | Daemon. Up to 2 of your block carries into the next turn. | Daemon. Up to 4 of your block carries into the next turn. |
| Reflect | 1 | rare | instant | Retain. Double your backpressure. Exhaust. | cost 1 → 0 |

Colorless partners: Aegis Protocol (2), Aegis Field (1), Null Field (1), Quorum (1), Duplex Link (1).

Edge cases (`detail`, shown when the card is inspected):

- **Double Shift**: Harden: gain 1 block, +1 per online firewall, and repair your most worn device by 1. Your console stays free this turn.
- **Pushback**: Your next transmission with a live route releases your backpressure.
- **Vent**: Your backpressure stays stored: the next transmission still releases it.
- **Entrench**: Needs block. Shield from fields, Reclaim and firewalls is not block.
- **Hardening Guide**: It raises your Harden console and every Double Shift. Copies stack.
- **Flow Control**: It changes your Backpressure relic's share. More copies add nothing.
- **Persistent State**: Attacks spend your other shield (fields, circuits, Reclaim) before your block; up to this much of what they leave of your block carries into your next turn. More copies add nothing: the highest cap counts.
- **Reflect**: Needs stored backpressure.

##### Firewall wall

Many firewalls online, and cards that pay per firewall. ACL Gate, Stateful, Sentry and Bastion firewalls fill the route; Deep Packet Inspection and Perimeter pay per online firewall; Bulkhead and Defense in Depth make every firewall block more.

| Card | Cost | Rarity | Target | Face | Upgrade (+) |
| --- | ---: | --- | --- | --- | --- |
| Deep Packet Inspection | 1 | basic | instant | Gain 2 block, +1 per online firewall. | Gain 4 block, +2 per online firewall. |
| ACL Gate | 1 | common | ground · firewall | Deploy a firewall linked to its two nearest devices. | Deploy a firewall linked to its two nearest devices. Gain 3 block. |
| Bulkhead | 1 | uncommon | instant | Gain 3 block. This enemy phase, each online firewall blocks 1 more per attack. | Gain 5 block. This enemy phase, each online firewall blocks 1 more per attack. |
| Perimeter | 1 | uncommon | instant | +3 damage this turn per online firewall. | +4 damage this turn per online firewall. |
| Sentry Firewall | 1 | uncommon | ground · firewall | Deploy a firewall whose quarantine deals 2; each installation it destroys gives +2 shield. | Deploy a jam-proof firewall whose quarantine deals 2; each installation it destroys gives +2 shield. |
| Stateful Firewall | 2 | uncommon | ground · firewall | Deploy a firewall that blocks double: 4 of each breach, 2 of each strike. | Deploy a jam-proof firewall that blocks double: 4 of each breach, 2 of each strike. |
| Bastion Firewall | 2 | rare | ground · firewall | Deploy a jam-proof firewall. Gain 6 block. | Deploy a jam-proof firewall. Gain 9 block. |
| Defense in Depth | 2 | rare | daemon | Daemon. Each online firewall blocks 1 more per attack. | cost 2 → 1 |

Colorless partners: Trust Gate (1), Honeypot (1), Server Rack (1), Hardened Router (1).

Edge cases (`detail`, shown when the card is inspected):

- **ACL Gate**: Online, it blocks 2 of each breach and 1 of each strike like any firewall. It links to the nearest device it is not already cabled to (distance ties: device ids).
- **Perimeter**: It counts the firewalls online when you play it. The damage rides your primary route.
- **Sentry Firewall**: Online, it blocks 2 of each breach and 1 of each strike like any firewall; its quarantine deals 2 instead of 1.
- **Defense in Depth**: Attacks are strikes and breaches, from any hostile. Copies stack.

##### Protocols

Armed traps that answer the forecast and hit back. Policy Engine opens more slots and Rearm replays the best protocol; Tripwire and Null Route punish and cancel; Incident Response makes every protocol that fires deal damage.

| Card | Cost | Rarity | Target | Face | Upgrade (+) |
| --- | ---: | --- | --- | --- | --- |
| Tripwire | 1 | common | protocol · strike | Armed. When a hostile strikes: it takes 7. | Armed. When a hostile strikes: it takes 10. |
| Policy Engine | 1 | uncommon | daemon | Daemon. You can arm 1 more protocol. | cost 1 → 0 |
| Rearm | 0 | uncommon | instant | Return your last discarded protocol to hand. It costs 0 this turn. | Return your last discarded protocol to hand. It costs 0 this turn. Draw 1. |
| Incident Response | 1 | rare | daemon | Daemon. Whenever a protocol fires, the hostile that set it off takes 4. | Daemon. Whenever a protocol fires, the hostile that set it off takes 6. |
| Null Route | 2 | rare | protocol · breach | Armed. When a hostile breaches: cancel the breach. | cost 2 → 1 |

Colorless partners: Failover Policy (1), Port Security (1), Rate Limiter (1), IPS Signature (1), Quarantine Rule (1), Tarpit (1).

Edge cases (`detail`, shown when the card is inspected):

- **Tripwire**: It fires in the trap step, before the strike lands: a hostile it kills never acts. Otherwise the strike still lands.
- **Policy Engine**: You arm 2 protocols without it. Copies stack.
- **Rearm**: Fired protocols go to your discard pile. Needs a protocol there.
- **Incident Response**: It strikes in the trap step, before the action lands (a Jammer Port Security answers takes it too). Copies stack.
- **Null Route**: The breach deals 0; its riders (fields, faults, junk, installations) still resolve.
<!-- /generated:warden -->

#### The Ghost

<!-- generated:ghost -->
##### Buffer

Store transmissions, multiply them, release one spike. Store and Forward, Jitter Buffer, Hold Queue and Trickle fill the buffer; Deep Queue multiplies what the console stores; Replay Attack doubles it, Spearhead and Exfiltrate land it through armor; Flush is burst while it waits.

| Card | Cost | Rarity | Target | Face | Upgrade (+) |
| --- | ---: | --- | --- | --- | --- |
| Store and Forward | 1 | basic | instant | Add 4 to your buffer. | Add 6 to your buffer. |
| Flush | 0 | common | instant | Needs a buffer. +3 damage this turn. | Needs a buffer. +5 damage this turn. |
| Hold Queue | 1 | common | instant | Gain 4 block. If you are buffering, add 4 to your buffer. | Gain 6 block. If you are buffering, add 6 to your buffer. |
| Jitter Buffer | 1 | common | instant | Add 3 to your buffer. Draw 1. | Add 5 to your buffer. Draw 1. |
| Spearhead | 1 | uncommon | instant | Your buffer release this turn ignores armor. | cost 1 → 0 |
| Trickle | 1 | uncommon | daemon | Daemon. At the start of your turn, add 2 to your buffer. | Daemon. At the start of your turn, add 3 to your buffer. |
| Deep Queue | 2 | rare | daemon | Daemon. Buffering stores ×2.5 instead of ×1.5. | cost 2 → 1 |
| Exfiltrate | 1 | rare | instant | Retain. Deal your buffer to your target now, ignoring armor. Exhaust. | cost 1 → 0 |
| Replay Attack | 1 | rare | instant | Retain. Double your buffer. Exhaust. | cost 1 → 0 |

Colorless partners: Zero Day (2), Traffic Shaping (0), Deep Scan (1).

Edge cases (`detail`, shown when the card is inspected):

- **Flush**: It does not spend the buffer. On a buffering turn the damage is stored with the rest.
- **Hold Queue**: Buffering: your Buffer console is armed this turn. Arm it before you play this.
- **Spearhead**: Armor and plating: the released buffer lands in full; the rest of the packet still pays them.
- **Trickle**: It fills after the packet-loss check: a turn that starts without a live route still loses the old buffer.
- **Deep Queue**: Copies stack: each running copy raises the multiplier again.
- **Exfiltrate**: Needs a buffer, and empties it. Not a transmission: the surplus overflows as usual, but it never breaks an ultimate.
- **Replay Attack**: Needs a buffer.

##### Evasion

Misses, dodges, phantoms and cut-proof lines. Spoof and Obfuscation make jams and cuts miss; Phantom Node and Decoy Swarm absorb disruption; Dark Fiber lays lines that cannot be cut; Ghost Protocol makes the biggest hit deal 0.

| Card | Cost | Rarity | Target | Face | Upgrade (+) |
| --- | ---: | --- | --- | --- | --- |
| Spoof | 1 | common | instant | Gain 3 block. The next jam or cut this enemy phase misses. | Gain 5 block. The next jam or cut this enemy phase misses. |
| Dark Fiber | 0 | uncommon | link | Link two devices with a cut-proof cable. Exhaust. | Link two devices with a cut-proof cable. Draw 1. Exhaust. |
| Decoy Swarm | 1 | uncommon | instant | Deploy 2 phantoms off every route. Exhaust. | Deploy 3 phantoms off every route. Exhaust. |
| Phantom Node | 0 | uncommon | ground · phantom | Deploy a phantom. It absorbs the next jam, cut, overload or installation. Exhaust. | Deploy a phantom. It absorbs the next two jams, cuts, overloads or installations. Exhaust. |
| Ghost Protocol | 2 | rare | instant | The first strike or breach this enemy phase deals 0. Exhaust. | cost 2 → 1 |
| Obfuscation | 2 | rare | daemon | Daemon. The first jam or cut each enemy phase misses. | cost 2 → 1 |

Colorless partners: Armored Fiber (1), Faraday Shell (1), Failover Policy (1).

Edge cases (`detail`, shown when the card is inspected):

- **Spoof**: A miss answers after your protocols and before a Phantom Node. It never stops an overload or an installation.
- **Dark Fiber**: A cut-proof cable never frays over wreckage either.
- **Decoy Swarm**: They take free sockets on their own. Each absorbs the next jam, cut, overload or installation, then fades. A full table deploys fewer.
- **Phantom Node**: A phantom is never cabled: it sits off every route and fades once spent.
- **Ghost Protocol**: In port order. Its fields, faults, junk and installations still land.
- **Obfuscation**: Copies stack. A miss answers after your protocols and before a Phantom Node; it never stops an overload or an installation.

##### Payloads

Payload tokens, long card chains and exhaust. Fork Bomb, Shell Access and Botnet make Payloads; Exploit Kit makes each hit harder; Side Channel and Man-in-the-Middle pay for every card played; Cover Tracks pays for every card exhausted.

| Card | Cost | Rarity | Target | Face | Upgrade (+) |
| --- | ---: | --- | --- | --- | --- |
| Fork Bomb | 1 | common | instant | Add 2 Payloads to your hand. | Add 3 Payloads to your hand. |
| Shell Access | 1 | common | instant | Gain 4 block. Add a Payload to your hand. | Gain 6 block. Add a Payload to your hand. |
| Side Channel | 1 | common | instant | +1 damage this turn per card you played this turn. | cost 1 → 0 |
| Botnet | 1 | uncommon | daemon | Daemon. At the start of your turn, add a Payload to your hand. | Daemon. Innate. At the start of your turn, add a Payload to your hand. |
| Cover Tracks | 1 | uncommon | daemon | Daemon. Whenever a card exhausts, gain 1 block. | Daemon. Whenever a card exhausts, gain 2 block. |
| Exploit Kit | 1 | uncommon | daemon | Daemon. Payloads deal +1 more. | Daemon. Payloads deal +2 more. |
| Man-in-the-Middle | 1 | rare | instant | This turn, every card you play adds 2 to your buffer. Exhaust. | This turn, every card you play adds 3 to your buffer. Exhaust. |
| Payload | 0 | special | instant | +2 damage this turn. Exhaust. | +3 damage this turn. Exhaust. |

Colorless partners: Crosslink (0), Clab Inspect (0), Ping (0), Hotfix (0).

Edge cases (`detail`, shown when the card is inspected):

- **Fork Bomb**: Payload: +2 damage this turn. Exhaust. A full hand sends the rest to your discard pile.
- **Shell Access**: Payload: +2 damage this turn. Exhaust.
- **Side Channel**: Counts the cards played so far this turn, itself and Payloads included.
- **Botnet**: A full hand sends the Payload to your discard pile.
- **Cover Tracks**: Played Exhaust cards, Payloads, and Volatile cards at the end of your turn.
- **Exploit Kit**: Every Payload played this turn counts, even one played before the Kit started.
- **Man-in-the-Middle**: Counts the cards played after it this turn, Payloads included.
- **Payload**: A token for this encounter only: it never enters your deck.
<!-- /generated:ghost -->

### Colorless cards

<!-- generated:colorless -->
| Card | Cost | Rarity | Target | Face | Upgrade (+) |
| --- | ---: | --- | --- | --- | --- |
| Core Router | 1 | basic | ground · router | Deploy a router. ALPHA → router → OMEGA is a route that deals 5. | Deploy a router. ALPHA → router → OMEGA is a route that deals 5. Gain 3 block. |
| Edge Switch | 0 | basic | ground · switch | Deploy a switch: +1 damage while on your primary route. | Deploy a switch: +1 damage while on your primary route. Gain 3 block. |
| Hot Patch | 1 | basic | instant | Clear every jam and cut. Repair your most worn device by 1. Draw 1. | Clear every jam and cut. Repair your most worn device by 1. Draw 2. |
| Optic Fiber | 1 | basic | link | Link two devices. | Link two devices. Draw 1. |
| Packet Burst | 1 | basic | instant | +3 damage this turn. | +5 damage this turn. |
| Packet Guard | 1 | basic | instant | Gain 3 block. | Gain 5 block. |
| Amplified Fiber | 1 | common | link | Link two devices: +1 damage while on your primary route. | cost 1 → 0 |
| Armored Fiber | 1 | common | link | Link two devices with a cut-proof cable. | cost 1 → 0 |
| Clab Inspect | 0 | common | instant | Draw 2 (1 without a live route). Exhaust. | Draw 3 (2 without a live route). Exhaust. |
| Deep Scan | 1 | common | instant | Draw 3. | Draw 4. |
| Demolition Charge | 1 | common | instant | Destroy an installation. +2 damage to your target this turn. Exhaust. | Destroy an installation. +4 damage to your target this turn. Exhaust. |
| Duplex Link | 1 | common | link | Link two devices. Gain 3 block. | Link two devices. Gain 5 block. |
| Failover Policy | 1 | common | protocol · cut | Armed. When a hostile would cut a cable: cancel its cuts and gain 3 shield. | Armed. When a hostile would cut a cable: cancel its cuts and gain 6 shield. |
| Field Repair | 0 | common | instant | Restore every device to full condition. Gain 2 block. Exhaust. | Restore every device to full condition. Gain 4 block. Draw 1. Exhaust. |
| Honeypot | 1 | common | ground · honeypot | Deploy a decoy. Linked, it draws each jam, cut and overload and hits back for 3. | cost 1 → 0 |
| Hotfix | 0 | common | node | Repair a device by 1. Draw 1. | Repair a device by 2. Draw 1. |
| Link Recovery | 1 | common | instant | Clear every jam and cut. Repair your most worn device by 1. Gain 3 block. | Clear every jam and cut. Repair your most worn device by 1. Gain 6 block. |
| Linux Bridge | 1 | common | ground · switch | Deploy a switch linked to its two nearest devices. | cost 1 → 0 |
| Ping | 0 | common | instant | +1 damage this turn. Draw 1. | +2 damage this turn. Draw 1. |
| Power Capacitor | 0 | common | instant | Gain 3 block. Next turn: +1 energy. Exhaust. | Gain 6 block. Next turn: +1 energy. Exhaust. |
| Purge Field | 0 | common | zone | Cleanse a band: destroy its installations, hostile fields and jams. Draw 1. Exhaust. | Cleanse a band: destroy its installations, hostile fields and jams. Draw 2. Exhaust. |
| Quorum | 1 | common | instant | Gain 3 block, +2 per other hostile. Draw 1. | Gain 5 block, +3 per other hostile. Draw 1. |
| Rate Limiter | 1 | common | protocol · strike | Armed. When a hostile strikes: gain 5 shield against it. | Armed. When a hostile strikes: gain 8 shield against it. |
| Redundant PSU | 1 | common | node | Restore a device fully; its maximum condition is 3 this battle. Gain 2 block. Exhaust. | cost 1 → 0 |
| Resonance Field | 1 | common | zone | Choose a band. For 3 turns, your primary route deals +3 while it crosses it. | cost 1 → 0 |
| Salvage Cycle | 0 | common | instant | Return your 2 most recent link cards from discard to hand. Exhaust. | Return your 3 most recent link cards from discard to hand. Exhaust. |
| Signal Relay | 1 | common | ground · switch | Deploy a jam-proof switch: +1 damage while on your primary route. Draw 1. | cost 1 → 0 |
| Startup Config | 0 | common | node | Configure a router: +1 damage while on your primary route. Exhaust. | Configure a router: +1 damage while on your primary route. Gain 4 block. Exhaust. |
| Traffic Shaping | 0 | common | instant | +2 damage to your target this turn. Draw 1. Exhaust. | +4 damage to your target this turn. Draw 1. Exhaust. |
| Trust Gate | 1 | common | ground · firewall | Deploy a firewall. Online, it blocks 2 of each breach and 1 of each strike. | Deploy a firewall. Online, it blocks 2 of each breach and 1 of each strike. Gain 3 block. |
| Aegis Field | 1 | uncommon | zone | Choose a band. For 3 turns, gain 3 shield each turn while an online device is in it. | cost 1 → 0 |
| Aegis Protocol | 2 | uncommon | instant | Gain 9 block. | Gain 13 block. |
| Broadcast Storm | 1 | uncommon | instant | +2 damage to every hostile this turn. | +3 damage to every hostile this turn. |
| Cache Server | 2 | uncommon | ground · cache | Deploy a cache server. Online: draw 1 more card each turn. | cost 2 → 1 |
| Crosslink | 0 | uncommon | link | Link two devices. Draw 1. Exhaust. | Link two devices. Draw 2. Exhaust. |
| Emergency Rebuild | 2 | uncommon | instant | Deploy a router linked to ALPHA and OMEGA: a new 5-damage route. Exhaust. | cost 2 → 1 |
| Faraday Shell | 1 | uncommon | node | Make a device jam-proof and clear its jam. Exhaust. | cost 1 → 0 |
| Fast Reroute | 0 | uncommon | instant | Clear every jam and cut. Repair your most worn device by 1. Gain 2 block. Draw 1. Exhaust. | Clear every jam and cut. Repair your most worn device by 1. Gain 4 block. Draw 1. Exhaust. |
| Hardened Router | 1 | uncommon | ground · router | Deploy a jam-proof router. Gain 3 block. | Deploy a jam-proof router. Gain 6 block. |
| IPS Signature | 1 | uncommon | protocol · breach | Armed. When a hostile breaches: gain 6 shield against it. | Armed. When a hostile breaches: gain 9 shield against it. |
| Keepalive | 1 | uncommon | daemon | Daemon. At the start of your turn, gain 2 block. | Daemon. At the start of your turn, gain 3 block. |
| Load Balancer | 2 | uncommon | ground · balancer | Deploy a load balancer. Online: +1 damage per live channel. | cost 2 → 1 |
| Null Field | 1 | uncommon | zone | Choose a band. For 3 turns, gain 2 shield each turn while your hardware is in it. | cost 1 → 0 |
| Packet Compression | 1 | uncommon | node | Compress a switch: +2 damage while on your primary route. Exhaust. | cost 1 → 0 |
| Port Security | 1 | uncommon | protocol · jam | Armed. When a hostile would jam: cancel its jams; it takes 4. | Armed. When a hostile would jam: cancel its jams; it takes 7. |
| Quarantine Rule | 1 | uncommon | protocol · field | Armed. When a hostile casts a field: cancel it. | cost 1 → 0 |
| Rollback | 1 | uncommon | instant | Return the last non-Exhaust card you played this turn to your hand. Exhaust. | cost 1 → 0 |
| Server Rack | 1 | uncommon | ground · rack | Deploy a rack: devices within 2.0 pass their wear to it. Gain 3 block. | cost 1 → 0 |
| VXLAN Tunnel | 1 | uncommon | link | Link two devices with a cut-proof cable: +1 damage while on your primary route. | cost 1 → 0 |
| Wireshark | 1 | uncommon | instant | Draw 2. +1 damage this turn per device type on your primary route. Exhaust. | Draw 3. +1 damage this turn per device type on your primary route. Exhaust. |
| Containerlab | 3 | rare | instant | Deploy an overclocked router linked to ALPHA and OMEGA: a new 7-damage route. Exhaust. | cost 3 → 2 |
| Emergency Repair | 2 | rare | instant | Restore 3 integrity. Gain 3 block. Exhaust. | Restore 5 integrity. Gain 5 block. Exhaust. |
| Firmware Update | 1 | rare | instant | Upgrade every card in your hand for this battle. Exhaust. | cost 1 → 0 |
| Overclock | 1 | rare | node | Overclock a router: +2 damage while on your primary route. Exhaust. | cost 1 → 0 |
| Packet Storm | 2 | rare | instant | +5 damage to every hostile this turn. Exhaust. | +7 damage to every hostile this turn. Exhaust. |
| PoE Injector | 2 | rare | ground · power | Deploy a power injector. Online: +1 energy each turn. | cost 2 → 1 |
| Power Surge | 0 | rare | instant | Gain 1 energy. Draw 2. Exhaust. | Gain 2 energy. Draw 2. Exhaust. |
| Tarpit | 1 | rare | protocol · ultimate | Armed. When a guardian charges or unleashes its ultimate: it takes 8. | Armed. When a guardian charges or unleashes its ultimate: it takes 12. |
| Zero Day | 2 | rare | instant | +10 damage this turn. Exhaust. | +14 damage this turn. Exhaust. |
| Clabernetes | 2 | legendary | node | Clone a router with its cables and upgrades. Both become jam-proof. Exhaust. | cost 2 → 1 |


Edge cases (`detail`, shown when the card is inspected):

- **Armored Fiber**: A cut-proof cable never frays over wreckage either.
- **Deep Scan**: Your hand holds at most 10 cards; draws beyond it stay in the draw pile.
- **Demolition Charge**: Playable without an installation on the table: then it only adds the damage.
- **Honeypot**: It works offline while it has a cable, taking one disruption per hostile action (Cable Wraith's cut ignores it). Installations planted within 2.0 of it arrive with 1 less integrity.
- **Hotfix**: Choose a worn device; a repair never lifts it above its maximum condition. Jams stay.
- **Linux Bridge**: It links to the nearest devices it is not already cabled to (distance ties: device ids).
- **Purge Field**: An Anchor takes the whole purge: on an anchored band, Purge Field destroys the Anchor and nothing else; purge again for the fields.
- **Resonance Field**: A band counts once per field: a cast Resonance Field and a Crystal vein on the same band stack.
- **Salvage Cycle**: Playable only with a link card in your discard pile; a full hand takes fewer.
- **Startup Config**: Once per router. It stacks with Overclock.
- **Trust Gate**: Firewalls stack, block attacks from every hostile, and quarantine the nearest installation within reach each enemy phase.
- **Broadcast Storm**: It rides your transmission: every living hostile's packet grows by it, and with no live route it deals nothing.
- **Emergency Rebuild**: The router takes the first free auto-deploy socket; with none, it cannot be played.
- **Faraday Shell**: Jam-proof does not stop an overload. A device that is already jam-proof cannot be chosen.
- **Keepalive**: Every running copy adds its block, after your draw. The block expires after the enemy phase like any other.
- **Packet Compression**: Once per switch.
- **Port Security**: Unfired by the hostiles, it cancels a Jammer's jam later in the phase, and the Jammer takes the damage.
- **Rollback**: It takes the most recent card you played this turn that is still in your discard pile (daemons and armed protocols never are); replaying it costs its energy again. With none, Rollback cannot be played.
- **Server Rack**: Condition 3. Never cabled: it carries no signal and leaves no wreckage. Overloads, Spikes and blasts aimed at a device in its ring wear the rack instead. It counts toward its band's cluster.
- **VXLAN Tunnel**: A cut-proof cable never frays over wreckage either.
- **Wireshark**: Playable only with a live route. Device types: router, switch, firewall, cache, power, balancer, honeypot.
- **Containerlab**: The router takes the first free auto-deploy socket; with none, it cannot be played.
- **Firmware Update**: Each card in your hand becomes its + version until the battle ends; your deck keeps the originals. Curses and upgraded cards stay as they are. With nothing to upgrade, it cannot be played.
- **Overclock**: Once per router. It stacks with Startup Config.
- **Packet Storm**: It rides your transmission: every living hostile's packet grows by it, and with no live route it deals nothing.
- **PoE Injector**: Online at the start of your turn. This energy comes on top of your turn's base and is never capped.
- **Clabernetes**: The replica takes the first free auto-deploy socket; the new disjoint path is instant bandwidth.
<!-- /generated:colorless -->

### Tokens

<!-- generated:tokens -->
| Card | Cost | Rarity | Target | Face | Upgrade (+) |
| --- | ---: | --- | --- | --- | --- |
| Payload | 0 | special | instant | +2 damage this turn. Exhaust. | +3 damage this turn. Exhaust. |


Edge cases (`detail`, shown when the card is inspected):

- **Payload**: A token for this encounter only: it never enters your deck.
<!-- /generated:tokens -->

Clabernetes clones a router with its cables, configuration and overclock into the first free socket; both routers become jam-proof, and the new disjoint path is instant bandwidth. Wireshark counts distinct device roles on the primary route (router, switch, firewall, cache, power, balancer, honeypot) with no cap. Linux Bridge, Standby Router, ACL Gate and Mesh Weave cable to the nearest devices not already connected (distance ties use device IDs). Rapid Redeploy takes the most recently discarded hardware card; its discount is spent by the first matching card played this turn. Crate cards and Recover cards enter the hand for the encounter only, exhaust when played and never enter the deck.

---

## Relics

All relics are unique within a run; offers only contain unowned relics. Starter relics are never offered. Boss relics are strong rule changes with a real drawback and appear only after the stage I and II guardians. **Energy relics are boss tier only**: each gives +1 energy every turn by raising the turn's base, capped by `relicEnergyCap` (two energy relics make the base 5; a third adds nothing; the cap never limits temporary energy). v5 adds three: **Air Gap** (card rewards offer one card fewer), **Legacy Mainframe** (sanctuaries cannot repair; a sanctuary with no other possible service offers Move on) and **Overvolt** (a Backdoor curse on pickup and after every elite you defeat). Hot Swap now makes the first **link card** each turn cost 0 (it was Optic Fiber only). Cold Start (+1 energy on the first turn) and Reserve Cell (carry up to 2) stay common; SDN Controller keeps its rule.

<!-- generated:relics -->
| Relic | Tier | Energy base | Rule |
| --- | --- | --- | --- |
| Backpressure | starter |  | Damage your shield prevents during an enemy action is stored and added to your next transmission. |
| Deep Cache | starter |  | Draw one extra card every turn. |
| Hot Swap | starter |  | The first link card you play each turn costs 0. |
| Bill of Lading | common |  | Crates are never empty (the empty share becomes credits) and undelivered messages offer three choices. |
| Cold Start | common |  | +1 energy on the first turn of each battle. |
| Credit Line | common |  | Gain 15 extra credits after each won battle. |
| Fanout | common |  | Draw 1 extra card at the start of your turn while 3 or more channels are live. |
| Field Engineer | common |  | The first repair each turn costs 0. |
| Grounded Core | common |  | Start every turn with 1 block. |
| Honeynet | common |  | Honeypots deal +2 damage and grant 2 shield whenever they absorb an attack. |
| Ingress Filter | common |  | Every strike and breach against you deals 1 less. |
| Packet Lens | common |  | Switches on your primary route deal +2 each instead of +1. |
| Parallel Core | common |  | Bandwidth gives +4 per channel beyond the first instead of +3. |
| Priority Queue | common |  | Your transmission deals +1 to its target while the target is the hostile with the least remaining health. |
| Reinforced Frame | common |  | Every device you deploy has 1 more condition (3; salvage and crate hardware 2). |
| Repair Drone | common |  | Restore 1 integrity after winning an encounter. |
| Reserve Cell | common |  | Carry up to 2 unspent energy into the next turn. |
| Round Robin | common |  | At the start of each battle every hostile takes 2 damage (reinforcements on arrival). |
| Shield Array | common |  | Prevent up to 2 damage from the first unblocked hit each battle. |
| Spare Parts | common |  | Start every battle with an extra Optic Fiber in hand. |
| Watchdog | common |  | The first time each battle you transmit with no live route, gain 5 shield. |
| Air Gap | boss | +1 | +1 energy every turn. Card rewards offer one card fewer. |
| Anycast | boss | +1 | +1 energy every turn. You cannot place firewalls. |
| BGP Hijack | boss |  | +3 damage every transmission. Enemy strikes and breaches deal +2. |
| Jumbo Frames | boss | +1 | +1 energy every turn. Draw 1 fewer card every turn. |
| Legacy Mainframe | boss | +1 | +1 energy every turn. Sanctuaries cannot repair. |
| Overvolt | boss | +1 | +1 energy every turn. Gain a Backdoor curse now and after every elite you defeat. |
| Scorched Earth | boss |  | Whenever one of your actions or devices destroys an installation, its planter takes 4 (your target if the planter is dead). Your devices deploy with 1 less condition. |
| SDN Controller | boss |  | Patch Cable and Harden can be used twice per turn (Buffer stays once). Start each battle with 1 less energy. |
| Spanning Tree | boss |  | Your primary route's damage is doubled. Bandwidth and Load Balancers give nothing. |
| Storm Control | boss | +1 | +1 energy every turn. Every hostile jam or cut that lands also deals 1 damage to you. |
| Zero Trust | boss |  | Firewalls block double. Cable cards and Patch Cable cost 1 more. |
<!-- /generated:relics -->

Round Robin never ends a fight before it starts: a hostile keeps at least 1. Priority Queue's ties count (any hostile at the least health). Storm Control counts landing jams, cuts and Jammer jams, not decoyed ones. Bill of Lading is worth nothing in fights without escorts or Laden hostiles.

---

## Ascension

Ascension has **four** cumulative levels (§6b of the v5 contract, the user's decision): each level includes every earlier one, and the ten v4 rules fold into them. Win an expedition at ascension N with a keeper to unlock N + 1 for that keeper (stored locally in `faultline-progress-v1`). Call sites never name a level: they ask `ascends(ascension, "sharperTeeth")`, and `ASCENSION_RULES` maps every named rule to the level that brings it, so a rule can move between levels by changing one line. `MAX_ASCENSION` is 4; stored progress outside 0–4 is clamped on read.

<!-- generated:ascension -->
| Level | Name | Rules | Named rules (`ASCENSION_RULES`) |
| ---: | --- | --- | --- |
| 1 | Hardened Quarantine | Normal hostiles have 10% more integrity (every pack member and reinforcement); elites 15% more. | `stubbornSignals`, `hardenedElites` |
| 2 | Lean Supply | Sanctuary repair restores 25% less integrity. Market prices rise 20% and credits earned fall 10%, crates and messages included. Begin with a CVE curse in your deck. | `scarceParts`, `leanMarkets`, `knownVulnerability` |
| 3 | Sharper Teeth | Leaders, singles and guardians' strikes and breaches deal 1 more damage from stage II on. Hostile fields last 3 turns instead of 2. Packs are 15 points more common in every stage. Elites carry a second designation 50% of the time. | `sharperTeeth`, `lingeringCorruption`, `eliteSecondDesignation` |
| 4 | The Last Signal | Stage guardians have 5% more integrity; they enrage at 50% integrity and their ultimates deal 2 more damage. Each living add raises the break by 5 instead of 4. Close the Gates and Stolen Voice also wear their target by 1. Every guardian's charge also plants a Breaker Charge beside your primary router. Normal hostiles may carry a second designation. Begin with 2 less maximum integrity. | `ancientGuardians`, `lastSignal`, `wornBackbone` |

| `RULES` key | Level | Value | Meaning |
| --- | ---: | ---: | --- |
| `ascensionNormalHealth` | 1 | 1.1 | Normal hostiles' integrity multiple |
| `ascensionEliteHealth` | 1 | 1.15 | Elites' integrity multiple |
| `ascensionRepair` | 2 | 0.75 | Sanctuary repair multiple |
| `ascensionPrices` | 2 | 1.2 | Market price multiple |
| `ascensionCredits` | 2 | 0.9 | Credits earned multiple (crates and messages included) |
| `ascensionAttackBonus` | 3 | 1 | Extra damage on hostile strikes and breaches |
| `ascensionAttackFromStage` | 3 | 1 | …from this zero-based stage on |
| `ascensionAttackRoles` | 3 | 1 | …for every hostile (0) or leaders, singles and guardians only (1) |
| `ascensionFieldTurns` | 3 | 1 | Hostile fields last this many turns more |
| `packRateAscensionBonus` | 3 | 0.15 | Added to every stage's pack rate |
| `eliteSecondDesignation` | 3 | 0.5 | Chance an elite carries a second designation |
| `ascensionInstallationIntegrity` | 3 | 0 | Extra integrity every installation arrives with |
| `ascensionGuardianHealth` | 4 | 1.05 | Guardians' integrity multiple |
| `ascensionAddHealth` | 4 | 1 | Guardian adds' integrity multiple |
| `ascensionUltimateBonus` | 4 | 2 | Extra damage on guardian ultimates |
| `ascensionEnrageThreshold` | 4 | 0.5 | Share of integrity at which guardians enrage |
| `addBreakBonusLate` | 4 | 5 | Break threshold per living add (instead of `addBreakBonus`) |
| `ascensionRiderWear` | 4 | 1 | Wear Close the Gates and Stolen Voice add |
| `ascensionChargeBreaker` | 4 | 1 | Breaker Charges a guardian's charge plants beside your primary router |
| `normalSecondDesignation` | 4 | 0.5 | Share of a normal room's designation chance that rolls a second |
| `ascensionIntegrityLoss` | 4 | 2 | Maximum integrity lost at the start |
<!-- /generated:ascension -->

Every rider is a `RULES` key, read live (the balance probe can `--rule` it), and `ascension.ts` builds the level texts above from them, so the table cannot drift from the numbers. The v5 balance follow-up turned the hard-coded riders into keys (`ascensionNormalHealth`, `ascensionEliteHealth`, `ascensionRepair`, `ascensionPrices`, `ascensionCredits`, `ascensionAttackBonus`, `ascensionAttackFromStage`, `ascensionAttackRoles`, `ascensionFieldTurns`, `ascensionGuardianHealth`, `ascensionUltimateBonus`, `ascensionEnrageThreshold`, `ascensionIntegrityLoss`) and tuned levels 3 and 4 only, so ascension 0–2 did not move: Sharper Teeth's +1 now reaches leaders, singles and guardians from stage II (it was every hostile in every stage), The Last Signal's guardians gain 5 % integrity (was 15 %) and no longer enrage earlier (50 %, was 60 %). The v4 riders keep their v4 tuning: the adds gain nothing (`ascensionAddHealth` 1) while the Close the Gates / Stolen Voice wear stays (`ascensionRiderWear` 1); the second elite designation rolls at 50 % (`eliteSecondDesignation`); the old level 9's extra installation integrity is 0 (`ascensionInstallationIntegrity`); the second normal designation rolls at half the room's chance (`normalSecondDesignation`), and the guardian charge's Breaker Charge stays (`ascensionChargeBreaker` 1): it ticks on the ultimate turn and detonates in the phase after it unless it is scrubbed, purged or quarantined first. Hardened Quarantine reaches every pack member and reinforcement.

---

## Save compatibility and deterministic behaviour

Expeditions save as **version 5** (`EXPEDITION_VERSION`, still under the `faultline-expedition-v2` storage key). There is **no compatibility** (the user's decision: no players yet): a save from any other version, v4 included, is simply not loaded, and the title screen offers a new expedition; the v3 → v4 migration was removed. Local run records (`faultline-records-v2`) keep their format; stored ascension progress (`faultline-progress-v1`) is clamped to 0–4 on read.

Validation covers every field: archetype and ascension, credits and removals, shop offers and prices, event state and picks, protocols (≤ 8, the save cap for Policy Engine slots), running daemons (daemon cards only), next-turn gains (`nextTurn.block`, `nextTurn.draw`), this turn's effects (free links, discounts, misses, dodges, Man-in-the-Middle, Payloads, the cards played), console uses (≤ 2), buffer and backpressure, field slots (one allied, one hostile, one terrain and one signal field per band), the chart (19 rooms, exits, packs of escorts, 1–2 designations, hidden and reinforced flags), piles, relics and topology references; hostiles (0–3, 1–3 in battle, distinct ports and uids, at most one leader or single, roles matching their definitions, cadence, designations, crates, guardian step state); installations (≤ 4, valid kinds, integrity 1–3, countdown 1–2 on Breaker Charges only, points inside the grid); device condition (0 to its maximum, maximum ≤ 4), phantom charges and deploying cards; faults naming existing devices; the target a port or none (per-channel `aims` from older saves are dropped, not validated); wrecks (≤ 6, inside the grid); the reinforcement (an escort, count −1 to 3, health, crate); the signal; offers (≤ 8, two named cards or 1–3 message options); encounter cards and the credit ledger. Invalid values reject the save.

Maps (packs, designations, hidden flags and reinforced elites included) derive from seed + stage; encounter plans (health, crates, reinforcements, signals, message options, salvage roles) from seed + stage + room; terrain from seed + stage + room; all use local generators. Card draws, rewards, market stock, events and junk positions use the expedition RNG. Daily seeds derive from the UTC date; identical seed, archetype, ascension and decisions repeat the expedition. There is no remote leaderboard.

---

## Presentation, learning and feedback contract

- **Every number has a cause.** Every number the interface shows comes from `combatPreview`, the same pure forecast that `endTurn` resolves; an element may summarise, but it never hides a number that resolution uses. The battle HUD shows signal damage, shield, burst, routes and channels ("4 routes · 3 channels", one diamond per channel colour, the shared devices named in its tooltip) and bandwidth, online and offline devices, clusters on the band seals (with an installation count and an anchor glyph for a pinned field), the Ghost buffer (stored, gain, packet-loss risk), the Warden's stored backpressure, the console command (cost, uses, Buffer state), armed protocols with "will trigger" highlights, trap damage, installations, wear and junk in the intent panel, and next turn's energy and draw.
- **Energy and the next turn (v5).** The energy orb reads `current / base`, the base being `turnEnergyBase`; energy above the base glows with a lit rise marker (`+N`), and the tooltip names the base, each energy relic (and the cap), PoE Injectors online and next turn's parts. The **Next** chip shows next turn's energy, cards and block, each with a rise marker when above normal; its tooltip splits them (next-turn energy, Reserve Cell, injectors, next-turn draw, Cache Servers and Fanout, next-turn block, block carried, Grounded Core).
- **Cards (v5).** Three separate channels on every card, in every view: the **frame** shows the owner (Architect teal-cyan, Warden warm amber, Ghost pale violet with a teal inner edge, colorless brass; no keeper sigils on cards), the **footer gem** the rarity, the **nameplate** the kind (teal for protocols, violet for daemons). The type line carries the kind word and **keyword markers** (Retain, Innate, Volatile, Exhaust, Armed, Token) with glossary tooltips, read from the flags. A **modified cost** lights the cost gem (teal down, red up) over the struck printed cost, the tooltip naming the cause. **Curses** look cold (frost rim, desaturated art); **Payload tokens** look temporary (stitched etch, translucent picture, "Token" footer); **Kernel Panic** stamps "N plays left" over its art. A missing painting falls back to a plate in the owner's colour with the card's kind engraved. Inspect adds glossary rows and the card's `detail`.
- **Daemon strip (v5).** The running daemons form the last column of the field-seal band, directly above the protocol dock (it takes no space while none runs): each is a plate with a turning cog, its name, `×N` and its effect line (full plates for up to 2, half plates for 3–4, name tokens for 5 or more), a button that Tab reaches and right-click inspects. The forecast names evasions ("0 · dodged", "misses · Spoof", "cancelled · Null Route"), protocol retaliation ("Tripwire + Incident Response 3"), curses in hand (cold lines under the survival forecast: "Backdoor −1 integrity", "Bitrot wears ROUTER1") and block carried; Details adds a Running Daemons ledger and marks daemon terms with a violet bead.
- **The far rail.** Up to three hostiles stand at the rail as whole **portraits** in the band above the table, the leader at the centre and tallest (a guardian taller still), escorts and adds to either side at most 0.8 and 0.72 of its height; nothing is ever drawn over a portrait. The rail is laid out in screen space for the resting camera: each sprite is sized so its painted body fills the room above its plate, clear of the header's items (a portrait under one may lean in over its plate, and the whole rail may slide a little off centre to let it stand taller), and a lunge, rear or swell lifts the body rather than letting its foot sink onto the plate. Under each portrait hangs one engraved brass **plate** (`#intent-layer`, placed every frame from the 3D rail, for one hostile or three): its **next move** (`.hostile-intent[data-port]`, the part lessons spotlight) with a big glyph, the number after every term (strike and breach) and a short verb in the move's colour (STRIKE 7, BREACH 5, JAM ROUTER1, CUT ROUTER1 ↔ SWITCH1, CORRODE NORTH, PLANT JAMMER · NORTH, OVERLOAD, CHARGE · ultimate next turn, the ultimate's own name) with its target and riders on one line (a field beside a fault, extra plantings, junk, healing), a leader's three escalation pips, RESTS · acts next phase for a dormant escort, FALLS THIS TURN (struck through in gold), FALLS · ACTS ANYWAY for a Spiteful hostile and BROKEN for an interrupted ultimate; then its **health bar** in the hostile's colour with its name and integrity engraved in it, the forecast loss as the striped band and the loss beside it (−10), or LETHAL in gold. A dashed ARRIVES plate holds a port an announced reinforcement will take. The plates stay while the enemy phase plays out: health drops as packets land, the moves still to come rest dim, the hostile acting now is lit, and a falling hostile's plate leaves as it starts to fall. The **target** (the focus) wears a lit brass rim, brass corner brackets and the crest jewel on its plate's crown; a click on a hostile's portrait, plate or port row targets it. Far-row device nameplates, their junction seals and installation tags that would rise into the plates hang at their device's foot instead. Hovering a hostile (portrait or plate) opens its card: the full forecast sentences, designations and rules, riders, shield terms, escalation, health now → after the transmission, and the channels and overflow that land on it. Hostiles still read as sprites with rim lighting, embers, anticipation and lunges; guardians are larger with a presence seal.
- **The port strip and the transmission line.** With two or more hostiles, the right plate gains a **port strip**: one row per port in phase order, with health, intent and the states (acting, "rests", "falls", "broken"); the whole row targets its hostile, the target's row carries a lit brass rim and the crest, and hovering a row opens that hostile's card. Under the target's medallion, the **Transmission** line adds up what lands: one chip per live channel in its channel's colour (a hexagon for the primary delivery, a diamond for bandwidth) with its amount, joined by +, then the target's bonus and its armor (paid once, a steel shield), then "= packet" (gold when lethal); a second line names the overflow ("overflow 3 → CENTRE"). Hovering a chip opens that channel's card (its terms, its route and the packet it joins). There is nothing to pick up or aim: every channel lands on the target. The transmit dial adds "overflow → CENTRE" when the surplus flows on. On the table the channels' packets fly along their cables in their colours and cross to the target when you transmit; the overflow leaps on to its port.
- **Intent panel.** The selected port's medallion adds install and overload kinds; an escalation gauge of three diamonds sits beside the pressure warning and names the next level two actions ahead; designation ribbons (coral for bad, teal for good, a static pattern for UNKNOWN until the entrance) sit under the hostile's name with the rule on hover; extras list installs, wear, crates and a named signal; the guardian window reads "12 / 20 damage · +4 per living add" with one break segment per add; a Spiteful port keeps its intent under LETHAL with "acts anyway".
- **The table front.** Installations are Blender bodies in their planter's colour (Tap magenta, Jammer cold blue, Spike rust, Anchor violet, Breaker Charge ember) with integrity pips on their tags ("JAMMER ◆◆"), a dashed reach ring on hover, a countdown numeral and blast ring on a Breaker Charge, an anchor tether to its band's seal, and a ghost beam with the kind's glyph at the forecast socket. Device nameplates carry condition pips; a worn device's rim turns the fray colour and sparks; a breakdown leaves a fresh wreck tinted in the device's colour.
- **Channels on the table.** Every delivering channel has its own colour (`src/channel-palette.ts`: gold for the primary, then cyan, green, blue, silver, rose), on its cables' sheath, haze and beads, on its devices' skirts, on the ledger chip's diamonds and on its delivery; a cable on a live route outside the channel set stays a dim neutral. An amplified cable is wound with violet fibre whichever channel carries it (a compressed switch's amplifier ring is the same violet). A device where routes merge wears a brass **junction seal** on its nameplate: the merge glyph and the number of routes through it.
- **Hover cards.** Resting the pointer on a device, cable or installation shows one engraved plate beside it, read from the forecast: a device's name, id, band, online state (and why it is offline), condition pips, what it does now (route terms, firewall block and quarantine, draws, energy, balancer, decoys, shelter, absorbs), its channel with its colour, the shared explanation, forecast threats and upgrades; a cable's ends, channel, amplified fibre, armor, fraying and forecast cuts; an installation's integrity, next effect and scrub cost. ALPHA and OMEGA show the route and channel count. Crates drop from a dead escort's port and open with a toast ("Crate · +5 credits"); a message fragment rises over the fallen port before its dialog opens.
- **Repair and scrub plates.** Clicking a device opens its plate in the target dock with condition pips and a **Repair** button (disabled with the reason when energy is short or the device is intact); clicking an installation opens a sibling plate with kind, pips, its next effect and a **Scrub** button ("Scrub · 1 energy · ◆◆ → ◆◇"). Ledger tags list every installation and every worn device ("Worn · R1 ◆◇ · Repair 1"). All three surfaces use the same actions, so undo and the cues work alike. Demolition Charge lights the installations as targets.
- **Keys.** 1–0 play cards, C console, P prepare, Z undo, Space/Enter transmit, Esc cancel, I inspect (all unchanged; while the relocation plate asks, Enter relocates and Esc or Z cancels); **F** cycles the target through living ports; **R** repairs the selected device, or the most worn one; **S** scrubs the selected installation one point, or the one the forecast names most dangerous (a charge, then a Jammer, a Spike, an Anchor, a Tap), with a toast naming it and Z to undo. Installations and devices are also reachable through the Devices journal, which lists them as tiles with the same Repair and Scrub buttons, so keyboard-only play never needs the canvas; every new button carries an aria-label that states its number.
- **Message dialog.** A message opens the journal dialog "An Undelivered Message" with its sender line and archive fragment, and two (three with Bill of Lading) choice rows with their exact effect; keys 1–3 choose; there is no close stud. A crate card opens "A Crate Opens" with two named cards. Further offers follow in order.
- **Details dialog.** Deliveries (one trace per channel with its port and amount, per-port totals with armor and lethal marks, overflow), Defenses (each attack in port order against the shared pool, with per-attack firewall and protocol terms), The Table Front (every installation with pips and next effect, every worn device with its repair cost, each firewall's quarantine target), and a five-step sequence: your signal per port · traps and quarantine · hostiles act in port order · installations act · recharge and draw. Nothing in it is computed in the dialog.
- **Route chart, entrance and reward.** Pack ordinals (×2, ×3), designation diamonds and the UNKNOWN glyph with the map legend; the encounter title card adds the revealed designation and the reinforcement warning ("SIGNAL DETECTED · a Splicer arrives in 2 actions"), also logged; the guardian intro adds the adds and the threshold. The reward screen itemises credits and names the pack ("Static Nest and escort silenced").
- **Reduced motion and fast mode.** Arrivals and crates appear in place with one pulse and the toast; the countdown changes without a pulse; the designation reveal swaps text and plays its cue; the target reticle rests; worn devices keep the rim colour without sparks; fast mode combines per-port impacts with stacked numbers.
- **Field Training** (`src/tutorial.ts`, `src/tutorial/lessons.ts`): a lesson menu of 14 entries in 12 chapters, every lesson turn at an expedition turn's energy (`baseEnergy`; Clear the Ground's first turn fits two scrubs and a repair) (13 short, hand-built practice battles and an illustrated expedition walkthrough), played through the real rules with hard rails (only the current step's action is playable; everything else is blocked and parked, with a spotlight on the one control): The First Signal; Read the Enemy; When the Line Is Cut (rerouting, bandwidth); Online Devices; Hold the Ground (bands and fields); Traps & Decoys; three console lessons (Architect, Warden, Ghost); Danger & Guardians (charge, ultimate, Siphon Taps, junk, Prepare); the expedition walkthrough; and three v4 drills: **Choose the Target** (a full rail of three hostiles, one idea per step: read each port's next move, click the Relay Drone to target it so every channel lands there, transmit and watch the surplus of the kill overflow into the leader, then retarget the Spark Mite that bites next and overflow again; the lesson id stays `aim-signal` so stored completion survives), **Clear the Ground** (scrub a Jammer twice, repair a worn router, Purge Field the band where the next Jammer lands) and **The Crown and Its Wardens** (read the break meter, target the left Gate Warden on the charge turn so it falls and its surplus overflows into the Regent, prepare Packet Burst, break Crownfall). The rails cover the target, repair and scrub like any card; the drills follow the board, so Z reopens a step. A reading step is met by Got it or a click on its spotlit control, which then does nothing else. When the last goal is met the lesson is over: the board freezes (no card, console, device, target, relocation, transmission or shortcut plays), and a beat later, once the final transmission or card has landed, a completion plate shows the steps and the takeaway with Next lesson, Replay (a fresh board) and Training menu (which leaves the lesson). The expedition guide ends the same way. Completion is stored in `faultline-training-v1`. Lesson runs never touch the saved expedition. Tests play every lesson to completion. v5 at three energy: The First Signal teaches that a route (a router and two links, 3 energy) is a whole turn; When the Line Is Cut spends that turn on the second channel, lets the cut land on one channel and patches it next turn (Failover Policy is the optional step only when a turn can afford it, otherwise it is named for a quieter turn); Online Devices wires two dark devices already on the table, the Trust Gate on turn one and the Cache Server on turn two; every coach text reads its costs and numbers from `CARDS` and `RULES`.
- **Handbook** (`src/tutorial/handbook.ts`): 17 illustrated chapters (first turn, with the three-energy turn, where energy comes from and the twelve-card starter; routes and channels; online devices; intents and shield; bands and fields; rerouting; protocols and console; **Keywords & Daemons**, the cards' own glossary from `KEYWORDS` in `src/card-marks.ts` and every daemon with its running effect; **Packs & Ports**; **The Table Front**; **Escalation & Designations**; **Crates, Messages & Signals**; the three keepers with their starters and **three build paths each** from `src/tutorial/paths.ts`; a Danger Playbook with a Breaker Charge beside your router, a Jammer you cannot reach, a Spiteful hostile at lethal and a curse in hand; guardians; **Cards & Curses**, with every curse, its fine print and where it comes from; the expedition, with the v5 reward odds, the market's slots, the energy boss relics and the four ascension levels). Every number is read from `RULES`, `CARDS`, `RELICS`, `ENEMIES`, `DESIGNATIONS`, `SIGNALS`, `CONSOLES`, `EVENTS`, the ascension levels and market constants.
- **Screens** (`src/screens.ts`): title (continue with ascension, Field Training, Handbook), archetype select with console, engine, a "Starting deck · 12 cards" row (signatures lit) and an ascension ladder of five rungs (0 Standard and the four named levels, each rung's rules in its tooltip), the archive sectioned by owner (the three keepers, Colorless, Curses, Junk & Tokens), market shelf labels (Bench, Colorless, the keeper), an Air Gap plate where the missing reward card would be, a Legacy Mainframe sanctuary that greys Repair with the reason, route chart with packs, ribbons, market and event rooms, reward (itemised credits, upgraded cards), relic (boss relics show the drawback in red, v4 relics have their own glyphs), sanctuary with a deck picker showing upgrade before → after, market, illustrated events, outcome with ascension unlocks.
- **Audio cue contract** (`src/audio-effects.ts`, 58 cues, 98 stereo masters from six CC0 Kenney packs, loudness-matched by tier). One cue per moment: `pickup` when a card is lifted (never a shuffle), `undo` on cancel/undo, card plays sound by effect (`deploy`, `connect`, `protocol`, `field`, `cleanse`, `block`, `instant`), `route` when a route or extra channel comes online, `move` on relocation, `console`, `scrub`, `transmit` on launch, `buffer`/`release` for the Ghost, `trigger` for protocols and honeypots, `hit` on packet arrival, enemy action cues on the contact frame, `malware` when a Siphon Tap is planted and `junk` from the turn result, `deal` for the new hand and `shuffle` **only** when the discard pile is actually reshuffled, `navigate` then `turn`/`event`/`coins` when a room is chosen, `coins` for purchases, `upgrade` for upgrades, `reward` for rewards. v4 adds `arrive` (an escort, reinforcement or add takes a port), `dormant`, `aim` (the target changed), `install` (Jammer, Spike, Anchor, Breaker Charge), `wear`, `breakdown`, `repair`, `quarantine`, `detonate`, `crate` (its master chosen by contents), `message` (a fragment drops, and again when the choice resolves), `reveal` (a hidden designation), `warning` (a reinforcement announced) and `signal`. Hover sounds only on meaningful controls, including port rows and the rail's plates.

---

## Strategies and balance intent

Three energy makes every turn a budget: a new route is a whole turn, a two-cost card is two thirds of one, and a daemon trades this turn's tempo for every later turn. Small starters (twelve cards) and removals down to eight keep the deck's best cards coming; the reward odds make commons the backbone and rares an event. Each keeper has three build paths; a path is a plan, not a lock, and every path borrows from the colorless pool.

**Architect.**
- **Mesh** — build a second and third disjoint channel early (Standby Router, Branch Line, Patch Panel and Hot Swap make links cheap); place routers North and South for separated-circuit shield or crowd a band for a cluster; Load Balancers, Parallel Core and Fabric Controller scale the payoff; Equal-Cost Multipath, Mirror Protocol, Flood Fill and Redundant Paths cash it in. Width is destinations: finish an escort and press the leader in the same turn. Peering Session pays block for every channel added.
- **Backbone** — one long primary route, upgraded: Splice lengthens it, Line Rate overclocks and compresses all of it, Deep Buffers and Carrier Grade make every device on it count, Trunk Line and Traceroute read it as burst; Packet Compression, Overclock, Amplified Fiber and Wireshark are its partners.
- **Deployment** — hardware tempo: Rack and Stack, Blueprint and Rapid Redeploy discount the next device; Provisioning Script and Zero-Touch Provisioning pay block and cards for every deploy; Datacenter rewards crowded bands. PoE Injectors, Cache Servers, Emergency Rebuild, Containerlab and Clabernetes are its partners.
- Cost: more exposed cables, more devices inside reach rings, Weaver's tension trap and corrosion on crowded bands.

**Warden.**
- **Fortress** — Harden (Hardening Guide adds to it) and block exactly what the intents need; every prevented point returns as backpressure, in full on every attacker. Brace, Stand Firm and Pushback raise the wall, Persistent State carries a little of it (up to 2, upgraded 4), Entrench doubles it, Flow Control stores 150 % of what it stopped and Vent and Reflect cash it in.
- **Firewall wall** — keep many firewalls online on any live route (ACL Gate, Stateful, Sentry, Bastion, the colorless Trust Gate); Deep Packet Inspection and Perimeter pay per online firewall; Bulkhead and Defense in Depth make each block more. Firewalls also quarantine installations for free, and Sentry Firewall doubles it.
- **Protocols** — answer the forecast in advance: Tripwire hurts strikers, Null Route cancels a breach (an ultimate's too), Policy Engine opens slots, Rearm replays the best protocol for free, Incident Response makes every firing hurt.
- Cost: the shield pool is shared, two breaches drain it faster than one, and backpressure needs the enemy to attack.

**Ghost.**
- **Buffer** — protect the line (Failover Policy, Dark Fiber, a second channel, Phantom Node), buffer on turns where no intent can break every route, then release one targeted spike: delete the escort whose death matters, or hold it for a guardian's ultimate turn and break through both adds. Store and Forward, Jitter Buffer, Hold Queue and Trickle fill it; Deep Queue and Replay Attack multiply it; Spearhead and Exfiltrate land it through armor.
- **Evasion** — make the enemy phase miss: Spoof and Obfuscation take jams and cuts, Phantom Node and Decoy Swarm absorb disruption and installations, Ghost Protocol makes the heaviest hit deal 0, Dark Fiber and Armored Fiber cannot be cut. Its value depends on the enemy mix (misses never stop overloads or installations; dodges cover strikes and breaches only).
- **Payloads** — long, cheap turns: Fork Bomb, Shell Access and Botnet make Payload tokens, Exploit Kit makes each hit harder, Side Channel and Man-in-the-Middle pay for every card played, Cover Tracks for every card exhausted; Ping, Hotfix, Crosslink and Clab Inspect keep the chain going.
- Cost: buffered turns deal nothing, so Packet Leech and Hungry hostiles heal, Tap Spinner and Static Nest keep what they heal, and every escort gets a free action; a cut or a breakdown on your only route loses everything. Kernel Panic punishes the Payload chain hardest.

**All keepers — the charge turn.** Kill the adds now (spread), brace (block, firewalls, protocols, then repair the wear), or break at +4 per add. Each keeper has one natural line and can borrow the others with cards.

**Energy devices.** PoE Injector (rare, 2) is a legitimate build: every injector online adds 1 energy on top of the turn base, uncapped. In 3.5–6-turn fights it rarely pays back its 2 energy and two cables (see [Balance evidence (v5)](#balance-evidence-v5)); cost 1 is the lever if it should.

No build requires a specific rare; Containerlab and Clabernetes are optional discoveries. Honeypots, protocols, fields, racks and firewall placement give every keeper answers to disruption and to the table front. Persistent structures give each turn a changing context; exhausted orchestration prevents rebuilding a board every shuffle; fourteen sockets, four installations, three energy and enemy disruption, not artificial caps, bound the ceiling. Every new threat has at least two answers from different pools, one of them in the shared starter deck or a starter console.

Intended arc of a pack fight: turn one reads up to three intents and builds the classic route; from turn two the forecast shows the target, what every channel adds to its packet and the first installation; around turn three a kill first overflows into the next body, the first escort dies and its crate opens; then escalation and arrivals push the enemy phase back up around turn four or five, the intended kill window.

---

## Balance evidence (v5)

`npm run balance -- <seeds> [--ascension=N] [--archetype=..] [--policy=..] [--path=..] [--ban=..] [--start=..] [--card=id.key:value] [--rule=key:value,…] [--summary]` plays complete three-stage expeditions with deterministic bots. The v5 tactical line (`scripts/bot.ts`) keeps the v4 opener, maintenance, targeting and guardian windows and adds a generic plan evaluator: every affordable card, console use and relocation is played on a copy of the run and scored from `combatPreview` (this turn's outlook, damage stored for later, what lasts from a next-turn forecast weighted by the expected remaining turns, one-shot next-turn gains, cards gained, a per-turn estimate for each daemon, protocols armed for a later intent); the best affordable set is chosen by a knapsack over energy and the Kernel Panic play limit. `scripts/bot-meta.ts` drafts with per-keeper priorities (or a path's cards with `--path=`), ranks the energy boss relics by their drawbacks, removes curses first and trims basics from 15 cards on. New metrics: deck size at a win, PoE Injectors per fight and the win rate of runs by devices online, daemons started, and per-card and per-relic run counts and win rates. The record is [balance-v5.json](balance-v5.json).

The user time-boxed the pass: **300 seeds per keeper at ascension 0, 150 at ascension 2 and 4, per path and for the energy devices** (the protocol asked for 600 / 300 / 600). A 300-seed win rate moves about ±2.8 points (one sigma), a 150-seed one about ±4. The bots are regression probes: their draft decides more than any number (smarter default priorities alone raised every keeper by 12–25 points), so human difficulty will depend on draft skill.

### Results against the targets

| Metric | Target | Architect | Warden | Ghost | Met |
| --- | --- | ---: | ---: | ---: | --- |
| Tactical wins, ascension 0 (300 seeds) | 32–42 %, spread ≤ 8 | 37 % | 42 % | 39 % | Yes (spread 5); the Warden at the edge, 37 % at 150 seeds after the Persistent State cap |
| Tactical wins, ascension 2 (150 seeds) | 16–26 % | 25 % | 21 % | 23 % | Yes |
| Tactical wins, ascension 4 (150 seeds, final riders) | 5–12 % | 9 % | **4 %** | 11 % | Architect and Ghost; the Warden 1 point under (not iterated further, the user's call) |
| Turns per normal / elite / guardian fight (A0) | 3.5–5 / 5–7 / 7–10 | 4.7 / 5.9 / 8.1 | **6.2 / 8.0 / 12.2** | 4.6 / 6.0 / 8.3 | Architect and Ghost; **not the Warden** |
| Ultimate turn reached (A0) | ≥ 70 % | 91 % | 97 % | 92 % | Yes |
| Interrupts (A0) | pooled 35–70 % | 84 % | 16 % | 95 % | Yes, pooled 57 %: the Architect and Ghost break, the Warden braces |
| Deck size at a win (A0) | 20–32 | 26 (23–31) | 26 (21–29) | 26 (21–30) | Yes |
| Energy devices | runs with 2+ PoE Injectors per fight ≤ 1.3 × keeper | no run | no run | no run | Holds only trivially (below) |

**Build paths** (path-focused bot, 150 seeds, rate and ratio to its keeper's ascension 0 rate; target 0.6–1.4 × for all nine): every path is in range.

| Architect | Wins | Ratio | Warden | Wins | Ratio | Ghost | Wins | Ratio |
| --- | ---: | ---: | --- | ---: | ---: | --- | ---: | ---: |
| Mesh | 34 % | 0.93 | Fortress | 40 % | 0.96 | Buffer | 25 % | **0.63** |
| Backbone | 32 % | 0.87 | Firewall wall | 30 % | **0.72** | Evasion | 33 % | 0.84 |
| Deployment | 33 % | 0.91 | Protocols | 29 % | **0.70** | Payloads | 29 % | 0.74 |

Buffer, Protocols and Firewall wall sit closest to the floor. Path fights run like their keeper's (Warden paths 5.9–6.3 turns per normal fight).

**Energy devices.** No run averaged two or more PoE Injectors per fight, even on the power path (PoE Injector, Cache Server and Load Balancer first: 0.5–0.8 injectors per fight, 16 % of the Architect's fights with two online), so the ≤ 1.3 × check holds only trivially. In 3.5–6-turn fights an injector (2 energy and two cables for +1 energy a turn) rarely pays: runs forced to start with two injectors won 14–21 % (keepers 37–42 %), 19–22 % at cost 1; runs averaging one or more per fight won 29 % (Architect, 52 runs), 60 % (Warden, 25 runs) and 39 % (Ghost, 23 runs). PoE Injector stays at 2 / 1; cost 1 / 0 is the lever to try if energy devices should become a real build.

### The v5 Warden rule

**Backpressure stores all the damage your shield prevents, not half** (`backpressureRatio` 0.5 → 1): every blocked point comes back on the next transmission. It needed no engine code (the resolver reads the ratio; the Backpressure relic's face already prints "Damage your shield prevents … is stored" at 1). **Flow Control** now stores **150 %** (`values.amount` 1 → 1.5; its face reads "Backpressure stores 150 % of the damage your shield prevents."). The rule raised the Warden about 11 points, offset in the same pass by Hardening Guide +3 → +1, Stand Firm 11 / 15 → 8 / 12, Brace 5 + 3 → 3 + 2 (+: 5 + 3) and Deep Packet Inspection 3 + 2 per firewall → 2 + 1 (+: 4 + 2). With it the Warden's fights shortened (normal 6.6 → 6.2, elite 8.6 → 8.0, guardian 13.3 → 12.2 turns) but stay above the targets.

**Persistent State cap.** Runs holding Persistent State won 70–78 % against about 30 % without it, at cost 2 or 3 and even as a legendary. `blockCarry` is now a number: the most block that carries into the next turn (the highest running cap counts; copies add nothing), read from the card's `values.amount` and resolved with `daemonMax`, so the forecast equals the resolution. The card is now "Daemon. Up to 2 of your block carries into the next turn." (upgraded: up to 4), cost 2 / 2 (was 3 / 2 and "Your block no longer expires"). Measured at 150 seeds: caps 6 / 9 → Warden 40 %, holders 72 %; 4 / 6 → 41 %, 74 %; 3 / 5 → 37 %, 59 %; **2 / 4 (kept) → 37 %, 62 %** (39 runs); a dead card (cap 0) → 31 %, holders 38.5 %; banned → 36 %. Holding a rare carries survivorship bias (a dead Persistent State still reads 1.24 × its keeper), so the 1.66 × holder ratio at cap 2 (±8 points on 39 runs) does not demonstrate the 1.4 × target; the card no longer decides the Warden.

### Tuned (before → after)

`RULES`: `normalHealth` [14, 4, 11] → [20, 5, 16]; `eliteHealth` [27, 2, 9] → [38, 3, 13]; `guardianHealth` [60, 86, 118] → [90, 128, 176] (the bots rarely lost in stages I–II); `rewardRarity.normal` [0.58, 0.37, 0.05] → [0.65, 0.32, 0.03], `.elite` [0.45, 0.42, 0.13] → [0.55, 0.37, 0.08], `.guardian` [0, 0, 1] → [0, 0.5, 0.5] (fewer rares); `bufferMultiplier` 2 → 1.5 (the Ghost's free console gave +50 % damage, its fights ran 3.3 / 4.2 / 5.9 turns and guardians died before their ultimate); `backpressureRatio` 0.5 → 1 (the Warden rule); `hardenShield` 2 → 1; `hardenPerHostile` 1 → 0 and `hardenPerAdd` 1 → 0 (the v4 addition pending approval is removed: Harden is the design's rule again).

Cards (base / `+`):

| Owner | Card | Before | After |
| --- | --- | --- | --- |
| Architect | Redundant Paths, Equal-Cost Multipath | 2 / 3 per channel | 3 / 4 |
| Architect | Flood Fill | 1 / 2 per channel | 2 / 3 |
| Architect | Mesh Weave | cost 1 | 0 |
| Architect | Fabric Controller, Datacenter | cost 2 / 1 | 1 / 0 |
| Architect | Trunk Line (per device), Traceroute and Deep Buffers (per switch) | 1 | 2 |
| Architect | Carrier Grade | cost 2 / 1, +1 per device | 1 / 0, +2 per device |
| Warden | Deep Packet Inspection | 3 + 2 per firewall (5 + 3) | 2 + 1 (4 + 2) |
| Warden | ACL Gate | linked to 1 nearest device | 2 |
| Warden | Perimeter | 2 / 3 per firewall | 3 / 4 |
| Warden | Brace | 5 + 3 next turn (7 + 4) | 3 + 2 (5 + 3) |
| Warden | Pushback | backpressure 2 / 3 | 1 / 2 |
| Warden | Stand Firm | 11 / 15 | 8 / 12 |
| Warden | Hardening Guide | +3 | +1 |
| Warden | Persistent State | cost 2 / 1, carries all | cost 2 / 2, carries up to 2 / 4 |
| Warden | Flow Control | stores all | stores 150 % |
| Warden | Tripwire | 5 / 8 | 7 / 10 |
| Warden | Incident Response | 3 / 5 | 4 / 6 |
| Ghost | Flush | +4 / +6 | +3 / +5 |
| Ghost | Fork Bomb | 3 / 4 Payloads | 2 / 3 |
| Colorless | Emergency Rebuild | cost 1 / 0 | 2 / 1 (a whole channel for 1 energy) |
| Colorless | Containerlab | cost 2 / 1 | 3 / 2 |
| Colorless | Packet Guard | 4 / 7 block | 3 / 5 (the shared defense) |

**Ascension riders** became `RULES` keys (see [Ascension](#ascension)): Sharper Teeth's +1 from every hostile in every stage to leaders, singles and guardians from stage II (`ascensionAttackFromStage` 1, `ascensionAttackRoles` 1); `ascensionGuardianHealth` 1.15 → 1.05; `ascensionEnrageThreshold` 0.6 → 0.5. Before the keys existed ascension 4 read 1 % for every keeper: every rider that was already a key (the Breaker Charge, the wear, the add bonus, pack rate, second designations, add health) moved nothing even at 0, while the hard-coded +1 on every strike and breach (level 3) and the guardians' +15 % / +2 ultimate / −2 integrity (level 4) dominated.

### Not met

- **The Warden's fight length** (6.2 / 8.0 / 12.2 turns against 3.5–5 / 5–7 / 7–10). The Warden wins by out-blocking: raising health only lengthens its fights, and the Backpressure rule shortened them by 0.4 / 0.6 / 1.1 turns. Reaching the band needs more Warden offense than its win rate allows.
- **The Warden at ascension 4**: 4 % against 5–12 % (150 seeds, one point under; not iterated further).
- **Energy devices** are untested in their intended form (no run reached two injectors per fight), and **Persistent State**'s holder ratio is not demonstrated below 1.4 × at 150 seeds.

### Rejected levers

| Lever | Result |
| --- | --- |
| `bufferMultiplier` 1.25 | Ghost 45 %, the same as card nerfs; 1.5 kept for the Buffer identity |
| Store and Forward 3 / 5 | 46 vs 44 %: no effect |
| Ghost Protocol 3 / 2, Deep Queue +0.5, Spoof 2 / 4, Hold Queue 3 / 5 | 45 vs 51 %, then Ghost 33 % after the health raise: reverted |
| Deep Queue banned | 43 vs 45 %: not dominant |
| `backpressureRatio` 0.75 | not used: the Backpressure relic's face prints only "Half" or "Damage" |
| Persistent State cost 3 / 2 alone; rarity legendary | no measurable change (holders 72–78 % against 17–30 %); legendary: Warden 40 %, Fortress 35 %: rejected (the cap replaced both) |
| Entrench cost 3 / 2 | no effect; banning Entrench −7 |
| Defense in Depth 1 / 0, Null Route 1 / 0 | runs holding them won 78 / 77 %: reverted to 2 / 1 |
| Null Route 1, Tripwire 8 / 11, Incident Response 5 / 7 | Protocols path 24 vs 25 %, Warden +2: rejected |
| Rate Limiter 6 / 9, IPS Signature 7 / 10, Failover Policy 4 / 7, Port Security 5 / 8; `maxProtocols` 3 | Protocols path 22 vs 22 %: no effect |
| Fortress nerf: Hardening Guide 1, Vent cost 1, Entrench 3 / 2 (before the Warden rule) | Fortress 54 %, default Warden 27 %: too broad at the time |
| `bandwidthPerChannel` 4 | Architect +3 / +4; Architect card buffs chosen instead |
| `configuredDamage` 2, `overclockDamage` 3, `compressionDamage` 3, Line Rate 1 / 0, Trunk Line 3 | Backbone +2 to +3; rejected: the path's partner list (contract partners only) fixed it |
| Elite and guardian health +25 % on top | Architect −1, Warden 0, Ghost −7: the Warden only fights longer |
| `escalationStart` 3, `escalationEvery` 2 | no change |
| `packRateAscensionBonus` +0.15, `addBreakBonus` 6 | no reduction (Architect +4) |
| `gradedArmorBase` 3 | ascension 4 unchanged (3 / 2 / 4 %) |
| `guardianHealth` 72 / 135 / 185 (a softer Regent) | ascension 4 unchanged (4 / 2 / 4 %), ascension 0 +2 to +4 |
| Ascension 4 riders at 0 or softer (`ascensionChargeBreaker` 0, `ascensionRiderWear` 0, `addBreakBonusLate` 4, `packRateAscensionBonus` 0, both second designations 0, `ascensionAddHealth` 0.8) | ascension 4 unchanged (3–4 %): the hard-coded riders dominated (then made keys) |
| Sharper Teeth from stage II for leaders only | ascension 4: 7 / 1 / 4 % |
| + `ascensionUltimateBonus` 1, `ascensionIntegrityLoss` 1 | ascension 4: 15 / 7 / 13 %: the Architect and Ghost above 12 % |
| `ascensionAttackBonus` 0, `ascensionGuardianHealth` 1.05, `ascensionUltimateBonus` 1 | ascension 4: Architect 19 % |
| PoE Injector cost 1 / 0 | runs starting with two injectors: 19–22 % at either cost (keepers 36–40 %): 2 / 1 kept |

### Watch in play-tests

- **Persistent State** is still the Warden's standout rare (above); **Containerlab** (3 / 2) and **Power Surge** still show high holder win rates (52–77 %), but they are rares.
- **The Ghost** at ×1.5 buffers often and interrupts 95 % of ultimates: check that arming the Buffer console still feels worth it.
- **Null Route** (2 / 1) still cancels a guardian ultimate's breach.
- **Energy relics**: Overvolt (holders 34–46 %) and Jumbo Frames for the Architect (28 %) are the weakest; Air Gap, Storm Control and Legacy Mainframe the best.
- `costFor` still takes exactly 1 off for Blueprint and Rapid Redeploy; `discount` was not tuned (it stays 1), so printed and applied discounts agree.

---

## Balance evidence (v4, history)

The v4 record below measured the five-energy, seventeen-card game (`baseEnergy` 5, `handDraw` 6) with ascension 0–10; it is kept as history and as the baseline for the v5 targets.

`node --experimental-strip-types scripts/balance.ts <seeds> [--ascension=N] [--policy=..] [--archetype=..] [--elite] [--no-signature] [--summary]` plays complete three-stage expeditions with deterministic bots (`scripts/bot.ts` for combat, `scripts/bot-meta.ts` for every non-battle phase). The v4 tactical line reads every choice from `combatPreview`: it tries every living hostile as the target (every delivery lands there; overflow carries the rest) and keeps the one with the best outlook (damage, kills weighted by threat, adds before the ultimate, an interrupt, minus incoming damage, disruption and installs; `--kill-order=leader` keeps the leader targeted instead); it places a phantom before a disruption, saves a device the forecast breaks, scrubs or demolishes installations by value per energy (charges, then Jammers, Spikes, Taps), steps a device out of reach when that is cheaper, repairs a worn primary-route device, racks threatened devices, bursts on the ultimate turn only when that reaches the break (otherwise braces), and answers offers by a fixed priority. Experiment flags `--hp-scale=N` (normal battles), `--boss-scale=N` (guardians) and `--rule=key:value,…` (override any `RULES` number; `a/b/c` for arrays, `packShares.trio:0.6/0.3/0.3` for nested keys) probe alternatives without editing the game. Metrics per profile include turns per fight by shape (single, duo, pair, trio), kill order, installations planted and destroyed, wear, repairs and breakdowns, maintenance share of energy, crates by contents, messages chosen, reinforcement fights, designation win rates, guardian interrupts versus braces with adds alive, and integrity lost per stage. Results are recorded in [balance-v4.json](balance-v4.json).

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

**Aiming removed.** With per-channel aiming gone (every delivery lands on the target) and Traffic Shaping at +2 / +4, the 200-seed probe reads 68 · 81 · 48 tactical wins (34 · 41 · 24 %) against 67 · 82 · 47 before, every other profile identical: the bots split deliveries often (600–1900 aims per 200 runs), but overflow already carried almost all of that value. `balance-v4.json` is unchanged.

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

The core tests verify forecast purity and exact agreement with resolution on 160 randomized single-hostile boards and on randomized pack boards (per port, per hostile, per installation), the single-hostile invariant against a v3 fixture, channel and online computation, bandwidth, clusters, firewalls anywhere, honeypots, cache/power/balancer timing, consoles including buffer and packet loss, backpressure (single and multi-port), protocols once per phase including trap lethal, ports, cadence, the target and overflow (every delivery on the target, a save with old aims loading), installation placement, cap, timing, effects, quarantine, bites, Reclaim and scrub, condition, wear, racks, breakdown and repair, escalation by stage, guardian charges and adds, every designation, reinforcements, crates, messages and signals, terrain legality, junk, card upgrades, relic effects, ascension hooks, map invariants over 2,400 maps, market, sanctuary and event flows, save validation and v3 migration, the Handbook, and every Field Training lesson.

---

## Implementation readings

Where the Proposal 4 design was silent, ambiguous or superseded by a measurement, the implementation chose as follows (the rules above already state the result). The v5 readings follow in their own list.

- **Pack health** follows the stated shares (duo 0.575 H, pair 0.75 / 0.40 H, trio 0.63 / 0.26 / 0.26 H), not the design's 11.2 table, whose pair and trio numbers applied 1.15 twice; worked example B's 34 / 18 becomes 29 / 16.
- **Pack rooms may substitute the rolled leader** with a template of the rolled shape; stage II elite reinforcements (15 %) are decided by the chart like stage III's, so no path crosses two reinforced elites in any stage.
- **Budgets**: the 1.3 × headroom fallback applies to pack templates only (a single has no headroom limit); the 1.45 × band is checked for pack rooms; a bad signal that would push a pack over its budget becomes a good one; second designations (ascension 3 and 4) ignore the ascension 0 budget.
- **Crates** roll from their own seeded streams; crate credits are stored with the Lean Supply credit multiplier applied; a crate card still pending at victory is dropped. **Messages** leave Recover out when no hostile stands; Reinforce raises maximum integrity only. The designation credit is paid once per room; the reinforced credit only for a rolled arrival.
- **Rigger Drone** strikes with PRY (the design's 4.6 one-liner said BARB). A reinforcement taking the centre port gets the odd cadence.
- **Breakdown** returns no card: hardware cards already cycle to the discard pile when played, so the text reads "breaks Core Router · wreckage remains".
- **Targets** are planned after the transmission, in port order, against the board as transmitted; a Jammer's jam is decoyed by any cabled, unshielded honeypot (one per honeypot per phase); chip attaches to the first hostile that takes its turn; a full table boosts the oldest installation; a rack whose ring holds a wear target takes the wear.
- **Escalation** counts the hostile's own actions; the escalation flag also turns off the guardians' charge at half health. **Adds rise** when the charge is announced and act from the ultimate turn. **Shedding** arms at the half crossing and its escort appears at the end of that enemy phase.
- **Crate salvage and Salvaged drops** land at the end of the enemy phase; card and message offers open before the next hand (or on the victory screen); once the fight is over, salvage yields its credits.
- **Balance** changed numbers, not rules, except one addition: the break bonus per add (4, ascension 4: 5), the v4 credit sources and four ascension riders were tuned (see [Balance evidence (v4, history)](#balance-evidence-v4-history)); the Warden's Harden gained +1 block per extra hostile and per living add, pending the user's approval (v5 sets both keys to 0).
- **Field Training drills**: Choose the Target fights a Rust Prophet (a strike, then a breach: nothing that changes the board) with a Relay Drone and a Spark Mite, so the rail is full from the first step and no arrival interrupts the lesson; the Drone's health is the whole packet less 2 and the Mite's at most 3, so the first kill overflows 2 into the leader and the second more (5 with the shipped numbers). The Wardens drill's left Warden keeps its add health (8) as long as the packet exceeds it by 2, so its kill overflows into the Regent. Clear the Ground adds a Spike beside the worn router, so a breakdown is telegraphed (twice, and never happens) although the Static Nest has no wear of its own; The Crown and Its Wardens prepares Packet Burst before the charge-turn transmission (a prepared card arrives next turn), and its thresholds are read from `RULES` (20 → 16 with the tuned add bonus, not the design's 18 → 15).

### v5 readings

Where the v5 contract was silent or a card's rule needed a choice, the implementation chose as follows (each is also in the card's `detail`):

- **Energy**: the orb's base is `turnEnergyBase`; Cold Start and SDN Controller change the first turn only and do not count toward the base. The cap limits relic energy only; PoE Injectors, next-turn energy, Reserve Cell and cards come on top.
- **Opening hand**: Innate cards are drawn first, beyond the draw count if needed, then the guaranteed router card (Core Router or Hardened Router, not Standby Router) and two link cards. Zombie Process counts toward the hand's draws.
- **Hot Swap and free links**: Hot Swap is spent before Patch Panel's free link; Patch Panel's and Rack and Stack's discounts are spent by the next matching card even when it already costs 0. `costFor` shows every link card at 0 while Hot Swap is unspent, and a Blueprint or Rapid Redeploy discount (`discounted`) applies to every hand copy of that id and always takes off exactly 1 (the faces print `values.discount`).
- **Architect**: Splice takes the primary route's longest cable (ties: nearest ALPHA), deploys the switch at the free socket nearest its midpoint (up to 3.5 away) and both halves keep armor and amplification. Line Rate refuses when nothing on the primary route is left to upgrade. Trunk Line, Traceroute, Redundant Paths, Equal-Cost Multipath and Perimeter count when played (no live route: 0). Peering Session pays for every channel a player action raises, restoring a cut or a jam included.
- **Warden**: Bulkhead's face says "online" firewalls. Entrench (×`values.amount`) refuses at 0 block; Vent leaves the backpressure stored; Rearm is not Exhaust and makes the returned protocol free this turn. Flow Control needs the Backpressure relic and its ratio does not stack (highest wins); Persistent State carries what the attacks left of the block (non-block pool terms spend first), up to its cap (`values.amount`, the highest running cap counts). Null Route's breach trigger also matches an ultimate's breach.
- **Ghost**: "Buffering" (Hold Queue) means the Buffer console is armed this turn. Flush needs a buffer but does not spend it. Deep Queue copies stack additively (×2.5, ×3.5 over `bufferMultiplier` 1.5, base and `+` together). Payloads count through `turnEffects.payloads`, never `burst`, so the forecast prints them. Phantom Node's "off every route" moved to its `detail`.
- **Colorless**: Hotfix targets only a worn device (a jam stays). Rollback returns the most recent non-Exhaust card played this turn that is still in the discard pile (not daemons, armed protocols or junk) and it costs its energy again. Firmware Update upgrades every upgradable hand card for the battle (tokens stay encounter-only; discounts move to the new id). Salvage Cycle returns link cards.
- **Curses**: Kernel Panic counts cards played before it arrived; console, scrub, repair and relocation are not card plays, deleting a Worm is; two copies do not stack below 3. Memory Leak never takes energy below 0. Backdoor and Bitrot act only if the enemy phase happens. A message's Purge removes curses in `PURGE_ORDER`.
- **Daemons**: every hook runs once per distinct running id with its copy count; a daemon never hears its own play. `turnStart` gains are not in `nextTurn`. Misses are taken before Phantom Nodes and never take overloads or installations; Incident Response also hits a Jammer that Port Security answered.
- **Events**: event choices are resolved by position; the v5 curse deals were inserted before "Walk on" (The Echo Chamber's free echo sits before Listen). Signal in the Static's reward rolls the elite odds (first card uncommon or better), not a guaranteed rare.
