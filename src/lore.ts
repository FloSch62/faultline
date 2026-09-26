/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
/** Lore: the illustrated canon of the Line (docs/lore.md), opened from the main menu. It is laid out like the
 * Handbook, with the two lore films as its first chapter. The ending chapter stays sealed until a keeper has
 * reached the Heart once. Pure markup: main.ts routes the chapter buttons and the film play buttons. */
import { asset, esc } from "./ui.ts";
import { icon } from "./tutorial/icons.ts";

export interface LoreFilm {
  id: string;
  numeral: string;
  title: string;
  runtime: string;
  poster: string;
  summary: string;
  /** A YouTube link or video id; empty while the film is not published yet. */
  youtube: string;
}

export const LORE_FILMS: readonly LoreFilm[] = [
  {
    id: "night-of-the-fault", numeral: "I", title: "The Night of the Fault", runtime: "3:08",
    poster: "art/lore/outer-relays-break.webp", youtube: "https://youtu.be/nOozrWGKD9A",
    summary: "What happened to the Line: the builders nobody remembers, the night of the Fault, the quarantine, and the one lamp that still lights once a day.",
  },
  {
    id: "whoever-answers", numeral: "II", title: "Whoever Answers", runtime: "3:04",
    poster: "art/lore/the-operator.webp", youtube: "https://youtu.be/kFDv-0kHv8g",
    summary: "Who sends the keepers, what they cross to reach the Heart, and who has been calling up from below the clouds every evening for thirty-one years.",
  },
];

/** The video id in a YouTube link (watch, youtu.be, embed, shorts or live) or a bare id; "" when there is none. */
export function youtubeId(value: string): string {
  const text = value.trim();
  if (/^[\w-]{11}$/.test(text)) return text;
  const match = text.match(/(?:youtu\.be\/|[?&]v=|\/(?:embed|shorts|live)\/)([\w-]{11})/);
  return match ? match[1] : "";
}

/** The privacy-enhanced player for a film, autoplaying because the player has just asked for it. */
export function filmEmbed(film: LoreFilm): string {
  const id = youtubeId(film.youtube);
  if (!id) return "";
  return `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1" title="${esc(film.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
}

const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV"];

const art = (name: string) => asset(`art/lore/${name}.webp`);
const plate = (name: string, alt: string, caption = "") =>
  `<figure class="hb-figure lore-plate"><img src="${art(name)}" alt="${esc(alt)}" loading="lazy" decoding="async">${caption ? `<figcaption>${caption}</figcaption>` : ""}</figure>`;
const pair = (a: string, b: string) => `<div class="lore-pair">${a}${b}</div>`;
const quote = (text: string, cite: string) => `<blockquote class="lore-quote">${text}<cite>${cite}</cite></blockquote>`;
const packet = (from: string, text: string) => `<div class="lore-packet"><span>${from}</span><p>${text}</p></div>`;
const sub = (title: string) => `<h4 class="hb-subhead">${title}</h4>`;

interface LoreChapter {
  id: string;
  title: string;
  icon: string;
  /** Sealed chapters open only after a keeper has reached the Heart. */
  sealed?: boolean;
  body: () => string;
}

function filmsBody(): string {
  const films = LORE_FILMS.map(film => {
    const ready = !!youtubeId(film.youtube);
    return `<figure class="lore-film" data-film="${film.id}">
      <div class="lore-screen">
        <img src="${asset(film.poster)}" alt="${esc(`${film.title}, a still from the film`)}" loading="lazy" decoding="async">
        ${ready
          ? `<button class="lore-play" data-lore-play="${film.id}" aria-label="Play ${esc(film.title)}">${icon("play", 28)}</button>`
          : `<span class="lore-soon">Coming soon</span>`}
      </div>
      <figcaption><span class="lore-film-mark">Film ${film.numeral} · ${film.runtime}</span><strong>${film.title}</strong><p>${film.summary}</p></figcaption>
    </figure>`;
  }).join("");
  return `<p class="hb-lead">Two short films tell the story of the Line: first what happened to it, then who answers when it calls.</p>
    <div class="lore-films">${films}</div>
    <p class="lore-credit">Paintings made with Krea 2, music made with YuE2.</p>`;
}

export const LORE_CHAPTERS: readonly LoreChapter[] = [
  { id: "films", title: "The Films", icon: "play", body: filmsBody },
  {
    id: "line", title: "The Line", icon: "link", body: () => `
      <p class="hb-lead">A world wrapped in clouds wears a ring of relays at the edge of space. Its people call it <strong>the Line</strong>; the wardens' manuals call it the backbone.</p>
      ${plate("line-at-dawn", "A ring of relay machinery arcing over a cloud-wrapped world at dawn, held up on dark spires.", "The Line at dawn. The spires hold it up; the cloud floor never clears.")}
      <p>The Line is not a station you fly to. It is held up. Its <strong>spires</strong> rise from the ground through the cloud sea to the ring, so wide at the base that people below mistake them for mountains. Lifts and freight cars run inside them; containers, cranes and patched platforms cling to their sides wherever the linefolk needed room.</p>
      <p>Beneath the ring lies the <strong>cloud floor</strong>, and beneath that the Ground: the world itself. For as long as anyone remembers, almost nobody went down. The oldest legible page of the Runbook says <em>do not route below the cloud floor until the ground reports ready</em>. Nobody knew what that meant, so they obeyed it.</p>
      ${sub("The Faultline")}
      <p>The Line broke at its outer relays, and the break can still be seen: a stretch of dark in the arc of lights. From the Ground, on the rare clear nights, the Line looks like a string of lamps with a gap in it. People below call that gap the Faultline. So do the linefolk, now.</p>
      ${plate("faultline-from-below", "From the wet hills of the Ground at night, an arc of lights crosses the sky with a dark gap in it.", "The Faultline, seen from below.")}`,
  },
  {
    id: "first-shift", title: "Shift One", icon: "field", body: () => `
      <p class="hb-lead">The Runbook's oldest pages are signed with shift numbers, not names. The earliest is <strong>Shift One</strong>, so the builders are called the First Shift: the only name they left.</p>
      ${pair(plate("raising-the-spires", "An engraved plate: cranes raising ring segments on a spire above the clouds.", "Raising the spires."), plate("laying-the-line", "An engraved plate: hooded figures laying fibre along a gantry, with route diagrams in the margins.", "Laying the Line."))}
      <p>There are no portraits of them, only engraved plates: small hooded figures laying cable and raising spires, drawn with the same care as the diagrams around them. They left the Line and the machines that mend it. They left the Runbook, every procedure from resetting a relay to running an evacuation. They left the <strong>Record</strong>, every message ever sent on the Line and the name of everyone born on it. And they left one empty page: the Runbook's last procedure is titled <em>Handover</em>, and it has no steps.</p>
      ${sub("Upstream")}
      <p>Every route table on the Line ends with the same entry, the Last Resort: <em>whatever you do not know how to reach, send outward</em>. It ends at the outer relays, great ring gates facing away from the world. For as long as anyone remembered, whatever could not be delivered was sent into the dark through them. The Runbook calls whatever lies out there <strong>upstream</strong>. Nothing upstream ever answered.</p>
      ${plate("outer-relay", "An outer relay ring gate aimed at the stars, a faint beam leaving it.", "An outer relay, aimed upstream.")}`,
  },
  {
    id: "keeping", title: "The Keeping", icon: "book", body: () => `
      <p class="hb-lead">The linefolk did not know whether they were the First Shift's children or their guests. They kept the machine running because the book told them how, and over the generations because the work became who they were.</p>
      ${plate("shift-change", "Engineers changing shift at ivory relay racks in a warm, lamp-lit hall.", "Shift change in a relay hall, before the Blackout.")}
      <p>Life ran on <strong>shifts</strong>, not days. The night shift kept the lamps on while everyone else slept, and <em>leave the lamp on for the next shift</em> was a blessing. Once an hour the Heart sent a <strong>heartbeat</strong> around the Line, and the Glass Cathedral rang one bell to match. When a child was born, their parents sent one message to the Record, a name and a line of hope. An unanswered message was the saddest thing they knew.</p>
      ${quote("Hello. — I hear you. — I hear you hear me.", "The greeting, learned before reading")}
      ${pair(plate("glass-cathedral-singing", "The Glass Cathedral, violet glass halls and great bells, people listening.", "The glass halls sang when traffic passed."), plate("the-greeting", "A teacher and children at a small brass relay terminal.", "Learning the greeting."))}
      <p><strong>Architects</strong> drew routes, <strong>wardens</strong> held the boundaries and the Heart's keys, <strong>operators</strong> ran the switchboards, and <strong>bellmakers</strong> could hear a failing route before any instrument showed it. Every key and badge on the Line was signed by the Heart and renewed each year. The machines obey anyone who carries a key they trust. Nobody gave that much thought until the Heart stopped signing.</p>`,
  },
  {
    id: "fault", title: "The Night of the Fault", icon: "warning", body: () => `
      <p class="hb-lead">Thirty-one years ago the outer relays broke. The Night Shift later pieced the night together from gate logs, bell records and the messages in the queue.</p>
      ${plate("outer-relays-break", "A ring gate fracturing, debris spilling into the white glare of vacuum.", "Hour 0. The wardens' log says debris. The bellmakers say the relays were answered.")}
      <ol class="lore-night">
        <li><b>Hour 0</b><span>The great ring gates of the Copper Reach tear apart. The Line shudders along its whole length.</span></li>
        <li><b>Hour 1</b><span>The wardens fear a break at one point means breaks at all of them, and order the Line emptied down the spires. The freight lifts, the <em>shuttles</em>, run all night into the cloud sea. The ring holds, as it turned out, but nobody could have known that.</span></li>
        <li><b>Hours 1–5</b><span>Everyone boarding sends a message. The evacuation desk at Relay Seven, one switchboard with one operator, marks every one of them <strong>must arrive</strong>, so that no goodbye is lost. A message marked that way may never be dropped.</span></li>
        <li><b>Hours 2–9</b><span>With the outer relays gone, the return routes send each message home to try again, and home sends it out again. These messages cannot age out. The circling traffic becomes the Null Storm.</span></li>
        <li><b>Hour 10</b><span>The storm reaches the Heart and begins overwriting the Record.</span></li>
        <li><b>Hour 11</b><span>Warden-Commander Harrow writes the quarantine order. The last switch lies at the end of a conduit too narrow for a grown warden in armour, so the youngest cadet throws it. She is seventeen.</span></li>
      </ol>
      ${pair(plate("second-shuttle", "A young woman in a teal work jacket looks back from a crowded lift doorway.", "Boarding the second shuttle."), plate("evacuation-desk", "An operator at a vast switchboard of amber lamps, a crowd behind her.", "The evacuation desk. Every goodbye marked <em>must arrive</em>."))}
      ${pair(plate("null-storm", "Loops of pale light spiralling through a relay hall.", "The Null Storm."), plate("last-switch", "A young cadet in a narrow conduit reaching for a brass lever.", "The last switch."))}
      ${quote("Close the backbone. Hold all deliveries. Release nothing until a safe route is confirmed. Signed, and I am sorry.", "The quarantine order")}
      <p>The Heart sealed itself and took in every message it could still reach. Its machines cut every route the storm could travel. The storm starved, and the archive was saved. But the wardens' own route to the Heart ran through the cables the quarantine cut. They were locked out by their own order, and could never send the all-clear.</p>`,
  },
  {
    id: "care", title: "Made of Care", icon: "heart", body: () => `
      <p class="hb-lead">Nobody broke the Line on purpose. The Blackout took four acts of care, each reasonable on its own.</p>
      <ol class="lore-acts">
        <li><strong>The return routes</strong>, built so that nothing would ever be lost.</li>
        <li><strong>The must-arrive mark</strong>, given so that every goodbye would reach someone.</li>
        <li><strong>The quarantine</strong>, ordered so that the record of everyone who ever lived would survive.</li>
        <li><strong>The Heart's obedience</strong>, holding every message rather than letting one be destroyed.</li>
      </ol>
      ${plate("storm-reaches-the-heart", "Storm light pouring into the golden archive, cells flickering red.", "Hour 10. The storm reaches the Heart.")}
      <p>Each one held on to something. Together they held the world in the dark. That is why the word <strong>keeper</strong> cuts both ways: everyone who caused the Blackout was keeping something. The people now called keepers set out to finish that keeping properly, by delivering what everyone else only held.</p>
      <p>The machines follow the same pattern. None of them is evil. Each is a duty that outlived its reason.</p>`,
  },
  {
    id: "silence", title: "The Silence", icon: "eye", body: () => `
      <p class="hb-lead">The Line is dark but for pockets. Within a year of the sealing every key had expired, and every machine now meets every human as an unknown sender.</p>
      ${plate("iron-regent-sealed", "The Iron Regent standing in the rusted Copper Gate, still and dusty.", "The Iron Regent has held the Copper Gate for thirty-one years.")}
      <p>Cut off from the Heart and from each other, the machines keep executing their last tasks in a world that no longer needs them. Leeches hoard traffic they cannot deliver. Wraiths still cut every fresh route. Sentinels check keys that expired thirty years ago. They repair themselves, route around damage, and do not stop.</p>
      ${sub("The Core's bind")}
      <p>The wardens' order says <em>hold everything until a safe route is confirmed</em>. Beneath it lies an older rule, written into the Heart by the First Shift: <em>a fault that cannot be mended must be escalated to a keeper</em>. So each day the Core does the only two things both rules allow. It tries once to deliver the queue, and fails. And it pages.</p>
      <p class="lore-log">Delivery attempt 11,204 · failed · message retained · not discarded</p>
      ${plate("the-queue", "A vast dark space filled with countless small glowing message-lights.", "The queue. Arrival notices, apologies, shift swaps, a music box held for collection.")}
      <p>When a keeper reaches it, the Core must defend the shell with everything it has, because the order says hold. But it sent for that keeper. A route that survives its defences is a safe route by definition. It cannot be ordered to open. It can only be shown a route that holds.</p>`,
  },
  {
    id: "page", title: "Who Sends the Keepers", icon: "hint", body: () => `
      <p class="hb-lead">Once a day a signal too small to carry any message leaves the sealed shell and lights one lamp on the old board at Relay Seven. The label beneath it reads <strong>KEEPER</strong>.</p>
      ${plate("relay-seven-board", "An ancient switchboard in darkness with one amber lamp lit above an engraved plate.", "Relay Seven. The lamp has lit once a day for thirty-one years.")}
      <p>The few hundred who did not go down call themselves the <strong>Night Shift</strong>: wardens who would not leave the gate, engineers who would not leave their machines, people too old or too stubborn, people who missed the last shuttle or were waiting for a message that never came. There are fewer every year.</p>
      ${pair(plate("the-operator", "An old woman with white hair and a brass headset, lit amber by a lamp.", "The Operator."), plate("night-shift", "A small group in patched coats around a warming lamp.", "The Night Shift."))}
      <p>The page lands on the board of the <strong>Operator</strong>, who has run it since before the Blackout. If she has another name, it is in the Record, and the Record is sealed. She answers every page the same way. She lifts the headset, looks at whoever is in the room, and asks one question.</p>
      ${quote("Who'll take it?", "The Operator")}
      <p>When someone steps forward, she plugs a cord into the jack under the lamp and says <em>go ahead</em>. The expedition that follows is a connection built hop by hop from that jack to the Heart. When a keeper falls, the line goes quiet, and the next day the lamp lights again.</p>
      ${plate("go-ahead", "A gloved hand plugging a brass cord into a jack; a thread of teal light runs away along the cables.", "Go ahead.")}
      ${sub("Whoever answers")}
      <p>The first Night Shift argued about that label for a long time. Did <em>keeper</em> mean a particular person, an office, a descendant of Shift One? They settled it the way linefolk settle things, by what works: whoever answers the page becomes the keeper. The benches along the route are what the ones before left for the next: a lamp left on, tools in order, a kettle on the shelf.</p>`,
  },
  {
    id: "keepers", title: "The Keepers", icon: "shield", body: () => `
      <p class="hb-lead">Many have answered. Three are ready to go now.</p>
      <div class="lore-keepers">
        <section><img src="${asset("art/keepers/architect.webp")}" alt="The Architect in ivory-and-brass harness with a teal router crystal." loading="lazy"><h5>The Architect</h5><p>Thirty-one years ago he designed the return routes, so that nothing undeliverable would ever be lost. They worked perfectly, and they are the loop the storm circled in. He has spent three decades redrawing the Line, looking for the route he should have built.</p></section>
        <section><img src="${asset("art/keepers/warden.webp")}" alt="The Warden in chipped ivory armour behind a firewall shield." loading="lazy"><h5>The Warden</h5><p>She was the cadet who crawled down the conduit and threw the last switch. For thirty-one years she has guarded a door she closed herself and cannot open. She still believes the order was right, and that it should be ended by someone who knows why it was given.</p></section>
        <section><img src="${asset("art/keepers/ghost.webp")}" alt="The Ghost, hooded, in a smooth ivory mask with a narrow visor." loading="lazy"><h5>The Ghost</h5><p>Nobody on the Night Shift has seen the Ghost's face. The mask hears dead relays. The Ghost recovers traffic nobody else can find, and has been looking for one message for thirty-one years. It is still in the queue.</p></section>
      </div>`,
  },
  {
    id: "road", title: "The Road", icon: "map", body: () => `
      <p class="hb-lead">Each guardian is a test, not a monster. Each refuses passage until the route in front of it has the quality its ancient job demands.</p>
      ${sub("I · The Copper Reach")}
      <p>The Line's frontier: lift docks, foundries, relay yards, and the outer relays themselves, now a kingdom of rust. The <strong>Iron Regent</strong> was its border gateway; its crown is its routing authority. When the ring broke it sealed the Copper Gate with its own armour. It keeps one law: <em>no passage without proof of a second way home.</em></p>
      ${pair(plate("copper-reach", "A keeper paying out glowing teal cable across rusted gantries between containers.", "Laying a route through the Reach."), plate("copper-gate-opens", "Massive copper doors parting onto violet light.", "Build two roads, and the gate opens."))}
      ${sub("II · The Glass Cathedral")}
      <p>Where the Line sang. One bellmaker tuned the north bell a quarter tone flat so that someone she loved would know it was her. During the Fault the announcement engine repeated the evacuation order until the glass memorised it. Now the <strong>Hollow Choir</strong> seals every unanswered voice in a bell and will not let one go. <em>One voice is an echo; many voices can break the glass.</em></p>
      ${plate("hollow-choir", "A ring of porcelain masks around a great bell in the dark cathedral.", "The Hollow Choir.")}
      ${sub("III · The Blackout Heart")}
      <p>A sphere of archive machinery burning ember red around the shell the Core closed thirty-one years ago. The <strong>Blackout Core</strong> defends in the order the Runbook prescribes for a quarantine: cut, breach, jam, strike. Defeating it breaks the isolation machinery, not the archive. The archive was never the enemy.</p>
      ${plate("a-route-that-holds", "A thread of teal route light reaching the Blackout Core's spiral shell.", "A route that holds.")}`,
  },
  {
    id: "below", title: "Below", icon: "chevron", body: () => `
      <p class="hb-lead">About three hundred thousand people went down in one night, into a world their people had not lived on for longer than memory. They lived.</p>
      ${plate("settlement-below", "A settlement at the foot of a colossal spire at dusk: lift cars as homes, rain-soaked gardens.", "A settlement at the foot of a spire.")}
      <p>The Ground is wet, green and dark under its cloud: fern valleys, black stone, rain, and the feet of the spires rising like mountains into the cloud ceiling. Settlements grew around those feet out of what came down, lift cars made into houses and radio masts built from lift parts. Their children have seen the Line only as an arc of lights on rare clear nights, with a gap in it.</p>
      <p>They called up, and nobody answered. The lifts stopped where they were, because the machines at the spire feet no longer knew anyone. Everything they sent upward went into the queue. One of them never stopped.</p>
      ${plate("same-time-every-evening", "A grey-haired woman in a faded teal work jacket at a radio built from a lift panel.", "Every evening at the same time.")}
      ${packet("Unknown sender · priority low", "Is anyone still on this frequency? I'll try again tomorrow at the same time.")}`,
  },
  {
    id: "answer", title: "The Answer", icon: "crown", sealed: true, body: () => `
      <p class="hb-lead">When a keeper's route holds, the Core's condition is met at last. The shell opens, and thirty-one years of messages leave at once.</p>
      ${pair(plate("the-shell-opens", "The shell's iris plates parting, golden light flooding out.", "The shell opens."), plate("river-of-messages", "Streams of golden light racing along the ring and down the spires.", "Thirty-one years of messages leave at once."))}
      <p>They race along the Line, down the spires and through the cloud floor, and the lamps of the Line come back on segment by segment, closing the Faultline. Below, the clouds are thin that night. People come out of the lift-car houses to watch the gap in the sky fill with light. At the usual time, the woman in the teal jacket keys her radio, and for the first time something comes back. She answers with one word.</p>
      ${plate("the-faultline-closes", "From the Ground, the arc of the Line relighting across the night sky as people look up.", "The Faultline closes.")}
      ${packet("Deep Cache · addressed to you", "Made it down. Your turn.")}
      <p>At Relay Seven, a lamp that nobody living has seen lit begins to glow. Its engraved label reads <strong>GROUND</strong>.</p>
      ${plate("ground-lamp", "An old brass lamp on the switchboard beginning to glow above a blank engraved plate.", "")}`,
  },
  {
    id: "questions", title: "Open Questions", icon: "unknown", body: () => `
      <p class="hb-lead">Some things about the Line are not known to anyone, and the Runbook does not say.</p>
      <ul class="lore-questions">
        <li><b>What broke the outer relays.</b> The wardens' log says a strike of unknown origin, probably debris. The bellmakers say the relays were answered: that something upstream finally spoke, and was too large for the wire. The Architect, asked directly, says "it was ours" and changes the subject.</li>
        <li><b>Who the First Shift were.</b> Where they went, and whether the linefolk were their children or their guests.</li>
        <li><b>What is upstream.</b> And whether anything is still there.</li>
        <li><b>What Handover means.</b> The page is blank.</li>
        <li><b>Who the Operator is.</b> She is older than she looks, and has been on the board longer than the Night Shift can account for. Her name is in the Record.</li>
      </ul>`,
  },
];

/** The Lore book at a chapter. `answered`: a keeper has reached the Heart, so the ending chapter is open. */
export function loreMarkup(chapter = "films", answered = false): string {
  const open = (item: LoreChapter) => !item.sealed || answered;
  const found = LORE_CHAPTERS.find(item => item.id === chapter);
  const current = found && open(found) ? found : LORE_CHAPTERS[0];
  const readable = LORE_CHAPTERS.filter(open);
  const at = readable.indexOf(current);
  const previous = readable[at - 1], next = readable[at + 1];
  const index = LORE_CHAPTERS.indexOf(current);
  const nav = LORE_CHAPTERS.map((item, i) => open(item)
    ? `<button data-lore="${item.id}" class="${item.id === current.id ? "current" : ""}" ${item.id === current.id ? 'aria-current="page"' : ""}><b>${NUMERALS[i]}</b><span>${item.title}</span></button>`
    : `<button data-lore="${item.id}" class="sealed" disabled title="Sealed until a keeper reaches the Heart"><b>${NUMERALS[i]}</b><span>Sealed</span></button>`).join("");
  return `<div class="handbook lore" data-lore-chapter="${current.id}">
    <div class="hb-layout">
      <nav class="hb-nav" aria-label="Lore chapters">
        <h2 class="hb-book-title">Lore</h2>
        ${nav}
      </nav>
      <article class="hb-chapter" aria-labelledby="lore-title">
        <header class="hb-chapter-head"><span class="hb-seal" aria-hidden="true">${icon(current.icon, 22)}</span><span class="hb-numeral">Chapter ${NUMERALS[index]}</span><h3 id="lore-title">${current.title}</h3></header>
        ${current.body()}
        <footer class="hb-pager">${previous ? `<button class="text-button" data-lore="${previous.id}">${icon("back", 15)} ${previous.title}</button>` : "<span></span>"}${next ? `<button class="text-button" data-lore="${next.id}">${next.title} ${icon("arrow", 15)}</button>` : ""}</footer>
      </article>
    </div>
  </div>`;
}
