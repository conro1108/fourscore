/**
 * Prop textures are generated on a canvas at 64px and nearest-filtered — the
 * cheap side of the budget law, by law: ≤64px, no mipmaps, no smoothing.
 * Every prop texture in the game comes from a function in this style.
 */

import * as THREE from "three";

function propCanvas(draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
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
 * the rocker, and the sponsor nobody paid for. Box-mapped — the whole decal
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
    g.fillText("SUNDAY", 14, 33);
  });
}
