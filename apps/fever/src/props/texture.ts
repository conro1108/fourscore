/**
 * Prop textures are generated on a canvas at 64px and nearest-filtered — the
 * cheap side of the budget law, by law: ≤64px, no mipmaps, no smoothing.
 * Every prop texture in the game comes from a function in this style.
 */

import * as THREE from "three";

/** Draw a word across the whole 64px tile, squeezed to fit. Blocky by law. */
function shout(
  g: CanvasRenderingContext2D,
  text: string,
  color: string,
  y: number,
  size = 13,
): void {
  g.save();
  g.fillStyle = color;
  g.font = `bold ${size}px "Arial Black", monospace`;
  g.textAlign = "center";
  const width = g.measureText(text).width;
  // Squeeze rather than shrink: stretched letterforms are the period, and a
  // legible word matters more than its proportions on a 64px prop tile.
  if (width > 60) g.scale(60 / width, 1);
  g.fillText(text, width > 60 ? (32 * width) / 60 : 32, y);
  g.restore();
}

function propCanvas(
  draw: (g: CanvasRenderingContext2D) => void,
  height = 64,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = height;
  const g = canvas.getContext("2d")!;
  draw(g);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * The truck's livery: black panel, chrome top stripe, acid-green flames along
 * the rocker, and the sponsor nobody paid for — which the decal says out loud.
 * Box-mapped — the whole decal
 * lands on every face, which is exactly the wrong-scale toy-commercial energy
 * the prop budget wants.
 */
export function truckLivery(): THREE.CanvasTexture {
  return propCanvas((g) => {
    g.fillStyle = "#17111c";
    g.fillRect(0, 0, 64, 64);

    // Chrome stripe up top.
    g.fillStyle = "#c8ccd4";
    g.fillRect(0, 4, 64, 6);
    g.fillStyle = "#7d8390";
    g.fillRect(0, 10, 64, 2);

    // Acid flames licking up from the rocker panel.
    g.fillStyle = "#7fe018";
    for (let i = 0; i < 6; i++) {
      const x = i * 11 - 2;
      g.beginPath();
      g.moveTo(x, 64);
      g.lineTo(x + 5, 38 + (i % 2) * 7);
      g.lineTo(x + 10, 64);
      g.closePath();
      g.fill();
    }
    g.fillStyle = "#b7f04d";
    for (let i = 0; i < 6; i++) {
      const x = i * 11 - 2;
      g.beginPath();
      g.moveTo(x + 2, 64);
      g.lineTo(x + 5, 48 + (i % 2) * 5);
      g.lineTo(x + 8, 64);
      g.closePath();
      g.fill();
    }

    // The sponsor.
    g.fillStyle = "#e8e4f0";
    g.font = "bold 9px monospace";
    g.fillText("4SCORE", 12, 24);
    g.fillStyle = "#7fe018";
    g.font = "bold 7px monospace";
    g.fillText("UNPAID", 14, 33);
  });
}

/**
 * The rocket: white with a red band and a sponsor, because every cheap rocket
 * in every toy commercial is white with a red band and a sponsor.
 */
export function rocketSkin(): THREE.CanvasTexture {
  return propCanvas((g) => {
    g.fillStyle = "#e8e4f0";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#a3164e";
    g.fillRect(0, 22, 64, 10);
    g.fillStyle = "#2c2733";
    g.fillRect(0, 33, 64, 2);
    shout(g, "4SCORE", "#2c2733", 17, 11);
    g.fillStyle = "#7fe018";
    g.fillRect(4, 44, 56, 3);
    g.fillRect(4, 52, 56, 3);
  });
}

/**
 * The mascot's face: two dot eyes and a mouth, on a disc.
 *
 * Drawn at the same 64px as everything else and deliberately not centred well.
 * A lane screen's cast is a company logo with eyes stuck on it — the face is
 * an overlay somebody added, not a character somebody designed, and it should
 * look like it.
 */
export function mascotFace(mood: "up" | "down"): THREE.CanvasTexture {
  const tex = propCanvas((g) => {
    g.fillStyle = "#c8991f";
    g.beginPath();
    g.arc(32, 32, 31, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#e2b743";
    g.beginPath();
    g.arc(32, 32, 24, 0, Math.PI * 2);
    g.fill();

    // Eyes: squares, because circles at 64px are four pixels of mush.
    g.fillStyle = "#17111c";
    g.fillRect(19, 22, 8, 10);
    g.fillRect(38, 22, 8, 10);
    // The one asymmetry, and it repeats: the right eye sits a pixel low.
    g.fillStyle = "#e8e4f0";
    g.fillRect(21, 24, 3, 3);
    g.fillRect(40, 25, 3, 3);

    g.fillStyle = "#17111c";
    if (mood === "up") {
      // A smile as three stepped blocks. Nothing here is a curve.
      g.fillRect(19, 40, 7, 4);
      g.fillRect(26, 44, 12, 4);
      g.fillRect(38, 40, 7, 4);
    } else {
      // Flat and a little open. Dismay, drawn by a machine that has heard of it.
      g.fillRect(24, 45, 17, 4);
      g.fillRect(28, 41, 9, 4);
    }
  });
  // A cylinder cap's UVs are laid out in the cylinder's own XZ plane, so on a
  // disc stood on its edge the face arrives a quarter turn over — eyes stacked,
  // mouth off to one side. Turning the texture is the fix; turning the mesh
  // would fight the roll animation for the same axis.
  tex.center.set(0.5, 0.5);
  tex.rotation = Math.PI / 2;
  return tex;
}

/** Hazard stripes, for the threat beacon. The heat family means fever. */
export function hazardSkin(): THREE.CanvasTexture {
  return propCanvas((g) => {
    g.fillStyle = "#17111c";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#ed5705";
    for (let i = -64; i < 64; i += 16) {
      g.beginPath();
      g.moveTo(i, 64);
      g.lineTo(i + 8, 64);
      g.lineTo(i + 72, 0);
      g.lineTo(i + 64, 0);
      g.closePath();
      g.fill();
    }
  });
}

/**
 * A sign on a stick. One word, hand-lettered by a machine that has never seen
 * a hand. Acid green on black — jank accent, props only.
 */
export function signFace(text: string): THREE.CanvasTexture {
  return propCanvas((g) => {
    g.fillStyle = "#17111c";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#7fe018";
    g.fillRect(2, 2, 60, 60);
    g.fillStyle = "#17111c";
    g.fillRect(5, 5, 54, 54);
    shout(g, text, "#b7f04d", 40, 20);
  });
}

/**
 * Tow-banner cloth. Drawn as one phrase on one tile so the component can set
 * `repeat.x` and say it as many times as it likes for the price of one
 * texture — which is also, exactly, how a real banner says it.
 */
export function bannerCloth(text: string): THREE.CanvasTexture {
  const tex = propCanvas((g) => {
    g.fillStyle = "#e8e4f0";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#a3164e";
    g.fillRect(0, 0, 64, 6);
    g.fillRect(0, 58, 64, 6);
    shout(g, text, "#17111c", 42, 26);
  });
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/**
 * The win banner: chrome WordArt, the display face of the possessed software,
 * on the one prop that gets to state a fact.
 *
 * 64x16 rather than 64x64, and that's the whole reason it's legible. The banner
 * quad is 5.2 by 1.4 — nearly 4:1 — so a square tile spent three quarters of its
 * pixels on empty space above and below the word and then magnified the ten
 * pixels of actual letter across two metres of screen. Matching the tile's
 * aspect to the quad's puts every pixel in the budget into the letters. Still
 * ≤64px, still nearest, still no mipmaps: the law is the size, not the shape.
 */
export function wordArt(text: string): THREE.CanvasTexture {
  return propCanvas((g) => {
    g.fillStyle = "#0a0612";
    g.fillRect(0, 0, 64, 16);
    // Chrome bevel: three passes, offset by a pixel each, dark to light.
    shout(g, text, "#3a2f42", 14, 12);
    shout(g, text, "#7d8390", 13, 12);
    shout(g, text, "#e8e4f0", 12, 12);
    g.fillStyle = "#ed5705";
    g.fillRect(0, 15, 64, 1);
    g.fillStyle = "#c8991f";
    g.fillRect(0, 0, 64, 1);
  }, 16);
}
