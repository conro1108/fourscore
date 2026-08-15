/**
 * Shut Down, and the restart behind it.
 *
 * A long possessed session leaves the desk littered — dialogs the fever
 * opened, six games running, windows dragged into corners, a screensaver that
 * won. The period already owns the verb for "reset the whole screen", so this
 * machine reboots rather than growing a Clear Desktop button no 1995 desktop
 * ever had. Start ▸ Shut Down is the mouse's door; Ctrl+Alt+Del is the other
 * one (wired in main.ts), because that is the gesture the reflex reaches for.
 *
 * **What a restart clears is the machine's runtime**: every window, the fever
 * and everything it did (drifted icons, the drag-ghost trail, the clock's
 * grip, the extra flames.scr previews), the screensaver, the beats, and the
 * game in progress. The desktop comes back at its authored boot pose.
 *
 * **What it does not touch is the disk or the Control Panel.** `exe.fs` — the
 * player's readme.txt, asm.txt and anything they saved — survives untouched;
 * a reboot that ate your files is exactly the fake data loss DIRECTION.md
 * forbids. So do the settings: the chip style, the sound scheme and volume,
 * Minesweeper's size, the chess skill, and the game icons dragged out of the
 * folder onto the desk. A machine that forgot how you had set it up would not
 * be the same machine coming back. Nothing in here writes to localStorage at
 * all, which is how that promise is kept rather than maintained.
 *
 * The mechanism is an honest page load, which is why the paragraphs above are
 * a description and not a teardown that could drift out of date: nothing can
 * be left half-torn-down by a navigation. It is `replace()` rather than
 * `reload()` because a reload carries the harness's pose back in with it, and
 * a restart out of `?state=win` has to land on a desktop, not back in the win.
 */

import { el } from "./dom.js";
import { play } from "./audio/index.js";
import { REBOOT, SHUTDOWN, DIALOG } from "./copy.js";
import type { WM, Win } from "./wm.js";

/** Where a restart lands: this page, with every deep-link param stripped. */
export const cleanUrl = (href: string): string => new URL(href).pathname;

/* ---- the beat, as data, so a test can hold it to its promise ----
   Short by law: the player asked for a clean desk, not a cutscene. */
/** When the POST replaces the shutdown line. */
export const POST_AT = 700;
/** Between POST lines. Stepped, like everything else here — never eased. */
export const LINE_GAP = 180;
/** When the machine actually goes. */
export const GO_AT = 1700;
/** If the navigation is refused, the desk comes back this long after. */
const FAILSAFE = 4000;

export interface RestartOpts {
  /** Draw the beat and stop there — the `?state=reboot` pose, so the shutter
      and `npm run timeline` can look at a screen that would otherwise have
      navigated out from under them. Never set in play. */
  hold?: boolean;
}

/**
 * Reboot the machine: a black screen, the POST, and then a real page load.
 *
 * The player cannot get stuck in it three ways over — any key or click skips
 * straight to the load, the load is scheduled the moment the screen goes
 * black rather than at the end of a chain, and if the navigation is somehow
 * refused the overlay takes itself off and hands the desk back.
 */
export function restart(stage: HTMLElement, opts: RestartOpts = {}): void {
  /* The machine's own console: the terminal's black, its grey and its
     Courier. Inline because this is one element that exists for 1.7 seconds,
     and chrome.css is the shared sheet. It lives on the stage so it scales
     with the monitor, and above everything the chrome owns (#saver 240,
     #startmenu 300, FEVER.CTL 400). */
  const screen = el(
    `<div id="reboot" style="position:absolute;inset:0;z-index:500;background:#000;` +
      `color:#c0c0c0;font:14px 'Courier New',monospace;line-height:1.45;padding:14px 16px;` +
      `white-space:pre;overflow:hidden"></div>`,
  );
  const line = (text: string): void => {
    const d = el(`<div></div>`);
    d.textContent = text;
    screen.appendChild(d);
  };
  line(REBOOT.wait);
  stage.appendChild(screen);
  // "Exit Windows" — the scheme already has it, and this is finally the event
  // it was named for. The boot chime is deliberately not played here: after
  // the load the machine has been sitting there since the page loaded and
  // plays `startup` at the first touch, which is the audio law, not a gap.
  play("shutdown-chime", 0.7);

  const timers: number[] = [];
  const at = (ms: number, fn: () => void): void => {
    timers.push(setTimeout(fn, ms) as unknown as number);
  };

  at(POST_AT, () => {
    screen.textContent = "";
    REBOOT.post.forEach((text, i) =>
      at(i * LINE_GAP, () => {
        line(text);
        // the drive light, on the line that claims to be looking for one
        if (text.includes("IDE")) play("drive-seek", 0.5);
      }),
    );
  });

  let gone = false;
  const go = (): void => {
    if (gone) return;
    gone = true;
    timers.forEach(clearTimeout);
    removeEventListener("pointerdown", go, true);
    removeEventListener("keydown", go, true);
    if (opts.hold) return;
    // armed before the navigation, not after: a refused `replace()` that
    // throws would otherwise leave the player looking at a black screen
    setTimeout(() => screen.remove(), FAILSAFE);
    const url = cleanUrl(location.href);
    if (location.search || location.hash) location.replace(url);
    else location.reload();
  };
  at(GO_AT, go);
  // A skip, but not from the click that pressed Yes — that pointer is still
  // on its way up when this runs.
  if (!opts.hold)
    at(300, () => {
      addEventListener("pointerdown", go, true);
      addEventListener("keydown", go, true);
    });
}

/* ---- Start ▸ Shut Down ---- */

/** One at a time: two doors open onto this, and the Start menu repeats. */
let chooser: Win | undefined;

/**
 * The period's Shut Down box: a question, radio buttons, Yes / No / Help.
 * Every control does something (the second law) — shutting down is refused in
 * the machine's own words, restarting is real, and Help opens help.txt the
 * way the real button did.
 */
export function openShutdown(wm: WM, deps: { stage: HTMLElement; help(): void }): void {
  if (chooser?.isOpen()) {
    chooser.focus();
    return;
  }
  let choice = 0;
  const rows = SHUTDOWN.options
    .map(
      (label, i) =>
        `<label class="cbrow" data-opt="${i}"><span class="rad" style="width:12px;height:12px;` +
        `flex:none;border-radius:50%;background:#fff;position:relative;box-shadow:inset 1px 1px #0a0a0a,` +
        `inset -1px -1px #fff,inset 2px 2px #808080,inset -2px -2px #dfdfdf"><i style="position:absolute;` +
        `left:4px;top:4px;width:4px;height:4px;background:#000;border-radius:50%"></i></span>` +
        `<span>${label}</span></label>`,
    )
    .join("");
  const win = wm.dialog({
    title: SHUTDOWN.title,
    body: `${SHUTDOWN.prompt}<div style="margin:8px 0 2px 4px">${rows}</div>`,
    buttons: [SHUTDOWN.yes, SHUTDOWN.no, SHUTDOWN.help],
    x: 450,
    y: 300,
    ax: "center",
    w: 356,
    onButton(i) {
      if (i === 2) {
        deps.help();
        return;
      }
      if (i !== 0) return; // No. The machine goes on being the way it is.
      if (choice === 1) restart(deps.stage);
      else
        wm.dialog({
          title: DIALOG.shutdown.title,
          body: DIALOG.shutdown.body,
          icon: "!",
          buttons: ["OK", "OK"],
          x: 450,
          y: 310,
          ax: "center",
          w: 360,
          // it does not shut down, but it says the thing it says on the way out
          sound: "shutdown-chime",
        });
    },
  });
  chooser = win;
  const dots = [...win.body.querySelectorAll<HTMLElement>("[data-opt] i")];
  const draw = (): void =>
    dots.forEach((d, i) => (d.style.display = i === choice ? "block" : "none"));
  win.body.querySelectorAll<HTMLElement>("[data-opt]").forEach((row, i) =>
    row.addEventListener("click", () => {
      choice = i;
      draw();
    }),
  );
  draw();
}
