/**
 * The two scraps of chrome every game window needs: a live menubar (second
 * law — every menu opens, every item does something) and the little red LCD
 * the period put on everything it wanted you to worry about.
 */

import { el } from "../dom.js";

export interface Menu {
  label: string;
  /** [label, action, checked?] — "-" for a separator. */
  items: readonly (readonly [string, () => void, boolean?])[];
}

export function menubar(menus: readonly Menu[]): HTMLElement {
  const bar = el(`<div class="menu"></div>`);
  const popups: HTMLElement[] = [];
  let openPopup: HTMLElement | null = null;
  const closeAll = (): void => {
    for (const p of popups) p.style.display = "none";
    for (const s of bar.children) s.classList.remove("open");
    openPopup = null;
  };
  menus.forEach((m, mi) => {
    const btn = el(`<span><u>${m.label.charAt(0)}</u>${m.label.slice(1)}</span>`);
    const popup = el(`<div class="popup" style="left:${4 + mi * 48}px;display:none"></div>`);
    for (const [label, act, checked] of m.items) {
      if (label === "-") {
        popup.appendChild(el(`<hr>`));
        continue;
      }
      const it = el(`<div></div>`);
      it.textContent = label;
      if (checked) it.appendChild(el(`<span class="check">·</span>`));
      it.addEventListener("click", (e) => {
        e.stopPropagation();
        closeAll();
        act();
      });
      popup.appendChild(it);
    }
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const was = openPopup;
      closeAll();
      if (was !== popup) {
        popup.style.display = "block";
        btn.classList.add("open");
        openPopup = popup;
      }
    });
    bar.appendChild(btn);
    popups.push(popup);
  });
  for (const p of popups) bar.appendChild(p);
  // self-cleaning outside-click close: the listener retires with the bar
  const onDoc = (): void => {
    if (!bar.isConnected) removeEventListener("click", onDoc);
    else closeAll();
  };
  addEventListener("click", onDoc);
  return bar;
}

/** A three-digit red-on-black counter. `set` clamps into what it can say. */
export function lcd(): { el: HTMLElement; set(n: number): void } {
  const box = el(`<div class="lcd">000</div>`);
  return {
    el: box,
    set(n: number) {
      const v = Math.max(-99, Math.min(999, Math.round(n)));
      box.textContent = v < 0 ? `-${String(-v).padStart(2, "0")}` : String(v).padStart(3, "0");
    },
  };
}
