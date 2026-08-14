/**
 * The games folder — a real folder window, because a desktop that suddenly
 * grew four games needs somewhere period to keep them. Double-click
 * launches; the status bar counts objects the way Explorer counted them,
 * which is to say: proudly.
 */

import { el } from "../dom.js";
import { ICONS, iconCanvas } from "../icons.js";
import { TITLES } from "../copy.js";
import type { WM } from "../wm.js";
import { GAME_ICON_MINE } from "./mines.js";
import { SOL_ICON } from "./sol.js";
import { SNAKE_ICON } from "./snake.js";
import { CHECKERS_ICON } from "./checkers.js";

export interface GameLaunchers {
  mines(): void;
  sol(): void;
  snake(): void;
  checkers(): void;
}

export function openGamesFolder(wm: WM, launch: GameLaunchers): void {
  const existing = wm.get("games");
  if (existing?.isOpen()) {
    existing.focus();
    return;
  }
  const body = el(`<div></div>`);
  const pane = el(`<div class="sunken folderpane"></div>`);
  const items: [readonly string[], string, () => void][] = [
    [GAME_ICON_MINE, TITLES.mines, launch.mines],
    [SOL_ICON, TITLES.sol, launch.sol],
    [SNAKE_ICON, TITLES.snake, launch.snake],
    [CHECKERS_ICON, TITLES.checkers, launch.checkers],
  ];
  const ics: HTMLElement[] = [];
  for (const [rows, label, act] of items) {
    const ic = el(`<div class="fic"></div>`);
    ic.appendChild(iconCanvas(rows, 32));
    const lbl = el(`<span class="lbl"></span>`);
    lbl.textContent = label;
    ic.appendChild(lbl);
    ic.addEventListener("click", () => {
      ics.forEach((x) => x.classList.remove("sel"));
      ic.classList.add("sel");
    });
    ic.addEventListener("dblclick", act);
    pane.appendChild(ic);
    ics.push(ic);
  }
  const status = el(`<div class="statusbar"><div>4 object(s)</div></div>`);
  body.append(pane, status);
  wm.open({
    id: "games",
    title: TITLES.games,
    icon: ICONS.folder,
    x: 330,
    y: 470,
    w: 340,
    body,
    buttons: ["min", "close"],
  });
}
