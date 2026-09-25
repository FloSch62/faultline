/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
/** The table's hover card: one engraved plate that follows the pointer over a device, cable,
 * installation, hostile or packet glyph on the 3D table. Content comes from table-cards.ts
 * (the network) and hostile-cards.ts (the rail); this module only places and shows it. */
import "./hover-card.css";

let shownKey = "";

function card(): HTMLElement | null {
  return document.getElementById("hover-card");
}

/** The key of the card on screen ("" when hidden), so callers skip rebuilding the same card. */
export function hoverCardKey(): string {
  return shownKey;
}

/** Shows `html` beside the pointer (client coordinates). The same key only moves the card. */
export function showHoverCard(key: string, html: string, clientX: number, clientY: number) {
  const el = card();
  if (!el) return;
  if (key !== shownKey) {
    el.innerHTML = html;
    shownKey = key;
  }
  el.classList.add("visible");
  moveHoverCard(clientX, clientY);
}

/** Keeps the card beside the pointer: right and below it, flipped at the window's edges. */
export function moveHoverCard(clientX: number, clientY: number) {
  const el = card();
  if (!el || !shownKey) return;
  const app = document.getElementById("app");
  const scale = (app && Number.parseFloat(getComputedStyle(app).zoom)) || 1;
  const origin = (el.offsetParent ?? document.body).getBoundingClientRect();
  const width = window.innerWidth / scale, height = window.innerHeight / scale;
  const x = clientX / scale, y = clientY / scale, gap = 22, edge = 10;
  const w = el.offsetWidth, h = el.offsetHeight;
  const left = x + gap + w > width - edge ? Math.max(edge, x - gap - w) : x + gap;
  const top = Math.max(edge, Math.min(height - h - edge, y + gap * 0.6));
  el.style.left = `${left - origin.left / scale}px`;
  el.style.top = `${top - origin.top / scale}px`;
}

export function hideHoverCard() {
  const el = card();
  shownKey = "";
  if (el) el.classList.remove("visible");
}
