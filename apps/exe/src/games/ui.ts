/** Shared game-window chrome: a live menubar (every item must do something) and a red LCD counter. */

import { el } from "../dom.js";

export interface Menu {
  label: string;
  /** [label, action, checked?]; "-" is a separator. "\t" splits off an accelerator
      label ("Deal\tF2") — display only, the window binds the key itself. */
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
      const tab = label.indexOf("\t");
      it.textContent = tab === -1 ? label : label.slice(0, tab);
      if (tab !== -1) {
        it.classList.add("has-accel");
        const accel = el(`<span class="accel"></span>`);
        accel.textContent = label.slice(tab + 1);
        it.appendChild(accel);
      }
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
  // outside-click close; listener removes itself once the bar is detached
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
