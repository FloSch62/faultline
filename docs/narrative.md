# FAULTLINE: the undelivered

The full canon (world, history, who sends the keepers, open questions) is in [lore.md](lore.md). This page covers how the story is delivered in the game.

The orbital backbone broke when its outer relays were destroyed. Emergency traffic looped through damaged return routes and overwhelmed the surviving network. Human wardens ordered the Blackout Core to isolate the archive until a safe delivery could be confirmed. The route carrying that confirmation never recovered.

The Core has spent the remaining power preserving undelivered messages. Its isolation machinery now blocks the engineer trying to reconnect the station. Defeating it breaks that machinery, not the archive. The final acknowledgement comes from a living destination outside the station. The story leaves the scale of that survival open.

The three-stage expedition moves from a single blinking delivery light to the discovery that the silence was a costly act of preservation. The small twist changes the meaning of the player's task without changing its rules: build a reliable route, withstand interference, and release the queue.

## Chapter progression

| Stage | Region and guardian | Discovery and play context |
| --- | --- | --- |
| I | The Copper Reach · Iron Regent | Reopen the outer gates. A blinking delivery light gives the first circuit a purpose; independent routes prove there is a second way home. |
| II | The Glass Cathedral · Hollow Choir | Cross the archive's resonant isolation chambers. Voices survive in glass circuits, while the guardian silences routes and corrupts occupied ground. |
| III | The Blackout Heart · Blackout Core | Reach the preserved messages and break the quarantine shell. Its keeper must see a reliable route before the archive can deliver its queue. |

Each stage has seven sectors, its own route map and named chapters, with sanctuary and salvage choices before its guardian. The first two victories reopen the next region. Only the Blackout Core ends the expedition. Stage definitions and chapter names live in `src/core/stages.ts`.

The three selected engineers approach the same failure from different positions. The Architect built the old routes and carries Hot Swap. The Warden inherited responsibility for the quarantine and carries Shield Array. The Ghost recovered abandoned traffic and keeps a personal message in Deep Cache. These are motivations, not different endings or undisclosed mechanical bonuses.

## Hostile systems

Packet Leeches are stranded recovery drones; Cable Wraiths are isolation cutters still obeying their evacuation task; Null Storms are circulating retries rather than conscious enemies. Gate Sentinels enforce a checkpoint whose operators and credentials are gone. The Blackout Core is an archive custodian following an unresolved human instruction, not an evil intelligence or a hidden traitor.

Enemy copy follows the actual repeating intent patterns. Telegraph lines are short anticipation text selected by the current intent, not claims that additional animations or attacks exist. Numerical damage and targets remain the responsibility of the combat forecast. The Core's `ENRAGED` state is its emergency defense mode at half integrity; this presentation does not require sentience or anger.

Combat damage represents neutralizing hostile enforcement hardware. The archive and any stored human messages survive. Temporary jams and cuts remain temporary gameplay faults; story text must not imply permanent topology loss.

Six further machines patrol the reopened regions: Coil Serpent, Ash Moth, Null Marshal, Glass Choir, Wire Weaver and Grave Reaver. Their visual identities and journals match their actual mechanics: route pressure, band disruption, firewall checks, alternating fields, cable tension and a dangerous last stand. The Iron Regent and Hollow Choir are distinct stage guardians with illustrated entrances; the Blackout Core keeps its place as the final custodian.

The hostile systems now reward distinct responses. Leeches recover when a transmission delivers no damage. Wraiths choose the longest exposed cable and punish spans longer than six units. Storms sweep their jam forecast through North, Center, and South; hardware placement and the one-energy relocation action determine exposure. Sentinels carry plating that a routed firewall bypasses. Independent circuits with routers in opposite outer bands provide two block, giving physical separation a defensive purpose. These traits are explained in the field journal as extensions of each system's original job.

## Delivery and tone

Three further maintenance systems have outlived their jobs. Rust Prophet is a corroded maintenance beacon that broadcasts the failures it once diagnosed. Prism Widow is an optical repair automaton weaving perfect isolation webs around live traffic. Ferric Colossus is a smelter guardian that recognizes redundant safety circuits. Their corrosion, suppression and armor are forecast mechanical effects with cleansing or rerouting as counterplay.

The Copper Market gives salvage caches a human-scale refuge: a quiet exchange where the keeper offers one tool for the road. It retains the existing free choice of one card; there is no hidden currency or paid shop economy. Its plucked, clockwork score contrasts with the sanctuary's sparse piano and the elite encounters' sharper percussion.

`src/story.ts` exports typed `CHAPTERS`, `ENEMY_STORIES`, `ARCHETYPE_STORIES`, `SANCTUARY_STORIES`, and `OUTCOMES`. The small selectors `chapterForFloor`, `enemyStory`, and `sanctuaryStory` support the existing floor and enemy IDs. Sanctuary selection follows the map's early branch and two late branches. No story content mutates a run, saves progress, or gates an action.

Show two-sentence chapter descriptions on the map, short enemy motives in the combat-detail view, one telegraph beside the actual intent, and brief sanctuary descriptions above the services. Recovered fragments are optional secondary copy. Keep them out of essential damage calculations and target controls. The Ghost's epilogue echoes an earlier recovered fragment, giving an attentive player a small personal resolution without a lore screen.

Use tangible evidence: a delivery lamp, a half-finished repair, an ordinary arrival message. Avoid prophecies, chosen heroes, unexplained magic, and promises of features outside this alpha. Failure ends the current expedition; the waiting archive gives another attempt meaning without implying retained cards or mechanical progress.
