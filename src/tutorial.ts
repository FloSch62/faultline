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
 *   - after every action / transmission  → progress = lessonProgress(id, run, lastResult, progress);
 *                                           #lesson-layer = lessonPanelMarkup(progress, { showHint, collapsed })
 *   - progress.complete (first time)     → markLessonComplete(id)
 *   - panel actions: lesson-restart · lesson-menu · lesson-exit · lesson-next · lesson-hint · lesson-collapse
 *   - walkthrough: [data-walkthrough="<page>"] · data-action="lesson-finish"
 *   - handbook: data-action="help" → handbookMarkup(); [data-handbook="<chapter>"] → handbookMarkup(chapter) */
import "./tutorial.css";
import { RULES } from "./core/cards.ts";
import { EVENTS } from "./core/events.ts";
import { CARD_PRICES, REMOVE_PRICE, UPGRADE_PRICE } from "./core/meta.ts";
import { LESSONS, lessonById, nextLesson, type LessonDefinition, type LessonId, type LessonProgress } from "./tutorial/lessons.ts";
import { mapDiagram } from "./tutorial/diagrams.ts";
import { esc, icon } from "./tutorial/icons.ts";

export {
  LESSONS,
  HINT_DELAY_MS,
  TRAINING_STORAGE,
  createLessonRun,
  lessonById,
  lessonProgress,
  loadCompletedLessons,
  markLessonComplete,
  nextLesson,
  resetTrainingProgress,
  type LessonDefinition,
  type LessonId,
  type LessonProgress,
} from "./tutorial/lessons.ts";
export { HANDBOOK_CHAPTERS, handbookMarkup, type HandbookChapter } from "./tutorial/handbook.ts";

const asset = (path: string) => `${import.meta.env?.BASE_URL ?? "/"}${path}`;
const TOTAL_CHAPTERS = Math.max(...LESSONS.map(lesson => lesson.chapter));
const pad = (n: number) => String(n).padStart(2, "0");

export interface PanelOptions {
  /** Show the hint (after inactivity or a failed action). */
  showHint?: boolean;
  /** Minimised panel: title and current goal only. */
  collapsed?: boolean;
}

/** The floating coach panel shown during a battle lesson (render into #lesson-layer). */
export function lessonPanelMarkup(progress: LessonProgress, options: PanelOptions = {}): string {
  const lesson = lessonById(progress.id)!;
  const next = nextLesson(lesson.id);
  const done = progress.goals.filter(goal => goal.done).length;
  const currentGoal = progress.goals[progress.current];
  return `<aside class="training-panel ${progress.complete ? "is-complete" : ""} ${options.collapsed ? "is-collapsed" : ""}" aria-label="Field training: ${esc(lesson.title)}" style="--training-progress:${(done / progress.goals.length) * 100}%">
    <header class="training-head">
      <span class="training-seal" aria-hidden="true">${icon(progress.complete ? "check" : lesson.icon, 20)}</span>
      <div class="training-titles"><span class="training-kicker">FIELD TRAINING · ${pad(lesson.chapter)} / ${pad(TOTAL_CHAPTERS)} · ${esc(lesson.kicker)}</span><h3>${esc(lesson.title)}</h3></div>
      <button class="training-collapse" data-action="lesson-collapse" aria-expanded="${!options.collapsed}" aria-label="${options.collapsed ? "Expand" : "Minimise"} the lesson panel">${icon("chevron", 16)}</button>
    </header>
    <div class="training-meter" role="progressbar" aria-label="Lesson goals" aria-valuemin="0" aria-valuemax="${progress.goals.length}" aria-valuenow="${done}"><i></i></div>
    ${options.collapsed
      ? `<p class="training-current">${progress.complete ? "Lesson complete" : esc(currentGoal?.label ?? "")}</p>`
      : `<ol class="training-goals">${progress.goals.map((goal, i) => `<li class="${goal.done ? "done" : i === progress.current ? "current" : "pending"}"><i aria-hidden="true">${goal.done ? icon("check", 12) : i + 1}</i><span>${esc(goal.label)}</span>${goal.done ? '<span class="visually-hidden">(done)</span>' : ""}</li>`).join("")}</ol>
      <div class="training-coach" aria-live="polite">${progress.complete
        ? `<span class="training-label">WHY THIS MATTERS</span><p>${esc(progress.coach)}</p>`
        : `<span class="training-label">COACH</span><p>${esc(progress.coach)}</p>`}</div>
      ${progress.warning ? `<p class="training-warning" role="alert">${icon("warning", 15)} ${esc(progress.warning)}</p>` : ""}
      ${progress.complete ? "" : options.showHint && progress.hint
        ? `<p class="training-hint">${icon("hint", 15)} <span><b>HINT</b> ${esc(progress.hint)}</span></p>`
        : progress.hint ? `<button class="training-hint-button" data-action="lesson-hint">${icon("hint", 14)} Show a hint</button>` : ""}
      ${progress.complete ? `<div class="training-complete"><span class="training-banner">${icon("check", 14)} LESSON COMPLETE</span><div class="training-actions">${next
        ? `<button class="gold-button" data-action="lesson-next">Next · ${esc(next.title)} ${icon("arrow", 16)}</button>`
        : `<button class="gold-button" data-action="lesson-exit">Return to the expedition ${icon("arrow", 16)}</button>`}<button class="training-link" data-action="lesson-menu">All lessons</button></div></div>` : ""}
      <footer class="training-foot"><button data-action="lesson-restart">${icon("undo", 13)} Restart</button><button data-action="lesson-menu">${icon("book", 13)} Lessons</button><button data-action="lesson-exit">${icon("close", 13)} Leave training</button><span>Practice only · your expedition is safe</span></footer>`}
  </aside>`;
}

function lessonCard(lesson: LessonDefinition, completed: Set<string>, recommended: string | undefined) {
  const done = completed.has(lesson.id);
  return `<button class="lesson-card ${done ? "done" : ""} ${recommended === lesson.id ? "recommended" : ""}" data-lesson="${lesson.id}" aria-label="Lesson ${lesson.chapter}: ${esc(lesson.title)}. ${esc(lesson.summary)}${done ? " Completed." : ""}">
    <span class="lesson-number">${pad(lesson.chapter)}</span>
    <span class="lesson-icon" aria-hidden="true">${icon(done ? "check" : lesson.icon, 22)}</span>
    <span class="lesson-kicker">${esc(lesson.kicker)}</span>
    <strong>${esc(lesson.title)}</strong>
    <span class="lesson-summary">${esc(lesson.summary)}</span>
    <span class="lesson-meta">${lesson.kind === "walkthrough" ? "GUIDE" : "PRACTICE BATTLE"} · ~${lesson.minutes} MIN${done ? ` · ${icon("check", 11)} DONE` : recommended === lesson.id ? " · START HERE" : ""}</span>
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
    <span class="lesson-number">07</span><span class="lesson-icon" aria-hidden="true">${icon("play", 22)}</span>
    <span class="lesson-kicker">CONSOLE COMMANDS · ENGINES</span><strong>Your Keeper's Console</strong>
    <span class="lesson-summary">Each keeper has a command beside the hand and an engine of its own. Try all three.</span>
    <span class="lesson-variants">${consoles.map(lesson => `<button data-lesson="${lesson.id}" class="${done.has(lesson.id) ? "done" : ""} ${recommended === lesson.id ? "recommended" : ""}">${done.has(lesson.id) ? icon("check", 12) : ""}${esc(lesson.archetype![0].toUpperCase() + lesson.archetype!.slice(1))}<small>${esc(lesson.kicker.split(" · ")[0])}</small></button>`).join("")}</span>
  </div>`;
  const cards = [...others.filter(l => l.chapter < 7).map(l => lessonCard(l, done, recommended)), consoleCard, ...others.filter(l => l.chapter > 7).map(l => lessonCard(l, done, recommended))];
  return `<section class="training-menu" aria-labelledby="training-title">
    <header class="training-menu-head"><span class="eyebrow">FIELD TRAINING</span><h2 id="training-title">Learn to carry the signal.</h2>
      <p class="modal-intro">Short practice battles with a coach at your side. Each one teaches a single idea with the real rules — nothing here touches your expedition.</p>
      <div class="training-overall" role="progressbar" aria-label="Lessons completed" aria-valuemin="0" aria-valuemax="${LESSONS.length}" aria-valuenow="${count}" style="--training-progress:${(count / LESSONS.length) * 100}%"><i></i><span>${count} / ${LESSONS.length} COMPLETE</span></div></header>
    <div class="lesson-grid">${cards.join("")}</div>
    <footer class="training-menu-foot"><button class="text-button" data-action="help">${icon("book", 15)} Open the Handbook</button><span>Everything in training uses the same numbers as the real expedition.</span></footer>
  </section>`;
}

// ---------------------------------------------------------------------------
// The expedition walkthrough (lesson 09)

interface WalkthroughPage {
  kicker: string;
  title: string;
  art?: string;
  body: () => string;
}
const eventNames = () => Object.values(EVENTS).map(event => event.title).slice(0, 6).map(esc).join(" · ");
export const WALKTHROUGH_PAGES: readonly WalkthroughPage[] = [
  {
    kicker: "THE ROUTE CHART", title: "Three stages. One way through.", body: () => `
      <p>An expedition crosses three stages of seven sectors. In each sector you choose one lit room; only the drawn connections can be followed, so plan a few rooms ahead. Every path crosses several battles and ends at the stage guardian.</p>
      <div class="walk-figure">${mapDiagram()}</div>
      <p class="walk-note">Hover a room to scout it: enemies are named before you enter, with their health and trait.</p>`,
  },
  {
    kicker: "REWARDS", title: "Your deck is a choice, not a pile.", art: "art/relay-interior.png", body: () => `
      <p>After a battle, choose one of three cards — or skip. A lean deck draws its best cards more often. Elites guarantee a rare option and a relic.</p>
      <ul class="walk-list"><li><b>Rarity</b> Common, uncommon, rare, legendary — power, not obligation.</li><li><b>Upgrades (+)</b> Lower cost, bigger numbers or extra draw. Later rewards sometimes arrive upgraded.</li><li><b>Archetype cards</b> Some cards appear only for your keeper.</li></ul>`,
  },
  {
    kicker: "CREDITS & THE MARKET", title: "Every battle pays.", art: "art/relay-bazaar.png", body: () => `
      <p>Battles, elites, guardians and caches pay credits. Spend them at the Market:</p>
      <ul class="walk-list"><li><b>Cards</b> ${CARD_PRICES.common}–${CARD_PRICES.legendary} credits by rarity.</li><li><b>Relics</b> Two on offer each visit.</li><li><b>Remove a card</b> ${REMOVE_PRICE.base} credits, +${REMOVE_PRICE.step} each time you use it.</li><li><b>Upgrade a card</b> ${UPGRADE_PRICE} credits.</li></ul>
      <p class="walk-note">Each service can be bought once per visit.</p>`,
  },
  {
    kicker: "UNKNOWN SIGNALS", title: "Events are trades you can see.", art: "art/relay-cathedral.png", body: () => `
      <p>Question-mark rooms hold events: a rack still answering, a broker in the dark, a vault that wants something back. Every choice shows its price before you take it — no hidden coin flips.</p>
      <p class="walk-note">${eventNames()} …</p>`,
  },
  {
    kicker: "SANCTUARIES", title: "A lamp left on for you.", art: "art/relay-sanctuary.png", body: () => `
      <p>A sanctuary offers exactly one service:</p>
      <ul class="walk-list"><li><b>Repair</b> Restore part of your integrity.</li><li><b>Upgrade</b> Improve one card permanently.</li><li><b>Remove</b> Take a weak card out of your deck.</li><li><b>Salvage</b> Trade 2 maximum integrity for a relic.</li></ul>`,
  },
  {
    kicker: "RELICS", title: "Rules that bend in your favour.", body: () => `
      <p>Relics are permanent. Your keeper starts with one; elites, markets and sanctuaries offer more. After the first two guardians you choose a <b>boss relic</b>: a powerful rule with a real drawback — double route damage but no bandwidth, extra energy but no firewalls, and more.</p>
      <p class="walk-note">Read the drawback against your deck: a boss relic can make a build — or break one.</p>`,
  },
  {
    kicker: "ASCENSION", title: "When the signal is safe, go deeper.", body: () => `
      <p>Win an expedition to unlock the next ascension level for that keeper. Each level adds one rule — tougher elites, sharper strikes, leaner markets — and levels stack up to ten.</p>
      <p class="walk-note">Ascension is optional: it exists for players who want the backbone to fight back harder.</p>`,
  },
  {
    kicker: "READY", title: "Carry the signal home.", body: () => `
      <ul class="walk-list"><li><b>Build first, then widen.</b> One route on turn one; a second channel as soon as you can (+${RULES.bandwidthPerChannel} and cut-proof).</li><li><b>Read, then spend.</b> Cover the forecast exactly; everything else goes into damage or network.</li><li><b>Answer in advance.</b> Arm protocols and prepare cards for the turn you can already see.</li><li><b>Keep the deck lean.</b> Skipping a reward is often the strongest pick.</li></ul>
      <p class="walk-note">The Handbook (?) holds every rule and number, including the Danger Playbook.</p>`,
  },
];

/** Dialog content for the expedition walkthrough. Page buttons use data-walkthrough. */
export function walkthroughMarkup(page = 0): string {
  const index = Math.max(0, Math.min(WALKTHROUGH_PAGES.length - 1, Math.trunc(page)));
  const current = WALKTHROUGH_PAGES[index];
  const last = index === WALKTHROUGH_PAGES.length - 1;
  return `<section class="walkthrough ${current.art ? "has-art" : ""}" aria-labelledby="walk-title">
    ${current.art ? `<div class="walk-art" style="background-image:url('${asset(current.art)}')" aria-hidden="true"></div>` : ""}
    <div class="walk-copy">
      <span class="eyebrow">FIELD TRAINING · 09 · ${current.kicker}</span>
      <h2 id="walk-title">${current.title}</h2>
      ${current.body()}
    </div>
    <footer class="walk-nav">
      <button class="training-link" data-walkthrough="${index - 1}" ${index === 0 ? "disabled" : ""}>${icon("back", 14)} Back</button>
      <span class="walk-dots">${WALKTHROUGH_PAGES.map((_, i) => `<button data-walkthrough="${i}" class="${i === index ? "current" : i < index ? "seen" : ""}" aria-label="Page ${i + 1} of ${WALKTHROUGH_PAGES.length}" ${i === index ? 'aria-current="step"' : ""}></button>`).join("")}</span>
      ${last ? `<button class="gold-button" data-action="lesson-finish">Finish training ${icon("check", 16)}</button>` : `<button class="gold-button" data-walkthrough="${index + 1}">Next ${icon("arrow", 16)}</button>`}
    </footer>
  </section>`;
}

/** The walkthrough lesson id, for the UI's routing. */
export const WALKTHROUGH_LESSON: LessonId = "expedition";
