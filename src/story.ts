import type { Archetype } from "./core/expedition.ts";
import { RULES } from "./core/cards.ts";
import type { DesignationId, Intent } from "./core/types.ts";
import { DESIGNATIONS, ENEMIES, designationRule, hostileName } from "./core/enemies.ts";

export interface ChapterStory {
  title: string;
  description: string;
  /** A short recovered fragment; optional secondary copy, never an objective. */
  fragment: string;
}

/** Indexed by the expedition's zero-based floor. */
export const CHAPTERS: readonly ChapterStory[] = [
  {
    title: "The Sunken Relay",
    description:
      "The orbital backbone fell silent when its outer relays broke apart. Beneath the wreckage, one delivery light is still blinking; someone left a message waiting.",
    fragment: "Delivery pending. Keep the line open.",
  },
  {
    title: "Fractured Frequencies",
    description:
      "Broken routes sent emergency traffic back to its source, again and again, until every working relay drowned in retries. The echoes are still here, following anything that transmits.",
    fragment: "If you hear this twice, the return route has failed.",
  },
  {
    title: "The Hollow Exchange",
    description:
      "The exchange was never emptied: arrival notices, repair requests, a promise to call after landing. Its caches hold the ordinary lives the Blackout interrupted.",
    fragment: "Made it down. Your turn.",
  },
  {
    title: "Beyond the Firewall",
    description:
      "The isolation order bears a human signature: close the backbone before the storm erases the archive. The wardens saved what they could, then lost the route that would tell the Core it was safe to reopen.",
    fragment: "Quarantine until a safe delivery is confirmed.",
  },
  {
    title: "Echoes in the Copper",
    description:
      "Deeper in the copper, every surviving message has a destination and no acknowledgement. The Core has been holding them all this time, spending the station's last power to keep them intact.",
    fragment: "Retained. Not delivered. Not discarded.",
  },
  {
    title: "The Last Safe Port",
    description:
      "A maintenance lamp still warms the last working bench before the quarantine gate. Choose what will carry you through: a repaired backbone, something worth keeping, or less weight in the deck.",
    fragment: "Leave the lamp on for the next shift.",
  },
  {
    title: "The Blackout Core",
    description:
      "The Core is still obeying the last order it received: keep the archive safe behind closed routes. Break its isolation shell, and the waiting messages will finally have a way out.",
    fragment: "No safe route acknowledged. Hold all deliveries.",
  },
];

export function chapterForFloor(floor: number): ChapterStory {
  const index = Number.isFinite(floor) ? Math.trunc(floor) : 0;
  return CHAPTERS[Math.max(0, Math.min(CHAPTERS.length - 1, index))];
}

export type StoryEnemyId = "leech" | "wraith" | "storm" | "sentinel" | "core" | "prophet" | "widow" | "colossus" | "serpent" | "moth" | "marshal" | "choir" | "weaver" | "reaver" | "regent" | "cantor"
  // v4 leaders, escorts and guardian adds
  | "foreman" | "nest" | "demolition" | "blight"
  | "spark-mite" | "splicer" | "relay-drone" | "ward-node" | "tap-spinner" | "glass-echo" | "rigger-drone"
  | "gate-warden" | "chorister" | "quarantine-drone";

export interface EnemyStory {
  name: string;
  title: string;
  motive: string;
  pattern: readonly Intent["kind"][];
  /** Short anticipatory lines, selected by the real combat intent. */
  telegraphs: Partial<Record<Intent["kind"], string>>;
  counterplay: string;
  defeated: string;
}

export const ENEMY_STORIES: Record<StoryEnemyId, EnemyStory> = {
  serpent: {
    name: "Coil Serpent", title: "One route is a perfect snare",
    motive: "A cable-recovery coil has learned to tighten around anything that still carries a signal. It follows a single route all the way to its heart.",
    pattern: ENEMIES.serpent.pattern.map(p => p.kind),
    telegraphs: { strike: "The copper spine draws tight. A second channel would loosen its grip.", sever: "A hooked fang settles over a live cable.", corrupt: "Emerald venom beads against the table." },
    counterplay: ENEMIES.serpent.trait, defeated: "The coils open. There is more than one way home.",
  },
  moth: {
    name: "Ash Moth", title: "Cold wings over a living signal",
    motive: "A maintenance drone follows the warmth of working relays. Its ruined cooling wings shed conductive ash over everything it tries to save.",
    pattern: ENEMIES.moth.pattern.map(p => p.kind),
    telegraphs: { corrupt: "Fine ash settles along your primary route.", jam: "Its wings turn toward the marked band.", strike: "The lantern in its chest burns cold blue." },
    counterplay: ENEMIES.moth.trait, defeated: "The wings fold around a lantern that no longer needs tending.",
  },
  marshal: {
    name: "Null Marshal", title: "No passage without a firewall",
    motive: "It once escorted engineers safely through the trust boundary. With every credential expired, its shield now bars the very people it was built to protect.",
    pattern: ENEMIES.marshal.pattern.map(p => p.kind),
    telegraphs: { breach: "The Marshal raises its final warrant.", jam: "A blue eye fixes on your firewall first.", strike: "The great shield turns edge-on." },
    counterplay: ENEMIES.marshal.trait, defeated: "The warrant expires. The road belongs to the living.",
  },
  choir: {
    name: "Glass Choir", title: "Three voices, one broken note",
    motive: "Three announcement bells repeat different fragments of the same evacuation order. Their incompatible frequencies turn the ground to rust and silence.",
    pattern: ENEMIES.choir.pattern.map(p => p.kind),
    telegraphs: { corrupt: "A different bell begins the refrain. Watch which field it casts, and for the static it scatters into your deck.", strike: "Three glass faces draw breath together.", breach: "A single sharp note searches for an open boundary." },
    counterplay: ENEMIES.choir.trait, defeated: "For a moment, all three bells agree on silence.",
  },
  weaver: {
    name: "Wire Weaver", title: "Every extra thread tightens the trap",
    motive: "The old exchange's wiring automaton cannot distinguish a repair from a snare. It keeps adding tension until every connected line is ready to snap.",
    pattern: ENEMIES.weaver.pattern.map(p => p.kind),
    telegraphs: { sever: "A hooked limb plucks at a live thread.", overload: "Gold filaments pull a device past its tolerance. It will come back worn.", strike: "The web tightens. Six cables give it something to pull against." },
    counterplay: ENEMIES.weaver.trait, defeated: "The threads slacken. Your connections are yours again.",
  },
  reaver: {
    name: "Grave Reaver", title: "A failing heart strikes twice as hard",
    motive: "Built to dismantle dead reactors, it now hears every weak signal as permission to begin. Its own heart is the last machine it will ever take apart.",
    pattern: ENEMIES.reaver.pattern.map(p => p.kind),
    telegraphs: { breach: "The red heart tolls beneath its ribs.", strike: "Both scythes rise. The dying light makes them faster.", corrupt: "Ash from a thousand dismantled relays falls to the ground." },
    counterplay: ENEMIES.reaver.trait, defeated: "The scythes lower. Its last task is finally over.",
  },
  regent: {
    name: "The Iron Regent", title: "Keeper of the copper gates",
    motive: "When the ring broke, the gatekeeper sealed the outer relays behind its own armor. It will only open for a network resilient enough to survive the road beyond.",
    pattern: ENEMIES.regent.pattern.map(p => p.kind),
    telegraphs: { breach: "The crown burns green. The gate issues its challenge.", sever: "An iron gauntlet closes on the strongest line.", strike: "The Regent draws back its great armored hand.", corrupt: "Centuries of tarnish spill from the opened plates.", charge: "The crown rises and two Gate Wardens step out of the gate. Crownfall comes next turn: interrupt it or brace." },
    counterplay: ENEMIES.regent.trait, defeated: "The copper gates open. Beyond them, glass bells are ringing.",
  },
  cantor: {
    name: "The Hollow Choir", title: "The silence behind every voice",
    motive: "The cathedral gathered every voice the Blackout left unanswered. Its keeper cannot bear to let even one escape, so every new connection becomes another sealed bell.",
    pattern: ENEMIES.cantor.pattern.map(p => p.kind),
    telegraphs: { corrupt: "A ring of masks begins a new refrain.", jam: "One porcelain face turns toward your living route.", breach: "The great bell swings. The whole cathedral answers.", charge: "The Choir draws its last breath and two Choristers take up the note. Requiem comes next turn." },
    counterplay: ENEMIES.cantor.trait, defeated: "The masks open their mouths. This time, the voices leave.",
  },
  prophet: {
    name: "Rust Prophet", title: "The ground remembers every failure",
    motive: "Once a maintenance beacon, it now broadcasts the corrosion it was built to prevent. Every answered signal spreads another bloom of rust.",
    pattern: ENEMIES.prophet.pattern.map(p => p.kind),
    telegraphs: { corrupt: "Its censer tilts toward your busiest band. Rust is taking root.", strike: "Oxide gathers at the transmitter's eye.", breach: "The beacon discharges its poisoned reserve." },
    counterplay: `Corrosion lasts two turns and adds ${RULES.corrosionDamage} incoming damage while your hardware occupies the band. Purge Field cleanses it; a Quarantine Rule cancels the next field; relocating every device out of the band also avoids the damage — but splitting a cluster costs its +${RULES.clusterDamage}.`,
    defeated: "The censer cools. Clean light returns to the copper.",
  },
  widow: {
    name: "Prism Widow", title: "A beautiful silence, carefully woven",
    motive: "An optical repair automaton keeps weaving isolation webs around the last working signals. Its glass threads are flawless. Nothing gets through.",
    pattern: ENEMIES.widow.pattern.map(p => p.kind),
    telegraphs: { corrupt: "Violet threads converge on a band in your strongest route.", sever: "A glass limb draws tight against an exposed cable.", strike: "The prism gathers a painful flash of stored light." },
    counterplay: `Suppression costs your primary route ${RULES.suppressionPenalty} damage for each suppressed band it crosses, for two turns. Reroute: build a stronger channel through another band and it becomes the primary route. Or cleanse the band with Purge Field.`,
    defeated: "The glass web unravels. Light takes the long way home.",
  },
  colossus: {
    name: "Ferric Colossus", title: "The furnace that never stopped",
    motive: "A smelter guardian still protects its cold industrial heart. It trusts only the iron around it and the redundant safety circuits its makers left behind.",
    pattern: ENEMIES.colossus.pattern.map(p => p.kind),
    telegraphs: { strike: "A vast iron fist rises above the table.", corrupt: "The furnace vents over your busiest band.", breach: "Its armored gates open on a final surge of heat." },
    counterplay: `Its armor absorbs ${RULES.gradedArmorBase}, minus ${RULES.gradedArmorPerChannel} for every channel beyond the first — build width, or hit hard enough that the armor stops mattering. Cleanse scorched ground or evacuate the band; online firewalls and shields soften its heavy attacks.`,
    defeated: "The furnace door settles. Even iron can learn to rest.",
  },
  leech: {
    name: "Packet Leech",
    title: "A collector with nowhere to deliver",
    motive:
      "Recovery drones once gathered stray traffic for the exchange. With no exchange answering, this one drains live connections to keep its overflowing buffer powered.",
    pattern: ENEMIES.leech.pattern.map(p => p.kind),
    telegraphs: {
      strike: "Its intake opens. The collector is drawing power from your line.",
      sever: "A retrieval claw reaches for an exposed cable.",
      breach: "Its buffer spills toward your delivery port.",
      install: "A Siphon Tap uncoils toward an empty socket on your table.",
    },
    counterplay:
      `Keep damage flowing: a transmission that deals nothing lets the Leech recover ${RULES.leechHeal} health, and each Siphon Tap it plants feeds it ${RULES.leechTapHeal} more after it acts. Scrub a Tap for ${RULES.scrubCost} energy, or let a cabled honeypot's ring kill it as it lands. Block its strikes; an online firewall softens the breach.`,
    defeated: "The collector goes quiet. Its last packet joins your outbound queue.",
  },
  wraith: {
    name: "Cable Wraith",
    title: "The isolation crew never stood down",
    motive:
      "This cable-cutting machine severed damaged routes during the evacuation. It still treats every fresh connection as another path the storm could take.",
    pattern: ENEMIES.wraith.pattern.map(p => p.kind),
    telegraphs: {
      sever: "The isolation blade aligns with your longest unarmored cable.",
      strike: "The cutter turns its stored charge toward your terminals.",
      jam: "A suppression coil searches for unprotected hardware.",
    },
    counterplay:
      `Its blade always takes the longest unarmored cable — honeypots don't fool it — and a span longer than ${RULES.cableExposureLength} units also causes 1 damage. Armor that link, shorten spans by relocating, arm a Failover Policy, or keep a second channel so the cut can't silence you.`,
    defeated: "The blade folds away. For once, a new cable stays connected.",
  },
  storm: {
    name: "Null Storm",
    title: "A thousand unanswered retries",
    motive:
      "No one is sending this traffic anymore. Emergency packets circulate through broken return routes, feeding a storm that overwhelms any hardware still willing to listen.",
    pattern: ENEMIES.storm.pattern.map(p => p.kind),
    telegraphs: {
      jam: "Duplicate requests concentrate in the announced table band.",
      strike: "The returning wave carries a surge toward your terminals.",
      sever: "A standing wave gathers along an exposed cable.",
    },
    counterplay:
      `Its jam band cycles North, Center, then South. Protect critical hardware, relocate it out of the marked band for ${RULES.relocateCost} energy, or put a honeypot there to take the jam. Channels with routers in opposite outer bands also give ${RULES.separatedCircuitShield} shield.`,
    defeated: "The echoes thin. One clean acknowledgement crosses the silence.",
  },
  sentinel: {
    name: "Gate Sentinel",
    title: "A checkpoint without a relief shift",
    motive:
      "The Sentinel guards the archive's trust boundary. Its operators are gone, its credentials have expired, and every returning engineer now arrives as an unknown sender.",
    pattern: ENEMIES.sentinel.pattern.map(p => p.kind),
    telegraphs: {
      breach: "The plated gate issues its challenge directly into your route.",
      sever: "An isolation latch prepares to close an exposed connection.",
      strike: "The checkpoint commits its reserve power to a strike.",
    },
    counterplay:
      `Any online firewall bypasses the Sentinel's plating and blocks ${RULES.firewallBreachBlock} of each breach — it only has to sit on some live route. Add block or arm an IPS Signature for the breach, then a Failover Policy for the cut that follows.`,
    defeated: "The checkpoint releases its lock. The archive remains intact.",
  },
  core: {
    name: "Blackout Core",
    title: "Keeper of the undelivered",
    motive:
      "The Core did not start the disaster; its quarantine stopped the retry storm from erasing the archive. With no safe-route acknowledgement, it has kept the backbone dark and the last messages alive.",
    pattern: ENEMIES.core.pattern.map(p => p.kind),
    telegraphs: {
      sever: "Quarantine shutters prepare to isolate an exposed cable.",
      breach: "The archive gate discharges into the incoming route.",
      jam: "Suppression coils seek hardware without jam protection.",
      strike: "The Core redirects its remaining reserve toward your terminals.",
      install: "A quarantine seed drifts down toward an open socket.",
      charge: "Event Horizon: the shell draws every light in the room inward, and two Quarantine Drones unfold beside it.",
    },
    counterplay:
      `Prepare for cut, breach, jam, then strike. Its cut also slips a Worm into your draw pile. At half integrity its emergency mode adds damage, every jam also plants a Siphon Tap, and Total Blackout wears every primary-route device by ${RULES.blackoutWear}. Event Horizon raises two Quarantine Drones: each one alive adds ${RULES.addBreakBonus} to the break and doubles the cost of scrubbing. Keep a second channel live, scrub what it plants, and buffer or burst through Total Blackout.`,
    defeated: "The isolation shell falls silent. Inside it, the delivery lights are still on.",
  },
  // ---------------------------------------------------------------- v4 leaders
  foreman: {
    name: "Scrap Foreman", title: "Condemns what it cannot cut",
    motive: "A yard foreman that condemns hardware it cannot cut, and never files the paperwork that would spare it. It still walks the floor for an inspection nobody scheduled.",
    pattern: ENEMIES.foreman.pattern.map(p => p.kind),
    telegraphs: {
      overload: "The foreman chalks a mark on your most worn device. Condemned.",
      install: "A spike is driven into the deck beside the hardware it condemned.",
      strike: "The piston hammer rises. Every spike it planted makes it heavier.",
    },
    counterplay: `Repair between its overloads; scrub a Spike or move its neighbour out of the ${RULES.reach.toFixed(1)} ring; a Server Rack takes the wear; a cabled honeypot decoys the overload and bites. While one of its Spikes stands, its strikes deal +${RULES.foremanSpikeBonus}.`,
    defeated: "The hammer rests. The condemned list goes unsigned, forever.",
  },
  nest: {
    name: "Static Nest", title: "Every hatchling holds a line down",
    motive: "A brood chamber for retry drones. Every hatchling holds one line down until the exchange answers, and the exchange has not answered since the Blackout.",
    pattern: ENEMIES.nest.pattern.map(p => p.kind),
    telegraphs: {
      install: "Something stirs in the nest and crawls toward your table to hold a line down.",
      strike: "The nest bites with every hatchling that holds your ground.",
    },
    counterplay: `After it acts it heals ${RULES.nestHeal} per installation, and its strike deals +${RULES.nestStrikeBonus} per installation. Keep a firewall beside the busiest band, let a honeypot decoy the Jammer and bite the Tap on arrival, or Purge the band. Its planting turns deal nothing, so race it.`,
    defeated: "The nest goes quiet. For once, every line it held is answered.",
  },
  demolition: {
    name: "Demolition Engine", title: "Counts down while you build",
    motive: "A decommissioning engine that counts down while you build, because that is what the order said. It was sent to bring down a relay the wardens sealed, and the recall never reached it.",
    pattern: ENEMIES.demolition.pattern.map(p => p.kind),
    telegraphs: {
      install: "A breaker charge is set beside your busiest device. The countdown begins.",
      strike: "The piston slams forward. An armed charge makes it bolder.",
      overload: "The treads grind over a device's housing and leave it worn.",
    },
    counterplay: `Scrub the charge (it has ${RULES.installationIntegrity.breaker} integrity), relocate out of its ${RULES.reach.toFixed(1)} ring, or break it with a Demolition Charge; a Phantom Node absorbs the placement. While a charge is armed its strikes deal +${RULES.demolitionArmedBonus}.`,
    defeated: "The countdown lamp dims to nothing. The relay it came for will stand another night.",
  },
  blight: {
    name: "Root Blight", title: "Anchors the rust where it grew",
    motive: "A corrosion beacon that remembers where it grew and anchors the rust so it cannot be washed away. Its maintenance log still lists it as a soil sensor.",
    pattern: ENEMIES.blight.pattern.map(p => p.kind),
    telegraphs: {
      corrupt: "Orange oxide blooms across a band of your table.",
      install: "An anchor spike is driven into the corroded ground. That rust will not wash out.",
      breach: "Its roots pull at your boundary; every corroded band feeds them.",
    },
    counterplay: `Purge the band before the Anchor lands, or purge once to break the Anchor and again for the field; Quarantine Rule cancels a corrosion; a Demolition Charge breaks the Anchor; or empty the band. While an Anchor stands, its breaches deal +${RULES.blightAnchorBonus} per corroded band.`,
    defeated: "The roots let go of the deck plate. The rust stays, but it stops growing.",
  },
  // ---------------------------------------------------------------- v4 escorts
  "spark-mite": {
    name: "Spark Mite", title: "Bites whatever the others bite",
    motive: "A swarm of cleaning mites that learned to bite whatever the others bite. They were built to strip corrosion from contacts; with the contacts gone, they strip anything that still carries current.",
    pattern: ENEMIES["spark-mite"].pattern.map(p => p.kind),
    telegraphs: {
      strike: "Its mandible sparks. Every other machine on the rail makes the bite hungrier.",
      sever: "The mite gnaws at a live cable, as if scrubbing it clean.",
      dormant: "The mite twitches in place, waiting for its turn.",
    },
    counterplay: `Its strike deals +${RULES.swarmBonus} for every other living hostile. An online firewall blocks ${RULES.firewallStrikeBlock} of every strike, so one or two firewalls zero a lone Mite; Harden and Grounded Core do the same. Kill the others and it is only chip.`,
    defeated: "The spark goes out. The mite curls up like any spent tool.",
  },
  splicer: {
    name: "Splicer", title: "Still cuts cables to repair them",
    motive: "A splicing rig that still cuts cables to repair them, twice at a time when a foreman is watching. Its work order says the line is faulty, and nobody ever closed the ticket.",
    pattern: ENEMIES.splicer.pattern.map(p => p.kind),
    telegraphs: {
      sever: "The shears open over your cables. With a leader watching, it cuts two.",
      strike: "It lashes out with a severed cable end.",
      dormant: "The shears idle, half open.",
    },
    counterplay: `While a leader lives its cut severs ${RULES.twinCut} cables. Failover Policy cancels the whole action and Hot Patch clears every cut; Armored Fiber or VXLAN on the primary route and a second channel keep you transmitting. A cabled honeypot absorbs one cut and bites. Kill the leader and it cuts one.`,
    defeated: "The shears close for the last time. The ticket stays open; the line stays whole.",
  },
  "relay-drone": {
    name: "Relay Drone", title: "Amplifies the nearest authority",
    motive: "A repeater drone that amplifies the nearest authority, whoever that is now. It was made to carry a supervisor's voice across the station, and it cannot tell a supervisor from a threat.",
    pattern: ENEMIES["relay-drone"].pattern.map(p => p.kind),
    telegraphs: {
      strike: "A static jab crackles off its dish.",
      dormant: "Its dish tilts toward the leader, listening.",
    },
    counterplay: `While it lives the leader's strikes deal +${RULES.uplinkBonus}. It carries the smallest share, so focus it first; an online firewall blocks ${RULES.firewallStrikeBlock} of every strike, which cancels the uplink exactly; the Ghost can aim a release at it.`,
    defeated: "The dish droops. The leader's orders suddenly sound very far away.",
  },
  "ward-node": {
    name: "Ward Node", title: "Guards a machine that needs no guarding",
    motive: "A shielding relay assigned to protect a machine that no longer needs protecting from anything but you. Its lens still projects the barrier the wardens asked for the night they closed the backbone.",
    pattern: ENEMIES["ward-node"].pattern.map(p => p.kind),
    telegraphs: {
      jam: "Its lens seals a device it has decided is dangerous.",
      dormant: "The shield disc hums in front of the leader.",
    },
    counterplay: `While it lives the leader has plating ${RULES.wardPlating} on top of its own armor. Any online firewall bypasses the plating; merge every delivery on the leader so it is paid once, or use Spearhead. Purge Field or Hot Patch answers the seal.`,
    defeated: "The shield disc flickers out. Behind it there was never anything to guard.",
  },
  "tap-spinner": {
    name: "Tap Spinner", title: "Taps the lines it once tested",
    motive: "A spider-legged sampler that once tapped lines for diagnostics and now taps them for food. Every test it runs ends with a siphon left behind.",
    pattern: ENEMIES["tap-spinner"].pattern.map(p => p.kind),
    telegraphs: {
      install: "The spinner pays out a siphon line toward an open socket.",
      strike: "A barbed foreleg flicks toward your terminals.",
      dormant: "It hangs on its line, counting taps.",
    },
    counterplay: `After it acts it heals ${RULES.webHeal} per Siphon Tap on the table. Scrub a Tap for ${RULES.scrubCost} or Purge the band; a cabled honeypot's ring kills Taps as they land. Kill it before the third Tap.`,
    defeated: "The spool stops turning. The last line it spun hangs empty.",
  },
  "glass-echo": {
    name: "Glass Echo", title: "Repeats the last order it heard",
    motive: "A cracked bell that repeats the last order it heard, louder as it breaks. The Choir sang that order once; the echo never learned how to stop.",
    pattern: ENEMIES["glass-echo"].pattern.map(p => p.kind),
    telegraphs: {
      corrupt: "The bell rings the refrain back, and a band on your route goes quiet.",
      strike: "A shard of the bell's rim spins free.",
      dormant: "The echo holds its note.",
    },
    counterplay: `When it dies the leader's next strike or breach deals +${RULES.lastEchoBonus}. Kill it on a turn when the leader's next intent is a fault or a field, or kill both in one transmission with overflow. Quarantine Rule cancels its refrain.`,
    defeated: "The bell cracks through. Its last echo goes looking for the leader.",
  },
  "rigger-drone": {
    name: "Rigger Drone", title: "Braces nothing now but its spikes",
    motive: "A rigging automaton that once braced failing racks now drives its spikes into anything that still hums. Its work order says secure the floor, and it is securing it.",
    pattern: ENEMIES["rigger-drone"].pattern.map(p => p.kind),
    telegraphs: {
      install: "The crane arm swings a spike toward the hardware the leader is watching.",
      strike: "It pries at your table with its crowbar arm.",
      dormant: "The drone reloads its spike rack.",
    },
    counterplay: `While a leader lives its Spikes arrive with integrity ${RULES.riggedSpikeIntegrity}. Kill it before its second Spike, or kill the leader so new Spikes drop to ${RULES.installationIntegrity.spike}. Scrub, repair, a Server Rack, or relocate the neighbour out of the ${RULES.reach.toFixed(1)} ring.`,
    defeated: "The crane arm locks in place. The floor is as secure as it will ever be.",
  },
  // ---------------------------------------------------------------- v4 guardian adds
  "gate-warden": {
    name: "Gate Warden", title: "A piece of the gate that answers the crown",
    motive: "Two portcullis engines that answer only the crown. When the Regent rises they step out of the gate itself, keyholes lit, to hold the threshold one more time.",
    pattern: ENEMIES["gate-warden"].pattern.map(p => p.kind),
    telegraphs: { strike: "The warden takes one iron step toward you." },
    counterplay: `Each living Warden adds ${RULES.addBreakBonus} to the Regent's break threshold. They have no armor: spread your deliveries on the charge turn to drop one, or brace and break the Regent anyway.`,
    defeated: "The warden folds back into a piece of the gate. Its keyhole goes dark.",
  },
  chorister: {
    name: "Chorister", title: "One voice the Choir keeps",
    motive: "Glass mouths that hold the note the Choir cannot. Each one keeps a single voice sealed inside, and it will not let that voice go.",
    pattern: ENEMIES.chorister.pattern.map(p => p.kind),
    telegraphs: { strike: "The chorister's note shivers through your boundary; on the first breath it scatters static into your deck." },
    counterplay: `Each living Chorister adds ${RULES.addBreakBonus} to the break and raises the Choir's plating to ${RULES.choirAddPlating}. Kill them on the charge turn, or keep a firewall online and break through anyway.`,
    defeated: "The seal cracks. One voice slips out of the glass and does not come back.",
  },
  "quarantine-drone": {
    name: "Quarantine Drone", title: "Finishes the shell the Core began",
    motive: "Sealing drones that finish the shell the Core began. They still carry the quarantine order in their clamps: close every route until a safe delivery is confirmed.",
    pattern: ENEMIES["quarantine-drone"].pattern.map(p => p.kind),
    telegraphs: {
      install: "The drone lowers a jammer beside your primary router.",
      strike: "Its clamps close on your boundary.",
    },
    counterplay: `Each living Drone adds ${RULES.addBreakBonus} to the break, and while one lives scrubbing costs ${RULES.quarantineScrubCost} per point. ${RULES.addHealth["quarantine-drone"]} health and no armor: kill them first on the charge turn, or Purge the Jammers they leave.`,
    defeated: "The clamps open. Somewhere behind the shell, a route is marked safe.",
  },
};

// ---------------------------------------------------------------- v4 · designations and messages

/** One sentence per designation, in the archive's voice (firmware revisions and cargo manifests). */
export function designationFlavour(id: DesignationId): string {
  return DESIGNATIONS[id].flavour;
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** The entrance line for a designation: "NESTING · its first action also plants a Siphon Tap at the forecast socket"
 * (ribbon · rule, first letter lowered, no final period). A ribbon the chart hid behind interference uses the
 * same words; the plan's `revealed` list tells the interface to re-engrave the ribbon with its cue. */
export function designationEntranceLine(id: DesignationId, stage: number): string {
  return `${DESIGNATIONS[id].ribbon} · ${lowerFirst(designationRule(id, stage)).replace(/\.$/, "")}`;
}

/** The entrance warning for an announced arrival: "SIGNAL DETECTED · a Splicer arrives in 2 actions". */
export function reinforcementEntranceLine(name: string, count: number): string {
  const article = /^[aeiou]/i.test(name) ? "an" : "a";
  return `SIGNAL DETECTED · ${article} ${name} arrives in ${count} action${count === 1 ? "" : "s"}`;
}

/** The Victory kicker for a fight (section 13.6), members leader first (roomScout order):
 * "Static Nest silenced", "Static Nest and escort silenced", "Spark Mite and Splicer silenced". */
export function silencedLine(members: readonly string[]): string {
  const names = members.map(hostileName);
  if (names.length <= 1) return `${names[0] ?? "The hostile"} silenced`;
  if (ENEMIES[members[0]]?.kind === "hostile") return `${names[0]} and ${members.length === 2 ? "escort" : "escorts"} silenced`;
  return `${names.join(" and ")} silenced`;
}

export interface MessageFragment {
  /** Italic sender line of the message dialog. */
  sender: string;
  /** One recovered packet from the archive's queue. */
  text: string;
}

/** Undelivered messages: real fragments of the archive's queue, leaking as its keepers fall. */
export const MESSAGE_FRAGMENTS: readonly MessageFragment[] = [
  { sender: "Relay Seven · night shift", text: "Landed safe. Tell Mum the seat by the window was worth it." },
  { sender: "Hollow Exchange · outbound queue", text: "Repair request 4471: the fan in rack C is still rattling. Low priority. I'll look at it after the storm." },
  { sender: "Evacuation desk · deck three", text: "Your sister is on the second shuttle. She kept your jacket." },
  { sender: "Warden crew · gate log", text: "Closing the backbone now. If anyone reads this, we always meant to open it again." },
  { sender: "Copper Reach sorting office", text: "Parcel held for collection. Contents: one music box, still wound." },
  { sender: "Cathedral bell-ringer", text: "I tuned the north bell a quarter tone flat, so you would know it was me." },
  { sender: "Unknown sender · priority low", text: "Is anyone still on this frequency? I'll try again tomorrow at the same time." },
  { sender: "Maintenance roster", text: "Swapped shifts with Imre. I owe him a coffee and a working coolant pump." },
  { sender: "Core archive · retained", text: "Delivery attempt 11,204 failed. Message retained. Not discarded." },
  { sender: "Dock twelve · harbour master", text: "Your berth is open for the return trip. The lights stay on." },
  { sender: "Medical bay · level five", text: "The results are fine. Stop worrying and come home." },
  { sender: "Glass Cathedral · choir loft", text: "Rehearsal moved to Thursday. Bring the old hymn book, the one with your notes in the margins." },
  { sender: "Station school · room two", text: "The class drew the relays today. Almost all of them drew the lights still on." },
  { sender: "A. Varga · cable crew", text: "Left you the good crimper in the second drawer. Don't lend it to Pell." },
  { sender: "Blackout Heart · last acknowledgement", text: "If this arrives, the route works. Please answer, even with one word." },
  { sender: "Outer relay · automated", text: "Heartbeat. Heartbeat. Heartbeat. Is anyone still keeping count?" },
  { sender: "Quarantine office · stamped", text: "Hold all deliveries until a safe route is confirmed. Signed, and I am sorry." },
  { sender: "Bench four · the warming lamp", text: "Kettle's on the shelf. Whoever finds this, take a cup before you go on." },
];

export function enemyStory(id: string): EnemyStory | undefined {
  return Object.hasOwn(ENEMY_STORIES, id)
    ? ENEMY_STORIES[id as StoryEnemyId]
    : undefined;
}

export interface ArchetypeStory {
  title: string;
  story: string;
  epilogue: string;
}

export const ARCHETYPE_STORIES: Record<Archetype, ArchetypeStory> = {
  architect: {
    title: "MAKE A WAY THROUGH",
    story:
      "You built the return routes before the ring broke. With your Hot Swap kit and the old plans, you have come back to give the waiting traffic somewhere to go.",
    epilogue: "This time, your route carries a reply all the way home.",
  },
  warden: {
    title: "HOLD WHAT REMAINS",
    story:
      "Your crew closed the backbone to save the archive. Every blow the boundary absorbs now becomes pressure you can send back. Bring the messages home.",
    epilogue: "The boundary opens. Everything you stayed to protect passes through.",
  },
  ghost: {
    title: "FIND THE HIDDEN PATH",
    story:
      "You recovered messages from the relays everyone else abandoned. One in your Deep Cache is addressed to you; first, you must find a way to deliver the rest.",
    epilogue: "At the end of the queue, your own message arrives: Made it down. Your turn.",
  },
};

export interface SanctuaryStory {
  title: string;
  description: string;
  fragment: string;
}

export const SANCTUARY_STORIES: readonly SanctuaryStory[] = [
  {
    title: "The warming bench",
    description:
      "A work lamp shines on a repair left half finished. The tools are still laid out in order, as if their owner might return for the next shift.",
    fragment: "Use what you need. Leave a working lamp.",
  },
  {
    title: "The keeper's drawer",
    description:
      "Someone sorted the spare parts by what they could still save. Beside the drawer, a maintenance log ends with a list of names and the words: all accounted for.",
    fragment: "A useful thing deserves another journey.",
  },
  {
    title: "The last lamp",
    description:
      "Through the glass, the quarantine gate turns without a sound. You clear a little space on the bench; whatever you leave here may help whoever follows.",
    fragment: "There is room for one more at the bench.",
  },
];

/** The current map has one early sanctuary and two late sanctuary branches. */
export function sanctuaryStory(floor: number, lane = 0): SanctuaryStory {
  return SANCTUARY_STORIES[floor < 5 ? 0 : lane < 1 ? 1 : 2];
}

export interface OutcomeStory {
  eyebrow: string;
  title: string;
  description: string;
}

export const OUTCOMES: Record<"won" | "lost", OutcomeStory> = {
  won: {
    eyebrow: "THE BACKBONE LIVES AGAIN",
    title: "And then, an answer.",
    description:
      "The isolation shell opens. Across the relays, the messages it sheltered begin their final journey: arrivals, apologies, a promise kept late. From somewhere below the broken ring, a new acknowledgement returns. Someone is still there.",
  },
  lost: {
    eyebrow: "THIS ROUTE GOES DARK",
    title: "Not every route makes it home.",
    description:
      "Your transmission fades before the last gate opens. Behind it, the Core keeps the undelivered messages safe. They are still waiting; another expedition may yet find a way through.",
  },
};
