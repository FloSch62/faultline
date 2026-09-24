/** Field Training and the Handbook — markup for the interface.
 *
 * Lesson logic (setups, goals, coach text) is pure and lives in ./tutorial/lessons.ts;
 * the illustrated rules reference lives in ./tutorial/handbook.ts. This module renders
 * the in-battle lesson panel, the lesson menu and the expedition walkthrough.
 *
 * Wiring (main.ts):
 *   - `data-action="tutorial"`           → open the menu: lessonMenuMarkup(loadCompletedLessons())
 *   - `[data-lesson="<id>"]`             → battle lesson: run = createLessonRun(id);
 *                                           walkthrough ("expedition"): walkthroughMarkup(0) in the dialog
 *   - after every action / transmission  → progress = lessonProgress(id, run, lastResult, progress, view);
 *                                           #lesson-layer = lessonPanelMarkup(progress, { showHint, collapsed })
 *   - progress.complete (first time)     → markLessonComplete(id); the board freezes and, a beat later,
 *                                           #lesson-layer adds lessonEndMarkup(progress, true)
 *   - panel actions: lesson-restart · lesson-menu · lesson-exit · lesson-hint · lesson-collapse
 *                    · lesson-read (a reading step's "Got it")
 *   - completion plate: lesson-next · lesson-restart (Replay) · lesson-training (leave, then the menu)
 *   - walkthrough: [data-walkthrough="<page>"] · data-action="lesson-finish" · "lesson-finish-next"
 *   - handbook: data-action="help" → handbookMarkup(); [data-handbook="<chapter>"] → handbookMarkup(chapter) */
import "./tutorial.css";
import { RULES } from "./core/cards.ts";
import { EVENTS } from "./core/events.ts";
import { CARD_PRICES, REMOVE_PRICE, SALVAGE_COST, UPGRADE_PRICE } from "./core/meta.ts";
import { ASCENSION_LEVELS, MAX_ASCENSION } from "./core/ascension.ts";
import { LESSONS, lessonById, nextLesson, type LessonDefinition, type LessonId, type LessonProgress } from "./tutorial/lessons.ts";
import { mapDiagram } from "./tutorial/diagrams.ts";
import { esc, icon } from "./tutorial/icons.ts";

export {
  LESSONS,
  HINT_DELAY_MS,
  TRAINING_STORAGE,
  createLessonRun,
  lessonById,
  lessonGuard,
  lessonProgress,
  loadCompletedLessons,
  markLessonComplete,
  nextLesson,
  resetTrainingProgress,
  type LessonAction,
  type LessonDefinition,
  type LessonId,
  type LessonProgress,
  type LessonView,
} from "./tutorial/lessons.ts";
export { HANDBOOK_CHAPTERS, handbookMarkup, type HandbookChapter } from "./tutorial/handbook.ts";

const asset = (path: string) => `${import.meta.env?.BASE_URL ?? "/"}${path}`;
const TOTAL_CHAPTERS = Math.max(...LESSONS.map(lesson => lesson.chapter));
const NUMERALS = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
/** Coach text: escaped, with `**term**` highlighted so key words carry the sentence. */
const rich = (text: string) => esc(text).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
const titleCase = (text: string) => text.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

export interface PanelOptions {
  /** Show the hint (after inactivity or a failed action). */
  showHint?: boolean;
  /** Minimised panel: title and current goal only. */
  collapsed?: boolean;
}

/** The coach's own break meter (the charge turn, while the enemy plate draws none): the guardian's
 * threshold as a bar with one segment per add, lit while the add stands, and your packet against it.
 * It is the reading step's control: a click (or Enter) on it is the player's "Got it". */
function meterMarkup(progress: LessonProgress): string {
  const m = progress.meter;
  if (!m) return "";
  const threshold = m.base + m.standing * m.bonus, most = Math.max(1, m.base + m.adds * m.bonus);
  const pct = (n: number) => `${Math.min(100, (n / most) * 100)}%`;
  const add = m.add ?? "add";
  const segments = `<b style="width:${pct(m.base)}"></b>${Array.from({ length: m.adds }, (_, i) => `<b class="${i < m.standing ? "is-lit" : ""}" style="width:${pct(m.bonus)}"></b>`).join("")}`;
  return `<button class="coach-break" data-action="lesson-read" aria-label="${esc(`Break meter: the ultimate breaks at ${threshold}, ${m.base} plus ${m.bonus} per living ${add}, ${m.standing} standing. Your transmission: ${m.packet}. Got it.`)}">
    <span class="coach-break-head"><span>Break at <strong>${threshold}</strong></span><span class="coach-break-ok">${icon("check", 12)} Got it</span></span>
    <span class="coach-break-bar" aria-hidden="true"><i style="width:${pct(m.packet)}"></i><span class="coach-break-segments">${segments}</span><em style="left:${pct(threshold)}"></em></span>
    <span class="coach-break-foot">${m.base} + ${m.bonus} per living ${esc(add)} · your packet <b>${m.packet}</b></span>
  </button>`;
}

/** A reading step ends on the player's word: an iron plate under the instruction. */
const readButton = (progress: LessonProgress) => progress.reading
  ? `<button class="plate-button training-read" data-action="lesson-read">${icon("check", 14)} Got it</button>`
  : "";

/** The coach panel docked beside the table during a battle lesson (render into #lesson-layer).
 * A finished lesson keeps only its lit head and the banner: the completion plate carries the way on. */
export function lessonPanelMarkup(progress: LessonProgress, options: PanelOptions = {}): string {
  const lesson = lessonById(progress.id)!;
  const done = progress.goals.filter(goal => goal.done).length;
  const currentGoal = progress.goals[progress.current];
  const banner = `<div class="training-complete"><span class="training-banner">${icon("check", 16)} Lesson Complete</span></div>`;
  return `<aside class="training-panel ${progress.complete ? "is-complete" : ""} ${options.collapsed ? "is-collapsed" : ""}" aria-label="Field training: ${esc(lesson.title)}" style="--training-progress:${(done / progress.goals.length) * 100}%">
    <header class="training-head">
      <span class="training-seal" aria-hidden="true">${icon(progress.complete ? "check" : lesson.icon, 20)}</span>
      <div class="training-titles"><span class="training-kicker">Lesson ${lesson.chapter} of ${TOTAL_CHAPTERS}</span><h3>${esc(lesson.title)}</h3></div>
      ${progress.complete ? "" : `<button class="training-collapse" data-action="lesson-collapse" aria-expanded="${!options.collapsed}" aria-label="${options.collapsed ? "Expand" : "Minimise"} the lesson panel">${icon("chevron", 16)}</button>`}
    </header>
    <div class="training-meter" role="progressbar" aria-label="Lesson goals" aria-valuemin="0" aria-valuemax="${progress.goals.length}" aria-valuenow="${done}"><i></i></div>
    ${progress.complete ? banner : options.collapsed
      ? `<p class="training-current">${rich(progress.coach) || esc(currentGoal?.label ?? "")}</p>${meterMarkup(progress)}${readButton(progress)}`
      : `<div class="training-progress"><ol class="training-goals" aria-label="Lesson steps">${progress.goals.map((goal, i) => `<li class="${goal.done ? "done" : i === progress.current ? "current" : "pending"}" data-tooltip="${esc(goal.label)}"><i aria-hidden="true"></i><span class="visually-hidden">${esc(goal.label)}${goal.done ? " (done)" : ""}</span></li>`).join("")}</ol><span class="training-count">Step <b>${progress.current + 1}</b> of ${progress.goals.length}</span></div>
      <div class="training-coach" aria-live="polite"><div class="training-step"><strong class="training-label">${esc(currentGoal?.label ?? "Your next move")}</strong>${progress.hint && !options.showHint ? `<button class="training-hint-button" data-action="lesson-hint" aria-label="Show a hint" data-tooltip="Show a hint">${icon("hint", 16)}</button>` : ""}</div><p class="coach-do">${rich(progress.coach)}</p>${meterMarkup(progress)}${readButton(progress)}${options.showHint && progress.hint ? `<p class="training-hint">${icon("hint", 16)}<span><b>Hint.</b> ${esc(progress.hint)}</span></p>` : ""}${progress.detail ? `<p class="coach-why">${rich(progress.detail)}</p>` : ""}</div>`}
    ${progress.warning ? `<p class="training-warning" role="alert">${icon("warning", 16)}<span>${esc(progress.warning)}</span></p>` : ""}
    ${progress.complete ? "" : `<footer class="training-foot"><button class="text-button" data-action="lesson-restart">${icon("undo", 14)} Restart</button><button class="text-button" data-action="lesson-menu">${icon("book", 14)} Lessons</button><button class="text-button" data-action="lesson-exit">${icon("close", 14)} Leave</button></footer>`}
  </aside>`;
}

/** A finished lesson is over. The scrim takes every pointer from the frozen board at once; the plate
 * (`shown`) rises a beat later with the takeaway and the three ways on: the next lesson, a replay from
 * a fresh board, or the training menu (which leaves the lesson). */
export function lessonEndMarkup(progress: LessonProgress, shown: boolean): string {
  if (!progress.complete) return "";
  const lesson = lessonById(progress.id)!;
  const next = nextLesson(lesson.id);
  const scrim = `<div class="lesson-end-scrim${shown ? " is-shown" : ""}" aria-hidden="true"></div>`;
  if (!shown) return scrim;
  const steps = progress.goals.map(goal => `<li>${icon("check", 13)}<span>${esc(goal.label)}</span></li>`).join("");
  const menu = (primary: boolean) => `<button class="${primary ? "gold-button" : "plate-button"}" data-action="lesson-training"${primary ? " data-autofocus" : ""}>${icon("book", 15)} Training menu</button>`;
  return `${scrim}<section class="lesson-end" role="dialog" aria-modal="true" aria-labelledby="lesson-end-title" aria-describedby="lesson-end-why">
    <span class="lesson-end-seal" aria-hidden="true">${icon("check", 26)}</span>
    <h2 id="lesson-end-title">${esc(lesson.title)}</h2>
    <p class="lesson-end-note">Lesson ${lesson.chapter} of ${TOTAL_CHAPTERS} complete</p>
    <ol class="lesson-end-steps" aria-label="What you did" style="--rows:${Math.ceil(progress.goals.length / 2)}">${steps}</ol>
    <p class="lesson-end-why" id="lesson-end-why">${esc(lesson.takeaway)}</p>
    <div class="lesson-end-actions">
      ${next ? `<button class="gold-button" data-action="lesson-next" data-autofocus>Next lesson<small>${esc(next.title)}</small></button>` : menu(true)}
      <button class="plate-button" data-action="lesson-restart">${icon("undo", 15)} Replay</button>
      ${next ? menu(false) : ""}
    </div>
  </section>`;
}

function lessonCard(lesson: LessonDefinition, completed: Set<string>, recommended: string | undefined) {
  const done = completed.has(lesson.id), start = recommended === lesson.id;
  return `<button class="lesson-card ${done ? "done" : ""} ${start ? "recommended" : ""}" data-lesson="${lesson.id}" aria-label="Lesson ${lesson.chapter}: ${esc(lesson.title)}. ${esc(lesson.summary)}${done ? " Completed." : ""}">
    ${start ? '<span class="lit-stone" aria-hidden="true"></span>' : ""}
    <span class="lesson-icon" aria-hidden="true">${icon(done ? "check" : lesson.icon, 22)}</span>
    <span class="lesson-number" aria-hidden="true">${NUMERALS[lesson.chapter]}</span>
    <strong>${esc(lesson.title)}</strong>
    <span class="lesson-summary">${esc(lesson.summary)}</span>
    <span class="lesson-meta">${icon(lesson.kind === "walkthrough" ? "book" : "sword", 14)} ${lesson.kind === "walkthrough" ? "Guide" : "Battle"} · ${lesson.minutes} min${done ? "<em>Completed</em>" : start ? "<em>Start here</em>" : ""}</span>
  </button>`;
}

/** The lesson menu (render into the dialog). Buttons carry data-lesson ids. */
export function lessonMenuMarkup(completed: readonly string[]): string {
  const done = new Set(completed);
  const recommended = LESSONS.find(lesson => !done.has(lesson.id))?.id;
  const consoles = LESSONS.filter(lesson => lesson.chapter === 7);
  const others = LESSONS.filter(lesson => lesson.chapter !== 7);
  const count = LESSONS.filter(lesson => done.has(lesson.id)).length;
  const consoleCard = `<div class="lesson-card lesson-group ${consoles.every(l => done.has(l.id)) ? "done" : ""}">
    ${consoles.some(l => l.id === recommended) ? '<span class="lit-stone" aria-hidden="true"></span>' : ""}
    <span class="lesson-icon" aria-hidden="true">${icon(consoles.every(l => done.has(l.id)) ? "check" : "play", 22)}</span><span class="lesson-number" aria-hidden="true">VII</span>
    <strong>Your Keeper's Console</strong>
    <span class="lesson-summary">Each keeper has a command beside the hand and an engine of its own. Try all three.</span>
    <span class="lesson-variants">${consoles.map(lesson => `<button data-lesson="${lesson.id}" class="${done.has(lesson.id) ? "done" : ""} ${recommended === lesson.id ? "recommended" : ""}" aria-label="${esc(lesson.title)}${done.has(lesson.id) ? ". Completed." : ""}"><span>${esc(titleCase(lesson.archetype!))}${done.has(lesson.id) ? icon("check", 13) : ""}</span><small>${esc(titleCase(lesson.kicker.split(" · ")[0]))}</small></button>`).join("")}</span>
  </div>`;
  // The Handbook closes the grid as a wide plate, so the last lesson never stands alone in its row.
  const handbookCard = `<button class="lesson-card lesson-handbook" data-action="help" aria-label="Open the Handbook: every rule and number, chapter by chapter">
    <span class="lesson-icon" aria-hidden="true">${icon("book", 22)}</span>
    <strong>The Handbook</strong>
    <span class="lesson-summary">Every rule and number of the relay, chapter by chapter: packs and ports, the table front, escalation, crates and signals.</span>
    <span class="lesson-meta">${icon("book", 14)} Reference · open it any time</span>
  </button>`;
  const cards = [...others.filter(l => l.chapter < 7).map(l => lessonCard(l, done, recommended)), consoleCard, ...others.filter(l => l.chapter > 7).map(l => lessonCard(l, done, recommended)), handbookCard];
  return `<section class="training-menu" aria-labelledby="training-title">
    <header class="panel-head training-menu-head"><h2 id="training-title">Field Training</h2>
      <p>Short practice battles with a coach at your side. Nothing here touches your expedition.</p></header>
    <div class="training-overall" role="progressbar" aria-label="Lessons completed" aria-valuemin="0" aria-valuemax="${LESSONS.length}" aria-valuenow="${count}">
      <ol class="training-rail" aria-hidden="true">${LESSONS.map(lesson => `<li class="${done.has(lesson.id) ? "lit" : ""}"></li>`).join("")}</ol>
      <span class="training-tally"><b>${count}</b><i>/</i>${LESSONS.length}<small>complete</small></span>
    </div>
    <div class="lesson-grid">${cards.join("")}</div>
  </section>`;
}

// ---------------------------------------------------------------------------
// The expedition walkthrough (lesson 09)

interface WalkthroughPage {
  title: string;
  /** An optional flavour line under the title. */
  tagline?: string;
  art?: string;
  /** Hang the route chart where a painting would go. */
  chart?: boolean;
  body: () => string;
}
const eventNames = () => Object.values(EVENTS).map(event => event.title).slice(0, 6).map(esc).join(" · ");
export const WALKTHROUGH_PAGES: readonly WalkthroughPage[] = [
  {
    title: "The Route Chart", tagline: "Three stages. One way through.", chart: true, body: () => `
      <p>An expedition crosses three stages of seven sectors. In each sector you choose one lit room; only the drawn connections can be followed, so plan a few rooms ahead. Every path crosses several battles and ends at the stage guardian.</p>
      <p class="walk-note">Hover a room to scout it: enemies are named before you enter, with their health and trait.</p>`,
  },
  {
    title: "Rewards", art: "art/relay-interior.png", body: () => `
      <p>After a battle, choose one of three cards — or skip. A lean deck draws its best cards more often. Elites offer an uncommon or better first and a relic; guardians offer rares.</p>
      <ul class="walk-list"><li><b>Rarity</b> Common, uncommon, rare, legendary — power, not obligation.</li><li><b>Upgrades (+)</b> Lower cost, bigger numbers or extra draw. Later rewards sometimes arrive upgraded.</li><li><b>Keeper cards</b> ${Math.round(RULES.keeperShare * 100)}% of offered cards are your keeper's own; the rest come from the shared colorless pool.</li></ul>`,
  },
  {
    title: "Credits & the Market", art: "art/relay-bazaar.png", body: () => `
      <p>Battles, elites, guardians and caches pay credits. Spend them at the Market:</p>
      <ul class="walk-list"><li><b>Cards</b> ${CARD_PRICES.common}–${CARD_PRICES.legendary} credits by rarity.</li><li><b>Relics</b> Two on offer each visit.</li><li><b>Remove a card</b> ${REMOVE_PRICE.base} credits, +${REMOVE_PRICE.step} each time you use it.</li><li><b>Upgrade a card</b> ${UPGRADE_PRICE} credits.</li></ul>
      <p class="walk-note">Each service can be bought once per visit.</p>`,
  },
  {
    title: "Unknown Signals", art: "art/relay-cathedral.png", body: () => `
      <p>Question-mark rooms hold events: a rack still answering, a broker in the dark, a vault that wants something back. Every choice shows its price before you take it — no hidden coin flips.</p>
      <p class="walk-note">${eventNames()} …</p>`,
  },
  {
    title: "Sanctuaries", tagline: "A lamp left on for you.", art: "art/relay-sanctuary.png", body: () => `
      <p>A sanctuary offers exactly one service:</p>
      <ul class="walk-list"><li><b>Repair</b> Restore part of your integrity.</li><li><b>Upgrade</b> Improve one card permanently.</li><li><b>Remove</b> Take a weak card out of your deck.</li><li><b>Salvage</b> Trade ${SALVAGE_COST} maximum integrity for a relic.</li></ul>`,
  },
  {
    title: "Relics", body: () => `
      <p>Relics are permanent. Your keeper starts with one; elites, markets and sanctuaries offer more. After the first two guardians you choose a <b>boss relic</b>: a powerful rule with a real drawback — double route damage but no bandwidth, extra energy but no firewalls, and more.</p>
      <p class="walk-note">Read the drawback against your deck: a boss relic can make a build — or break one.</p>`,
  },
  {
    title: "Ascension", body: () => `
      <p>Win an expedition to unlock the next ascension level for that keeper. There are ${MAX_ASCENSION}: ${ASCENSION_LEVELS.map(level => level.name).join(", ")}. Each adds its rules to every level before it.</p>
      <p class="walk-note">Ascension is optional: it exists for players who want the backbone to fight back harder.</p>`,
  },
  {
    title: "Before You Set Out", tagline: "Carry the signal home.", body: () => `
      <ul class="walk-list"><li><b>Build first, then widen.</b> One route on turn one; a second channel as soon as you can (+${RULES.bandwidthPerChannel}, and it survives a cut).</li><li><b>Read, then spend.</b> Cover the forecast exactly; everything else goes into damage or network.</li><li><b>Answer in advance.</b> Arm protocols and prepare cards for the turn you can already see.</li><li><b>Keep the deck lean.</b> Skipping a reward is often the strongest pick.</li></ul>
      <p class="walk-note">The Handbook holds every rule and number, including the Danger Playbook.</p>`,
  },
];

/** The walkthrough's last page ends like a battle lesson: on to the next lesson, or back to the menu. */
function walkEnd(): string {
  const next = nextLesson(WALKTHROUGH_LESSON);
  return `<span class="walk-end">${next ? `<button class="plate-button" data-action="lesson-finish">${icon("book", 15)} Training menu</button><button class="gold-button" data-action="lesson-finish-next">Next lesson<small>${esc(next.title)}</small></button>` : `<button class="gold-button" data-action="lesson-finish">${icon("check", 16)} Finish Training</button>`}</span>`;
}

/** Dialog content for the expedition walkthrough. Page buttons use data-walkthrough. */
export function walkthroughMarkup(page = 0): string {
  const index = Math.max(0, Math.min(WALKTHROUGH_PAGES.length - 1, Math.trunc(page)));
  const current = WALKTHROUGH_PAGES[index];
  const last = index === WALKTHROUGH_PAGES.length - 1;
  return `<section class="walkthrough ${current.art || current.chart ? "has-art" : ""}" aria-labelledby="walk-title">
    ${current.art ? `<div class="walk-art" style="background-image:url('${asset(current.art)}')" aria-hidden="true"></div>` : ""}
    ${current.chart ? `<figure class="walk-chart">${mapDiagram()}</figure>` : ""}
    <div class="walk-copy">
      <h2 id="walk-title">${current.title}</h2>
      ${current.tagline ? `<p class="walk-tagline">${current.tagline}</p>` : ""}
      ${current.body()}
    </div>
    <footer class="walk-nav">
      <button class="text-button walk-back" data-walkthrough="${index - 1}" ${index === 0 ? "disabled" : ""}>${icon("back", 15)} Back</button>
      <span class="walk-dots">${WALKTHROUGH_PAGES.map((_, i) => `<button data-walkthrough="${i}" class="${i === index ? "current" : i < index ? "seen" : ""}" aria-label="Page ${i + 1} of ${WALKTHROUGH_PAGES.length}" ${i === index ? 'aria-current="step"' : ""}></button>`).join("")}</span>
      ${last ? walkEnd() : `<button class="gold-button" data-walkthrough="${index + 1}">Next ${icon("arrow", 16)}</button>`}
    </footer>
  </section>`;
}

/** The walkthrough lesson id, for the UI's routing. */
export const WALKTHROUGH_LESSON: LessonId = "expedition";
