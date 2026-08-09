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
export function mascotFace(mood: "up" | "down" | "shades"): THREE.CanvasTexture {
  const tex = propCanvas((g) => {
    g.fillStyle = "#c8991f";
    g.beginPath();
    g.arc(32, 32, 31, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#e2b743";
    g.beginPath();
    g.arc(32, 32, 24, 0, Math.PI * 2);
    g.fill();

    if (mood === "shades") {
      // The same disc, wearing sunglasses, and nothing accounts for it. One
      // black bar with two notches out of the bottom — read it as glasses or
      // read it as a censor bar; either is the joke, and at 64px they are the
      // same eleven pixels. The grin underneath is the `up` grin exactly, which
      // is what makes it unsettling rather than cool: this is the cheerful one.
      g.fillStyle = "#17111c";
      g.fillRect(12, 22, 40, 11);
      g.fillRect(28, 20, 8, 3);
      g.fillStyle = "#e2b743";
      g.fillRect(30, 31, 4, 2);
      // The glint — one hard white notch on one lens, never both. A specular
      // line is the whole vocabulary of cheap 3D chrome and it costs 12 texels.
      g.fillStyle = "#e8e4f0";
      g.fillRect(16, 24, 3, 6);
      g.fillRect(19, 24, 2, 3);

      g.fillStyle = "#17111c";
      g.fillRect(19, 40, 7, 4);
      g.fillRect(26, 44, 12, 4);
      g.fillRect(38, 40, 7, 4);
      return;
    }

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

/**
 * The mower's livery: municipal green, one stripe, and some rust.
 *
 * Plainer than it was, because the face is the prop. The first pass stencilled
 * GROUNDS / UNIT 1 across it and box-mapping put that on the body and the seat
 * at two different sizes — which is the truck's toy-commercial trick, and it
 * buried the one detail that makes this a character rather than a crate.
 */
export function mowerLivery(): THREE.CanvasTexture {
  return propCanvas((g) => {
    g.fillStyle = "#3f6b2e";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#2b4a1f";
    g.fillRect(0, 42, 64, 22);
    g.fillStyle = "#6aa348";
    g.fillRect(0, 38, 64, 4);
    // Rust, in three blocks, because a machine nobody has replaced has rust and
    // a machine somebody drew has rust in three blocks.
    g.fillStyle = "#8a5a2b";
    g.fillRect(6, 48, 7, 5);
    g.fillRect(41, 54, 10, 4);
  });
}

/**
 * The mower's face: two headlamp eyes and a mouth that is a radiator grille. It
 * has exactly one expression and holds it through an entire game of Connect 4.
 *
 * Cut out of a transparent tile (`alphaTest`) so it sits on the body as a decal
 * rather than as a lit panel — the livery shows through around it.
 */
export function mowerFace(): THREE.CanvasTexture {
  return propCanvas((g) => {
    // Headlamp eyes, big enough to be the prop's whole read from across the
    // frame. The first pass drew them at a mower's proportions and the harness
    // handed back a green box: a face is only a face if it is most of the tile.
    g.fillStyle = "#e8e4f0";
    g.fillRect(6, 10, 20, 18);
    g.fillRect(38, 10, 20, 18);
    g.fillStyle = "#17111c";
    // Pupils, both dead centre and both a little too small. Nobody is driving
    // and the machine is not concerned about that.
    g.fillRect(13, 16, 7, 9);
    g.fillRect(45, 16, 7, 9);
    // The grille: five bars, which is a mouth if it is on a face and a grille
    // if it is on a mower, and it is on both.
    g.fillStyle = "#17111c";
    g.fillRect(12, 40, 40, 16);
    g.fillStyle = "#8fae7c";
    for (let i = 0; i < 5; i++) g.fillRect(16 + i * 8, 44, 4, 9);
  });
}

/**
 * A planet nobody ordered: two bands and a terminator, in the void's own
 * colours so the interlude reads as somewhere else rather than as a bug.
 *
 * Bands rather than a gradient. A sphere this cheap has eight facets around, so
 * a smooth ramp lands one shade per facet and comes back looking like a shading
 * error — hard bands at least look like a decision somebody made in 1997.
 */
export function planetSkin(): THREE.CanvasTexture {
  return propCanvas((g) => {
    g.fillStyle = "#6b48ad";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#a884e0";
    g.fillRect(0, 12, 64, 9);
    g.fillStyle = "#4a2f7a";
    g.fillRect(0, 30, 64, 6);
    g.fillStyle = "#e4d2ff";
    g.fillRect(0, 44, 64, 3);
    // The terminator: the right third is simply darker, with a hard edge. No
    // light in this scene is responsible for it.
    g.fillStyle = "rgba(10, 6, 18, 0.55)";
    g.fillRect(42, 0, 22, 64);
    // The one storm. It is a rectangle.
    g.fillStyle = "#c9a2f5";
    g.fillRect(12, 22, 11, 6);
  });
}

/**
 * The ring, as a cut-out annulus on one tile. Drawn flat and mapped to a quad
 * rather than built as geometry: a torus is 400 triangles of a shape that is
 * two triangles of texture, and the law is the law.
 */
export function ringSkin(): THREE.CanvasTexture {
  return propCanvas((g) => {
    const band = (radius: number, width: number, color: string) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.beginPath();
      g.ellipse(32, 32, radius, radius * 0.3, 0, 0, Math.PI * 2);
      g.stroke();
    };
    band(30, 5, "#9d8ec2");
    band(24, 3, "#e4d2ff");
    band(19, 2, "#6b48ad");
  });
}

/**
 * A four-point sparkle, cut out of nothing. The whole star vocabulary of every
 * 1997 title card that wanted you to know something was shiny.
 *
 * One tile, two frames, chosen by the act on the step clock — a big one and a
 * small one, and nothing in between, so a field of them twinkles by swapping
 * cels rather than by fading. Fading is the one thing a sparkle must never do.
 */
export function sparkTexture(big: boolean): THREE.CanvasTexture {
  return propCanvas((g) => {
    const arm = big ? 30 : 18;
    const waist = big ? 5 : 3;
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.moveTo(32, 32 - arm);
    g.lineTo(32 + waist, 32 - waist);
    g.lineTo(32 + arm, 32);
    g.lineTo(32 + waist, 32 + waist);
    g.lineTo(32, 32 + arm);
    g.lineTo(32 - waist, 32 + waist);
    g.lineTo(32 - arm, 32);
    g.lineTo(32 - waist, 32 - waist);
    g.closePath();
    g.fill();
  });
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
 * Acorn's bumper: foam, in chevrons, in a colour nobody would choose.
 *
 * Tiled along the rail's length. A box's faces each get the whole 0..1 tile,
 * so on a rail fifteen units long and half a unit thick the chevrons came out
 * as four smeared streaks — the wrong kind of cheap, because it reads as a
 * stretched texture rather than as painted foam.
 */
export function bumperSkin(): THREE.CanvasTexture {
  const tex = propCanvas((g) => {
    g.fillStyle = "#c9a227";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#e8e4f0";
    for (let i = -64; i < 64; i += 20) {
      g.beginPath();
      g.moveTo(i, 64);
      g.lineTo(i + 9, 64);
      g.lineTo(i + 73, 0);
      g.lineTo(i + 64, 0);
      g.closePath();
      g.fill();
    }
    // The seam where two lengths of foam were pushed together and left.
    g.fillStyle = "#8f6f14";
    g.fillRect(0, 30, 64, 3);
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(9, 1);
  return tex;
}

/**
 * Pebble's slab: poured concrete with a word stencilled on it by whoever
 * stencils these. It says OK, which is the same small calm lie the About box
 * tells — a reaction with no content, which is the only thing a `threat` gag
 * is allowed to have.
 */
export function slabSkin(): THREE.CanvasTexture {
  return propCanvas((g) => {
    g.fillStyle = "#6f747c";
    g.fillRect(0, 0, 64, 64);
    // Aggregate: a fixed scatter, because wrongness repeats.
    g.fillStyle = "#5b6068";
    for (let i = 0; i < 40; i++) {
      const x = (i * 37) % 64;
      const y = (i * 23) % 64;
      g.fillRect(x, y, 2, 2);
    }
    g.fillStyle = "#3c4148";
    g.fillRect(0, 0, 64, 4);
    g.fillRect(0, 60, 64, 4);
    shout(g, "OK", "#c8ccd4", 42, 30);
  });
}

/** Bramble's pins. White, two bands, and a neck the machine got wrong. */
export function pinSkin(): THREE.CanvasTexture {
  return propCanvas((g) => {
    g.fillStyle = "#e8e4f0";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#a3164e";
    g.fillRect(0, 16, 64, 6);
    g.fillRect(0, 26, 64, 6);
    g.fillStyle = "#c8ccd4";
    g.fillRect(0, 52, 64, 12);
  });
}

/** Cinder's cups. Fairground stripes on something that holds nothing. */
export function cupSkin(): THREE.CanvasTexture {
  return propCanvas((g) => {
    g.fillStyle = "#e8e4f0";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#a3164e";
    for (let i = 0; i < 64; i += 16) g.fillRect(i, 0, 8, 64);
    g.fillStyle = "#2c2733";
    g.fillRect(0, 0, 64, 5);
  });
}

/**
 * Vane's scoreboard glass — two marks, stacked, on one tile.
 *
 * 64x32 with a mark in each half, so the component swaps what is displayed by
 * moving `offset.y` by a half rather than by owning two textures and two
 * materials. The lie costs one number.
 */
export function scoreGlass(): THREE.CanvasTexture {
  const tex = propCanvas((g) => {
    for (const [i, mark] of ["X", "F"].entries()) {
      const top = i * 16;
      g.fillStyle = "#0d0f0b";
      g.fillRect(0, top, 64, 16);
      g.fillStyle = "#1c2418";
      g.fillRect(2, top + 2, 60, 12);
      shout(g, mark, "#7fe018", top + 13, 13);
    }
  }, 32);
  // Two marks stacked in one tile: show half of it at a time.
  tex.repeat.set(1, 0.5);
  return tex;
}

/** The Oracle's machine: a bone panel, a grille, and one lamp that is on. */
export function machineSkin(): THREE.CanvasTexture {
  return propCanvas((g) => {
    g.fillStyle = "#d8d2c4";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#9d9483";
    g.fillRect(0, 0, 64, 3);
    g.fillRect(0, 61, 64, 3);
    // Grille.
    g.fillStyle = "#3a3730";
    for (let y = 20; y < 46; y += 5) g.fillRect(8, y, 48, 3);
    // The lamp. It has been on for a long time. Acid green rather than hazard
    // orange: the heat family means fever and nothing else, and a machine that
    // idles in it would read as the game heating up whenever the Oracle
    // wandered past.
    g.fillStyle = "#7fe018";
    g.fillRect(54, 8, 5, 5);
  });
}

/* -------------------------------------------------------------------------- *
 * The full-frame acts (phase 9). Same rules, one addition worth naming: three
 * of these props are large in frame — the piano falls past the whole board, the
 * finger is nearly as tall as it — and a 64px tile stretched over something
 * that big is four fat pixels per feature. So they carry *fewer* features,
 * larger, rather than the same detail smaller. A big prop is not a small prop
 * closer up.
 * -------------------------------------------------------------------------- */

/** The cannon: circus red, gold hoops, and a claim about the act. */
export function cannonLivery(): THREE.CanvasTexture {
  const tex = propCanvas((g) => {
    g.fillStyle = "#8f1230";
    g.fillRect(0, 0, 64, 64);
    // Hoops around the barrel. Tiled along its length, so these are the bands
    // you actually see rather than two smears at the ends.
    g.fillStyle = "#c9a227";
    g.fillRect(0, 6, 64, 7);
    g.fillRect(0, 51, 64, 7);
    g.fillStyle = "#e2b743";
    g.fillRect(0, 13, 64, 2);
    g.fillRect(0, 49, 64, 2);
    // One star, off centre, because it was applied by hand and not well.
    g.fillStyle = "#e8e4f0";
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      g.fillRect(26 + Math.cos(a) * 8, 30 + Math.sin(a) * 8, 5, 5);
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  return tex;
}

/**
 * The piano's lacquer: black, with the one hard specular line that is the
 * whole vocabulary of cheap 3D gloss. The prop stays Lambert — the shine is
 * painted on, which is the only way a flat-shaded thing gets to look polished.
 */
export function pianoLacquer(): THREE.CanvasTexture {
  return propCanvas((g) => {
    g.fillStyle = "#14101a";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#2c2733";
    g.fillRect(0, 46, 64, 18);
    // The highlight: two bands, hard-edged, running the length of the lid.
    g.fillStyle = "#4a4356";
    g.fillRect(0, 10, 64, 5);
    g.fillStyle = "#6d6480";
    g.fillRect(0, 15, 64, 2);
  });
}

/**
 * The keyboard. Eight whites with the sharps between them, on a tile the
 * keyboard's own shape — 64x16 rather than square, because this goes on a long
 * shallow strip and a square tile squeezed onto it is four fat pixels per key.
 *
 * The first pass put the eyes and the keys on one square tile and mapped it to
 * the whole front of the prop. Box faces each take the entire tile, so the
 * harness handed back a wide white bar with the face crushed into the top
 * centimetre of it. Two features at two aspect ratios want two tiles.
 */
export function pianoKeys(): THREE.CanvasTexture {
  return propCanvas((g) => {
    g.fillStyle = "#2c2733";
    g.fillRect(0, 0, 64, 16);
    g.fillStyle = "#e8e4f0";
    g.fillRect(1, 2, 62, 13);
    // The sharps. The row is a pixel short at one end because nobody measured.
    g.fillStyle = "#17111c";
    for (let i = 1; i < 8; i++) g.fillRect(i * 7.6, 2, 3, 8);
  }, 16);
}

/**
 * The piano's face: two eyes on the fallboard, as a cut-out decal.
 *
 * The keys were always going to be teeth — an instrument with a mouth is most
 * of the way to a character already, and the second trait says a prop with no
 * face is the weakest thing on the stage. So this is the two rectangles that
 * finish the job, and they are wide open, which is the only expression a thing
 * falling out of the top of the frame is entitled to.
 */
export function pianoFace(): THREE.CanvasTexture {
  return propCanvas((g) => {
    g.fillStyle = "#e8e4f0";
    g.fillRect(6, 16, 20, 26);
    g.fillRect(38, 16, 20, 26);
    g.fillStyle = "#17111c";
    // Pupils, both looking down, because that is where it is going.
    g.fillRect(12, 28, 9, 12);
    g.fillRect(44, 28, 9, 12);
  });
}

/**
 * The wrecking ball's iron: two bands of it, and nothing else.
 *
 * Lighter than iron is, because a dark sphere against a near-black void is a
 * silhouette — the harness handed back a hole in the picture with two eyes in
 * it. The facets have to catch something for the shape to read as round.
 */
export function ironSkin(): THREE.CanvasTexture {
  return propCanvas((g) => {
    g.fillStyle = "#59606b";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#464c56";
    g.fillRect(0, 26, 64, 14);
    g.fillStyle = "#767e8b";
    g.fillRect(0, 8, 64, 4);
    // Rust, in three blocks, same as the mower's — the alley has one weather.
    g.fillStyle = "#8a5a2b";
    g.fillRect(10, 46, 9, 6);
    g.fillRect(44, 18, 7, 5);
  });
}

/**
 * The wrecking ball's eyes, as a decal. Half-lidded and pointed slightly down
 * the way it is travelling: the ball is not alarmed about any of this and it is
 * important that it isn't.
 */
export function ironFace(): THREE.CanvasTexture {
  return propCanvas((g) => {
    g.fillStyle = "#e8e4f0";
    g.fillRect(8, 18, 18, 20);
    g.fillRect(38, 18, 18, 20);
    // The lids: a hard bar across the top half of each, which is the whole of
    // the expression. The iron's own mid tone, so it reads as the ball's
    // surface coming down over the eye rather than as a second colour.
    g.fillStyle = "#464c56";
    g.fillRect(8, 18, 18, 9);
    g.fillRect(38, 18, 18, 9);
    g.fillStyle = "#17111c";
    g.fillRect(14, 27, 7, 9);
    g.fillRect(44, 27, 7, 9);
  });
}

/**
 * The mirror ball's facets: a hard grid of silver squares with the grout
 * showing. Two rows are brighter than the rest and always the same two, so the
 * stepped spin reads as glints going past rather than as the ball flickering.
 */
export function mirrorFacets(): THREE.CanvasTexture {
  const tex = propCanvas((g) => {
    g.fillStyle = "#2c2733";
    g.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const bright = y === 2 || (y === 5 && x % 2 === 0);
        g.fillStyle = bright ? "#f2f0f8" : (x + y) % 2 === 0 ? "#a9aebb" : "#868c99";
        g.fillRect(x * 8 + 1, y * 8 + 1, 6, 6);
      }
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  return tex;
}

/**
 * The foam finger. A number, a word, and a colour that was chosen from a list
 * of two — the sponsor decal the truck wears, moved onto merchandise.
 *
 * `NO. 1` rather than `#1`: the hash sets narrow and closed up at this size and
 * came back from the harness as a smudge over the numeral.
 */
export function foamSkin(): THREE.CanvasTexture {
  return propCanvas((g) => {
    g.fillStyle = "#7fe018";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#5fae10";
    g.fillRect(0, 0, 64, 6);
    g.fillRect(0, 58, 64, 6);
    shout(g, "NO. 1", "#17111c", 40, 30);
  });
}

/** The washer's plank, and the rig that is about to stop holding it up. */
export function plankSkin(): THREE.CanvasTexture {
  return propCanvas((g) => {
    g.fillStyle = "#8a6a3b";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#6d5330";
    for (let i = 0; i < 64; i += 21) g.fillRect(i, 0, 3, 64);
    g.fillStyle = "#a98a54";
    g.fillRect(0, 24, 64, 5);
  });
}

/* -------------------------------------------------------------------------- *
 * WordArt — the thing the wordmark is, on a prop.
 *
 * The stage's words used to be three offset passes of grey on a black tile,
 * which is a bevel, not WordArt: the slab read as a title-safe box with a
 * caption in it, and the caption was the same shape every time. What the icon
 * and the wordmark actually do (`app.css`, `.wordmark`) is four things at once,
 * and all four port to a 64px tile:
 *
 *   - a skew, because WordArt's whole gesture is the lean;
 *   - a *banded* ramp down the letterform — sky, steel, a horizon flash, then
 *     ground. Banded, not blended: a smooth chrome gradient is an airbrush and
 *     a banded one is a 1997 title screen;
 *   - a hard ink outline thick enough to survive being magnified two metres
 *     wide, which is what lets the word sit on the void with no box behind it;
 *   - a one-texel drop shadow, so it reads as a sticker laid on the scene.
 *
 * And a gallery, because one preset is a house style and WordArt was never a
 * house style — it was thirty of them in a grid and you picked the loudest.
 * Which preset a word gets is fixed per act in `registry.ts`, so this is
 * variety, not randomness: the taste law lets chance pick which gag fires and
 * never how it looks.
 * -------------------------------------------------------------------------- */

/** The presets, in the family of the wordmark's ramp without being it twice. */
export type WordArtStyle = "chrome" | "heat" | "acid" | "void" | "rainbow";

/**
 * A ramp is `[endOfBand, colour]` down the letterform, 0 at the cap line and 1
 * at the baseline. Every band is emitted as two gradient stops at the same
 * offset, which is what makes the step hard.
 *
 * Four bands, not the wordmark's eight. Eight is right at 62px and is noise at
 * twelve: the cap height here is about eight texels, so eight bands is a band
 * per texel and the letterform came back looking like interference rather than
 * like metal. Four gives every band two texels — sky, a flash, the horizon,
 * then ground, which is the same read at a size that can hold it.
 *
 * The order of those four is the whole trick, and getting it wrong is subtle:
 * a wide dark band through the middle of a long squeezed word doesn't read as
 * a horizon, it reads as *two words stacked*, because the eye takes the light
 * half and the light half below it as separate objects. What fixes it is the
 * flash — one texel of near-white immediately above one texel of near-black.
 * A hard specular line reads as metal catching light; the same two colours in
 * wider bands read as a sandwich.
 */
const WORD_ART: Record<WordArtStyle, { ramp: [number, string][]; ink: string }> = {
  // The wordmark's ramp, thinned to four. The one the software uses to say its
  // own name, so the act that states a fact gets to borrow it.
  chrome: {
    ramp: [
      [0.36, "#e8e4f0"],
      [0.48, "#ffffff"],
      [0.58, "#2a1d40"],
      [1, "#9d8ec2"],
    ],
    ink: "#150d22",
  },
  // Sunset, which is the other 1997 preset everybody used. The horizon sits
  // where chrome's does, so the two read as one object in two finishes.
  heat: {
    ramp: [
      [0.36, "#ffc23d"],
      [0.48, "#fff6d8"],
      [0.58, "#a3164e"],
      [1, "#ed5705"],
    ],
    ink: "#2a0710",
  },
  acid: {
    ramp: [
      [0.36, "#b7f04d"],
      [0.48, "#f2ffd6"],
      [0.58, "#1f4a08"],
      [1, "#6fc714"],
    ],
    ink: "#0d1a05",
  },
  // Purple, and further from chrome than it first was: both are the void's own
  // colours and the first pass made them near enough that `HUH.` and
  // `STILL HERE` read as one preset in two words, which is the opposite of a
  // gallery. This one is saturated where chrome is silver.
  void: {
    ramp: [
      [0.36, "#a884e0"],
      [0.48, "#e4d2ff"],
      [0.58, "#1a0f2e"],
      [1, "#6b48ad"],
    ],
    ink: "#0a0612",
  },
  /**
   * The one preset that isn't pretending to be metal.
   *
   * Every other ramp here is a finish — sky, flash, horizon, ground — and this
   * one is four flat colours that have no business touching, which is the
   * actual 1997 artifact: the gradient fill picked out of a grid by somebody
   * who wanted the word to be *more*, applied to a word that needed none of it.
   * It has no dark band at all, so it has no horizon and no volume; it reads as
   * a sticker rather than as an object, and that is what it is for. It goes on
   * the words that are enthusiastic about nothing.
   *
   * It still gets the same ink ring, which is the only reason it survives the
   * vote — four light bands with no outline would come back as a bright smear.
   */
  rainbow: {
    ramp: [
      [0.3, "#ff3ba7"],
      [0.52, "#ffd200"],
      [0.74, "#2fe3c8"],
      [1, "#7a5cff"],
    ],
    ink: "#150d22",
  },
};

/**
 * A word in WordArt, cut out of its tile — no slab, no box, just the letters.
 *
 * 64x16 rather than 64x64, and that's the whole reason it's legible. The banner
 * quad is 5.2 by 1.4 — nearly 4:1 — so a square tile spent three quarters of its
 * pixels on empty space above and below the word and then magnified the ten
 * pixels of actual letter across two metres of screen. Matching the tile's
 * aspect to the quad's puts every pixel in the budget into the letters. Still
 * ≤64px, still nearest, still no mipmaps: the law is the size, not the shape.
 *
 * The transparent background is the reason `usePropMaterial` grew `alphaTest`:
 * with no slab, the tile is mostly nothing, and nothing has to be *cut*, not
 * blended (see `material.ts`).
 *
 * It is drawn at 3x and brought down by **majority vote**, which is the step
 * that makes it look drawn rather than typeset. Canvas antialiases every glyph
 * edge, so an edge texel is a blend — and a nearest filter magnifying a blend
 * does not give you a hard pixel, it gives you a large soft one. Ten texels of
 * blur become two metres of blur at the lens.
 *
 * Voting rather than thresholding, and that distinction cost a pass to learn.
 * Snapping each texel of a 1x render to the nearest of the five colours the
 * tile is allowed is the obvious version, and it eats the outline: the ink ring
 * is under a texel wide, so most of it is a blend that snaps to whichever side
 * of it happened to dominate, and the word comes back eroded with a confetti of
 * mid-tones along every edge. At 3x the ring is nearly three subpixels and
 * simply wins its texels. A vote can also only ever return a colour that was
 * actually there, which is what kills the confetti — an average can invent a
 * colour, and every colour it invents is one nobody chose.
 */
export function wordArt(text: string, style: WordArtStyle = "chrome"): THREE.CanvasTexture {
  const { ramp, ink } = WORD_ART[style];
  const SIZE = 12;
  /**
   * Baseline and cap line for Arial Black at this size. The word sits high in
   * the tile on purpose: the outline paints outside the glyph and the shadow
   * falls a texel below it, and both have to stay on the tile.
   */
  const BASE = 12;
  const CAP = 3.5;
  /**
   * The lean, which is most of what makes this read as WordArt.
   *
   * tan(17°), not the wordmark's tan(8°). Matching the angle was the obvious
   * thing and it came back looking upright: the wordmark leans 8° across 45px
   * of cap height and gets six pixels of shift out of it, while this tile has
   * eight pixels of cap height and got one. The lean has to be legible in whole
   * texels or it isn't there, so the prop leans about twice as hard as the
   * chrome does and arrives at the same place.
   */
  const SKEW = 0.3;

  return propCanvas((tile) => {
    // Everything below is drawn in tile coordinates; the 3x is a scale on the
    // way in and a vote on the way out, and nothing in between knows about it.
    const hi = document.createElement("canvas");
    hi.width = 64 * SUPERSAMPLE;
    hi.height = 16 * SUPERSAMPLE;
    const g = hi.getContext("2d")!;
    g.scale(SUPERSAMPLE, SUPERSAMPLE);

    g.font = `bold ${SIZE}px "Arial Black", monospace`;
    g.textAlign = "center";
    g.lineJoin = "miter";
    g.miterLimit = 2;

    // Squeeze rather than shrink, same as `shout`: stretched letterforms are the
    // period, and a legible word matters more than its proportions. The budget
    // is tighter here because the outline paints outside the glyphs.
    const width = g.measureText(text).width;
    const USABLE = 54;
    const squeeze = width > USABLE ? USABLE / width : 1;

    // Skew about the middle of the word rather than about the baseline, so the
    // lean doesn't also walk the word sideways out of the tile.
    const mid = (CAP + BASE) / 2;
    g.translate(32, 0);
    g.transform(1, 0, -SKEW, 1, 0, 0);
    g.translate(SKEW * mid, 0);
    g.scale(squeeze, 1);

    const draw = (fill: string | CanvasGradient, dx: number, dy: number, stroke: boolean) => {
      if (stroke) {
        g.strokeStyle = ink;
        // Just under a texel outside the glyph. The wordmark's 7-on-62 scales
        // to 2.6 here and that is emphatically too much: a ten-letter word is
        // squeezed until its gaps are two texels wide, and an outline that
        // wide closes every one of them — `STILL HERE` came back as a black
        // bar with some light in it, which is the slab this rebuild exists to
        // get rid of, reintroduced from the other side.
        //
        // Not divided by the squeeze either: the pen is inside the squeezed
        // frame, so dividing would fix the sides and blow the top and bottom
        // out. A squeezed word has thinner stems anyway.
        g.lineWidth = 1.7;
        g.strokeText(text, dx, BASE + dy);
      }
      g.fillStyle = fill;
      g.fillText(text, dx, BASE + dy);
    };

    // The sticker shadow, and it is a *fill*, not a second outlined word.
    // Stroking it too was the first version and it read as the word printed
    // twice: the outline puts ink most of a texel outside the glyph in every
    // direction, so a stroked shadow pokes out above the letters as well as
    // below and stops being a shadow. Filled and offset down-right, all that
    // escapes the real word's outline is the sliver that should.
    draw(ink, 1, 2, false);

    const grad = g.createLinearGradient(0, CAP, 0, BASE);
    let from = 0;
    for (const [to, color] of ramp) {
      // Two stops per band at the same offsets it starts and ends: the ramp
      // steps rather than blends, which is the difference between a 1997 title
      // screen and an airbrush.
      grad.addColorStop(from, color);
      grad.addColorStop(to, color);
      from = to;
    }
    draw(grad, 0, 0, true);

    // And now throw away everything the renderer decided in between.
    vote(g, tile, 64, 16, [ink, ...ramp.map(([, color]) => color)]);
  }, 16);
}

/**
 * Subpixels per texel per axis on the way to the vote. Nine samples.
 *
 * Three, and four is worse — which is not what more sampling usually does. The
 * ink ring is a shade under a texel wide, so at 4x it reliably owns nine of
 * sixteen subpixels in every boundary texel and wins them all; the outline puts
 * on a texel everywhere at once and `HUH.` closes up into a purple brick. Nine
 * samples leave the ring winning the texels it is mostly in and losing the ones
 * it is barely in, which is the ragged one-texel edge the art wants.
 */
const SUPERSAMPLE = 3;

/**
 * Bring a 3x render down to the tile: each texel becomes whichever of the
 * palette (or nothing at all) the most of its nine subpixels wanted.
 *
 * Ink is first in the palette and wins ties, which is deliberate. An outline
 * that loses a coin flip has a hole in it, and one hole in a one-texel ring is
 * the whole difference between a letter with an edge and a letter with a
 * scratch on it. A word that wins its ties comes out a shade heavier than the
 * renderer drew it, which is what a hand-drawn one would have been anyway.
 */
function vote(
  from: CanvasRenderingContext2D,
  to: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: string[],
): void {
  const rgb = palette.map((hex) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]);
  const source = from.getImageData(0, 0, width * SUPERSAMPLE, height * SUPERSAMPLE).data;
  const out = to.createImageData(width, height);
  // One slot per palette entry; transparent is counted separately because it
  // has no colour to be nearest to.
  const votes = new Array<number>(rgb.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      votes.fill(0);
      let clear = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const i =
            (((y * SUPERSAMPLE + sy) * width * SUPERSAMPLE + x * SUPERSAMPLE + sx) << 2);
          if (source[i + 3]! < 128) {
            clear++;
            continue;
          }
          let best = 0;
          let bestDistance = Infinity;
          for (let p = 0; p < rgb.length; p++) {
            const [r, gg, b] = rgb[p]!;
            const distance =
              (source[i]! - r!) ** 2 + (source[i + 1]! - gg!) ** 2 + (source[i + 2]! - b!) ** 2;
            if (distance < bestDistance) {
              bestDistance = distance;
              best = p;
            }
          }
          votes[best]!++;
        }
      }

      let winner = 0;
      let count = votes[0]!;
      for (let p = 1; p < votes.length; p++) {
        // Strictly greater, so the earliest palette entry holds a tie — and
        // the palette starts with ink.
        if (votes[p]! > count) {
          count = votes[p]!;
          winner = p;
        }
      }
      // Nothing only wins outright. A texel the glyph half covers belongs to
      // the glyph; that is the shade of extra weight a hand-drawn one has.
      if (count < clear) winner = -1;

      const o = (y * width + x) << 2;
      if (winner < 0) continue; // left at zero: transparent, and hard about it
      const [r, gg, b] = rgb[winner]!;
      out.data[o] = r!;
      out.data[o + 1] = gg!;
      out.data[o + 2] = b!;
      out.data[o + 3] = 255;
    }
  }
  to.putImageData(out, 0, 0);
}
