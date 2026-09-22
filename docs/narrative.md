# FAULTLINE: the undelivered

The orbital backbone broke when its outer relays were destroyed. Emergency traffic looped through damaged return routes and overwhelmed the surviving network. Human wardens ordered the Blackout Core to isolate the archive until a safe delivery could be confirmed. The route carrying that confirmation never recovered.

The Core has spent the remaining power preserving undelivered messages. Its isolation machinery now blocks the engineer trying to reconnect the station. Defeating it breaks that machinery, not the archive. The final acknowledgement comes from a living destination outside the station. The story leaves the scale of that survival open.

The seven-sector expedition moves from a single blinking delivery light to the discovery that the silence was a costly act of preservation. The small twist changes the meaning of the player's task without changing its rules: build a reliable route, withstand interference, and release the queue.

## Chapter progression

| Sector | Existing title | Discovery and play context |
| --- | --- | --- |
| 1 | The Sunken Relay | One pending message establishes a concrete reason to transmit. Build the first route. |
| 2 | Fractured Frequencies | Repeated emergency traffic explains the storm and why a single route is fragile. |
| 3 | The Hollow Exchange | Cached everyday messages give the archive human value. Salvage and maintenance are available. |
| 4 | Beyond the Firewall | The quarantine was a human decision. Stronger guardians protect a trust boundary. |
| 5 | Echoes in the Copper | Messages were retained rather than erased; the Core has been preserving them. |
| 6 | The Last Safe Port | A final maintenance opportunity asks what the deck can afford to carry into the gate. |
| 7 | The Blackout Core | Its isolation shell prevents the acknowledgement that could release it. Defeat opens the archive's route. |

The three selected engineers approach the same failure from different positions. The Architect built the old routes and carries Hot Swap. The Warden inherited responsibility for the quarantine and carries Shield Array. The Ghost recovered abandoned traffic and keeps a personal message in Deep Cache. These are motivations, not different endings or undisclosed mechanical bonuses.

## Hostile systems

Packet Leeches are stranded recovery drones; Cable Wraiths are isolation cutters still obeying their evacuation task; Null Storms are circulating retries rather than conscious enemies. Gate Sentinels enforce a checkpoint whose operators and credentials are gone. The Blackout Core is an archive custodian following an unresolved human instruction, not an evil intelligence or a hidden traitor.

Enemy copy follows the actual repeating intent patterns. Telegraph lines are short anticipation text selected by the current intent, not claims that additional animations or attacks exist. Numerical damage and targets remain the responsibility of the combat forecast. The Core's `ENRAGED` state is its emergency defense mode at half integrity; this presentation does not require sentience or anger.

Combat damage represents neutralizing hostile enforcement hardware. The archive and any stored human messages survive. Temporary jams and cuts remain temporary gameplay faults; story text must not imply permanent topology loss.

The hostile systems now reward distinct responses. Leeches recover when a transmission delivers no damage. Wraiths choose the longest exposed cable and punish spans longer than six units. Storms sweep their jam forecast through North, Center, and South; hardware placement and the one-energy relocation action determine exposure. Sentinels carry plating that a routed firewall bypasses. Independent circuits with routers in opposite outer bands provide two block, giving physical separation a defensive purpose. These traits are explained in the field journal as extensions of each system's original job.

## Delivery and tone

`src/story.ts` exports typed `CHAPTERS`, `ENEMY_STORIES`, `ARCHETYPE_STORIES`, `SANCTUARY_STORIES`, and `OUTCOMES`. The small selectors `chapterForFloor`, `enemyStory`, and `sanctuaryStory` support the existing floor and enemy IDs. Sanctuary selection follows the map's early branch and two late branches. No story content mutates a run, saves progress, or gates an action.

Show two-sentence chapter descriptions on the map, short enemy motives in the combat-detail view, one telegraph beside the actual intent, and brief sanctuary descriptions above the services. Recovered fragments are optional secondary copy. Keep them out of essential damage calculations and target controls. The Ghost's epilogue echoes an earlier recovered fragment, giving an attentive player a small personal resolution without a lore screen.

Use tangible evidence: a delivery lamp, a half-finished repair, an ordinary arrival message. Avoid prophecies, chosen heroes, unexplained magic, and promises of features outside this alpha. Failure ends the current expedition; the waiting archive gives another attempt meaning without implying retained cards or mechanical progress.
