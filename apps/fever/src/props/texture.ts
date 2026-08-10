/**
 * Prop textures are generated on a canvas at 64px and nearest-filtered — the
 * cheap side of the budget law, by law: ≤64px, no mipmaps, no smoothing.
 * Every prop texture in the game comes from a function in this style.
 *
 * One exception, and only one: `wordArt` ships a 128x32 tile. It is type rather
 * than a livery, it is the largest thing that ever appears on screen, and the
 * argument for it is written where it lives — see the note on that function.
 */

import * as THREE from "three";

/**
 * The shared outline ink, the same one the wordmark and the sibling projects
 * use. A prop that is going to sit on a near-black void needs an edge that is
 * darker than its own body and lighter than the void, and one ink everywhere is
 * what keeps nine props reading as one cast.
 */
const INK = "#402e3a";

/**
 * Draw the ink border every box-mapped livery wears.
 *
 * Box mapping hands the whole tile to every face, so a border on the tile is an
 * outline on every face — a cel outline for two `fillRect`s and no geometry. It
 * is the cheapest thing in this file and the single biggest reason the reworked
 * props read as objects instead of as untextured blocks.
 */
function inkEdge(g: CanvasRenderingContext2D, weight = 3): void {
  g.fillStyle = INK;
  g.fillRect(0, 0, 64, weight);
  g.fillRect(0, 64 - weight, 64, weight);
  g.fillRect(0, 0, weight, 64);
  g.fillRect(64 - weight, 0, weight, 64);
}

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
  width = 64,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
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
 * The truck's livery: a white panel, crimson flames off the rocker with acid
 * cores, and the sponsor nobody paid for — which the decal says out loud.
 * Box-mapped — the whole decal lands on every face, which is exactly the
 * wrong-scale toy-commercial energy the prop budget wants.
 *
 * It was black with green flames, and that was the single worst thing on the
 * stage: the void is dark purple and near-black, so a black truck crossing it
 * is a hole with an equalizer painted on. Value contrast is what a silhouette
 * is made of, and this prop is the one the whole redesign is judged against —
 * so the body is now the brightest thing in the frame that isn't a disc, and
 * the flames carry the colour instead of the paint.
 */
export function truckLivery(): THREE.CanvasTexture {
  return propCanvas((g) => {
    g.fillStyle = "#eceaf4";
    g.fillRect(0, 0, 64, 64);
    // A cooler band down the lower half so a flat-shaded box still has a top
    // and a bottom when the light happens to hit it square on.
    g.fillStyle = "#cdc9dc";
    g.fillRect(0, 36, 64, 28);

    // Crimson flames licking up from the rocker panel, with acid cores. Big
    // enough to survive being cropped by whichever face they land on.
    g.fillStyle = "#a3164e";
    for (let i = 0; i < 5; i++) {
      const x = i * 13 - 3;
      g.beginPath();
      g.moveTo(x, 64);
      g.lineTo(x + 6, 26 + (i % 2) * 9);
      g.lineTo(x + 13, 64);
      g.closePath();
      g.fill();
    }
    g.fillStyle = "#7fe018";
    for (let i = 0; i < 5; i++) {
      const x = i * 13 - 3;
      g.beginPath();
      g.moveTo(x + 3, 64);
      g.lineTo(x + 6, 40 + (i % 2) * 7);
      g.lineTo(x + 10, 64);
      g.closePath();
      g.fill();
    }

    // The sponsor, in ink rather than in white: on a white panel the old
    // light-on-dark decal disappeared entirely.
    shout(g, "4SCORE", INK, 20, 15);
    g.fillStyle = "#a3164e";
    g.font = "bold 8px monospace";
    g.fillText("UNPAID", 15, 30);

    inkEdge(g, 3);
  });
}

/**
 * The truck's tyre: a dark carcass with chunky lugs around it.
 *
 * Only the cylinder's *side* gets this. The old wheel was one flat dark
 * material on all three slots and it came back from the harness as a black
 * hexagonal prism the size of the body — a shape with no interior detail reads
 * as a hole, and four holes read as a pile.
 */
export function truckTread(): THREE.CanvasTexture {
  return propCanvas((g) => {
    g.fillStyle = "#2c2733";
    g.fillRect(0, 0, 64, 64);
    // Lugs: eight blocks around the circumference, staggered top and bottom,
    // which is the whole of what a monster tyre looks like from ten metres.
    g.fillStyle = "#59505f";
    for (let i = 0; i < 8; i++) {
      g.fillRect(i * 8 + 1, i % 2 === 0 ? 2 : 30, 6, 32);
    }
    // Sidewall bands, so the tyre has an edge where it meets the hub.
    g.fillStyle = INK;
    g.fillRect(0, 0, 64, 3);
    g.fillRect(0, 61, 64, 3);
  });
}

/**
 * The truck's hub cap, on both cylinder caps.
 *
 * This is the part that turns a prism into a wheel. A cap's UVs are already a
 * circle, so a chrome disc with lug holes lands as a chrome disc with lug holes
 * — and the near cap faces the camera for the whole lap.
 */
export function truckHub(): THREE.CanvasTexture {
  return propCanvas((g) => {
    const disc = (r: number, color: string) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(32, 32, r, 0, Math.PI * 2);
      g.fill();
    };
    disc(32, "#2c2733");
    disc(29, INK);
    disc(25, "#e4e6ee");
    disc(19, "#9aa0b0");
    disc(9, "#e4e6ee");
    // Five lugs, because five is what a wheel has and four is what a table has.
    g.fillStyle = INK;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      g.beginPath();
      g.arc(32 + Math.cos(a) * 14, 32 + Math.sin(a) * 14, 3, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/**
 * The truck's face: headlamp eyes over a radiator grille, cut out of nothing.
 *
 * Same construction and same argument as the mower's — a prop with no face is
 * the weakest thing on the stage — and the same placement rule: it goes on the
 * end the yaw turns toward the camera, not on the end a truck's face belongs on
 * in a world with a fixed viewpoint.
 */
export function truckFace(): THREE.CanvasTexture {
  return propCanvas((g) => {
    // Opaque, and the whole tile. A cut-out decal laid over the box-mapped
    // livery put the eyes on top of a panel that already said 4SCORE in
    // hundred-point type, and the two read as one texture rather than as a
    // face on a nose. The nose is its own flat panel now, and the livery ends
    // where it starts.
    g.fillStyle = "#eceaf4";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#cdc9dc";
    g.fillRect(0, 32, 64, 32);

    g.fillStyle = "#ffe9a8";
    g.fillRect(5, 9, 22, 20);
    g.fillRect(37, 9, 22, 20);
    g.fillStyle = INK;
    // Brow bars, which are the whole of the expression: a monster truck is not
    // pleased and it is not upset either.
    g.fillRect(5, 9, 22, 5);
    g.fillRect(37, 9, 22, 5);
    // Pupils, both a little too high, both looking at nothing in particular.
    g.fillRect(12, 16, 8, 11);
    g.fillRect(44, 16, 8, 11);
    g.fillStyle = "#ffffff";
    g.fillRect(14, 18, 3, 3);
    g.fillRect(46, 18, 3, 3);
    // The grille, which is a mouth if it is on a face and a grille if it is on
    // a truck, and it is on both.
    g.fillStyle = INK;
    g.fillRect(8, 37, 48, 20);
    g.fillStyle = "#a3164e";
    for (let i = 0; i < 5; i++) g.fillRect(12 + i * 9, 41, 5, 12);
    inkEdge(g, 3);
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
 *
 * Bone, not gold. It was the discs' own `#c8991f`/`#e2b743`, and the mascot
 * spends its whole act rolling along the foot of a board covered in gold discs
 * — so the one recurring character in the game was camouflaged against the
 * scenery it performs in front of. Same character, hue moved off the board's
 * palette and given the shared ink ring, which is what makes it pop off both
 * the gold and the void. Everything downstream (the cherub, the stare, the
 * washer, the cannon) inherits it, which is the point: one cast, one skin.
 */
export function mascotFace(mood: "up" | "down" | "shades"): THREE.CanvasTexture {
  const tex = propCanvas((g) => {
    g.fillStyle = INK;
    g.beginPath();
    g.arc(32, 32, 32, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#d8ccb4";
    g.beginPath();
    g.arc(32, 32, 27, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#f6efdd";
    g.beginPath();
    g.arc(32, 32, 22, 0, Math.PI * 2);
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
      g.fillStyle = "#f6efdd";
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
 * A planet nobody ordered: four bands and a storm, in teal and gold.
 *
 * It used to be painted in the void's own violets, on the theory that the
 * interlude should look like it belonged to the same world. It doesn't have to
 * belong to the same world — it is explicitly somewhere else — and what it
 * actually did was disappear: a lavender sphere on a lavender void lost its
 * whole lower half and read as a smear. Teal is in the oil-slick ramp, so it is
 * house colour, and it is the one part of that ramp the void never uses.
 *
 * Bands rather than a gradient. A sphere this cheap has ten facets around, so
 * a smooth ramp lands one shade per facet and comes back looking like a shading
 * error — hard bands at least look like a decision somebody made in 1997.
 */
export function planetSkin(): THREE.CanvasTexture {
  return propCanvas((g) => {
    g.fillStyle = "#1f8f96";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#5fd6cf";
    g.fillRect(0, 10, 64, 10);
    g.fillStyle = "#0e5a63";
    g.fillRect(0, 28, 64, 8);
    g.fillStyle = "#e8b93f";
    g.fillRect(0, 42, 64, 5);
    g.fillStyle = "#9ceee4";
    g.fillRect(0, 54, 64, 4);
    // The terminator: a hard edge down one side, and narrow. At a third of the
    // tile it bit a chunk out of the silhouette and the planet read as a
    // potato with a flat side. No light in this scene is responsible for it.
    g.fillStyle = "rgba(10, 6, 18, 0.42)";
    g.fillRect(52, 0, 12, 64);
    // The one storm. It is a rectangle.
    g.fillStyle = "#ffd97a";
    g.fillRect(12, 20, 11, 6);
  });
}

/**
 * The ring, as a cut-out annulus on one tile. Drawn flat and mapped to a quad
 * rather than built as geometry: a torus is 400 triangles of a shape that is
 * two triangles of texture, and the law is the law.
 *
 * Gold, and thicker than it was. Pale violet bands one texel wide over a violet
 * void are a ring you can only find if you already know where it is.
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
    band(30, 7, "#8a6a1c");
    band(30, 4, "#e8b93f");
    band(23, 4, "#fff3d0");
    band(17, 3, "#5fd6cf");
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

/**
 * The cherub's wing, cut out of nothing: a scalloped trailing edge, three
 * feather divisions and an ink outline.
 *
 * It was an untextured yellow rectangle on each shoulder — the head and the
 * halo did all the work and the wings actively argued against them, because a
 * plain quad next to a modelled face reads as a placeholder somebody forgot.
 * The scallop is the entire fix and it is two arcs and a stroke: what makes a
 * shape a wing is its trailing edge, and nothing else about it has to be true.
 *
 * `mirrored` because the two wings are the same quad at ±x, so one of them
 * needs its root on the other side. Turning the texture rather than the mesh —
 * the mesh's own rotation is the flap.
 */
export function wingSkin(mirrored: boolean): THREE.CanvasTexture {
  const tex = propCanvas((g) => {
    if (mirrored) {
      g.translate(64, 0);
      g.scale(-1, 1);
    }
    // The wing body: root at the left, sweeping out and down to the right.
    const feathers = 4;
    const path = () => {
      g.beginPath();
      g.moveTo(2, 8);
      g.lineTo(50, 4);
      // Scallops along the trailing edge, big enough to survive 64px.
      for (let i = 0; i < feathers; i++) {
        const x = 56 - i * 14;
        g.arc(x - 7, 34, 8.5, -Math.PI / 2 + 0.2, Math.PI / 2 - 0.2);
        g.lineTo(x - 14, 34);
      }
      g.lineTo(2, 34);
      g.closePath();
    };
    g.lineJoin = "round";
    g.strokeStyle = INK;
    g.lineWidth = 7;
    path();
    g.stroke();
    g.fillStyle = "#f0d97a";
    path();
    g.fill();
    // Feather divisions: three hard lines, no shading.
    g.strokeStyle = "#b8964a";
    g.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(8, 12 + i * 6);
      g.lineTo(48 - i * 10, 30);
      g.stroke();
    }
  });
  return tex;
}

/**
 * A firework tube for the win rack: candy stripes, ink bands, a green fuse.
 *
 * The pyro used to be five identical smooth orange cones and, on the biggest
 * beat in the game, five identical smooth orange cones are traffic cones. What
 * a cheap firework looks like is a *striped cardboard tube* with something
 * coming out of it, and the tube is the part that says which of the two this is
 * — it is there before the jet lights and after it goes out.
 */
export function pyroTube(): THREE.CanvasTexture {
  return propCanvas((g) => {
    g.fillStyle = "#f4f2fa";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#a3164e";
    for (let i = -64; i < 64; i += 26) {
      g.beginPath();
      g.moveTo(i, 64);
      g.lineTo(i + 13, 64);
      g.lineTo(i + 77, 0);
      g.lineTo(i + 64, 0);
      g.closePath();
      g.fill();
    }
    g.fillStyle = INK;
    g.fillRect(0, 0, 64, 7);
    g.fillRect(0, 57, 64, 7);
    g.fillStyle = "#7fe018";
    g.fillRect(26, 7, 12, 6);
    inkEdge(g, 3);
  });
}

/**
 * The jet: a tapering column of hard chevrons, cut out of nothing.
 *
 * A sprite rather than a cone, because the cone was the problem. Scaled in y by
 * the act, which stretches the tile — affine warp is on-brand and a firework
 * that grows by smearing is exactly what a 1997 particle looked like.
 */
export function pyroFlame(): THREE.CanvasTexture {
  return propCanvas((g) => {
    // Rows, widest at the base, in three heat steps and one acid one. Hard
    // rectangles: a flame drawn as a gradient is a light, and this is a decal.
    const rows: [y: number, h: number, w: number, color: string][] = [
      [52, 12, 30, "#ffd97a"],
      [40, 12, 26, "#ffa41a"],
      [28, 12, 20, "#ed5705"],
      [18, 10, 14, "#ffa41a"],
      [9, 9, 9, "#ffd97a"],
      [2, 7, 5, "#ffffff"],
    ];
    for (const [y, h, w, color] of rows) {
      g.fillStyle = color;
      g.fillRect(32 - w / 2, y, w, h);
    }
    // Two acid flecks, always the same two.
    g.fillStyle = "#7fe018";
    g.fillRect(10, 44, 5, 5);
    g.fillRect(50, 32, 4, 4);
  });
}

/**
 * A starburst: eight rays, a ring of dots, a white core.
 *
 * The thing a canned firework is *for*, and the part the old rack had none of.
 * Two cels' worth of the same shape swapped by scale, never by fade — a
 * sparkle that fades is a light and a sparkle that snaps is a sticker.
 */
export function pyroBurst(): THREE.CanvasTexture {
  return propCanvas((g) => {
    g.translate(32, 32);
    for (let i = 0; i < 8; i++) {
      g.save();
      g.rotate((i / 8) * Math.PI * 2);
      g.fillStyle = i % 2 === 0 ? "#ffd97a" : "#a3164e";
      g.beginPath();
      g.moveTo(0, -30);
      g.lineTo(4, -6);
      g.lineTo(-4, -6);
      g.closePath();
      g.fill();
      // The dot on the end of the ray, which is the whole vocabulary.
      g.fillStyle = "#ffffff";
      g.fillRect(-2, -30, 4, 4);
      g.restore();
    }
    g.fillStyle = "#7fe018";
    g.beginPath();
    g.arc(0, 0, 9, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(0, 0, 5, 0, Math.PI * 2);
    g.fill();
  });
}

/**
 * The beacon's glass: amber, ribbed, with one hot sector.
 *
 * Wrapped around the housing so the ribs go round it, which is the one thing
 * that says this lamp turns even on the frames where nothing has moved.
 */
export function beaconGlass(): THREE.CanvasTexture {
  return propCanvas((g) => {
    g.fillStyle = "#c4460a";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#ff8a2a";
    for (let i = 0; i < 8; i++) g.fillRect(i * 8, 0, 4, 64);
    // The hot sector: a quarter of the lamp is brighter than the rest and stays
    // that quarter, so the spin reads as a thing going past rather than as the
    // whole housing pulsing.
    g.fillStyle = "#ffd97a";
    g.fillRect(6, 0, 12, 64);
    g.fillStyle = INK;
    g.fillRect(0, 0, 64, 4);
    g.fillRect(0, 60, 64, 4);
  });
}

/**
 * The strobe's flare: a hard four-point star with a stepped corona.
 *
 * A cheap 3D lens flare, drawn as concentric rings rather than as a gradient,
 * on one quad behind the lamp. It is what gives a small object at the edge of
 * the frame the presence a threat cue needs without giving it more geometry.
 */
export function flareStar(): THREE.CanvasTexture {
  return propCanvas((g) => {
    g.translate(32, 32);
    // Four long rays and four short ones.
    for (let i = 0; i < 8; i++) {
      g.save();
      g.rotate((i / 8) * Math.PI * 2);
      const arm = i % 2 === 0 ? 31 : 17;
      g.fillStyle = i % 2 === 0 ? "#ffb14a" : "#ed5705";
      g.beginPath();
      g.moveTo(0, -arm);
      g.lineTo(5, -4);
      g.lineTo(-5, -4);
      g.closePath();
      g.fill();
      g.restore();
    }
    const ring = (r: number, color: string) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fill();
    };
    ring(13, "#ed5705");
    ring(9, "#ffb14a");
    ring(5, "#fff3d0");
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
 * Tiled along the rail's length — but only three times, and with two chevrons
 * per tile. It was nine repeats of a five-chevron tile, which is fifty stripes
 * across a rail that recedes to a point, and the result was moiré: at the far
 * end the stripe period fell under a pixel and the rail shimmered instead of
 * sitting still. Fine detail on a prop that runs *into* the frame is not detail,
 * it is aliasing, and the nearest filter has no mip chain to save it. Fat
 * stripes at a low repeat are the only version of this that holds still.
 */
export function bumperSkin(): THREE.CanvasTexture {
  const tex = propCanvas((g) => {
    g.fillStyle = "#f0ece0";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#a3164e";
    for (let i = -64; i < 64; i += 32) {
      g.beginPath();
      g.moveTo(i, 64);
      g.lineTo(i + 16, 64);
      g.lineTo(i + 80, 0);
      g.lineTo(i + 64, 0);
      g.closePath();
      g.fill();
    }
    inkEdge(g, 4);
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
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
 *
 * Lighter again, and for the second time for the same reason. The mid-grey it
 * was still lost to the *board*, which is a dark plate the ball swings across
 * for the whole act: only the eyes came through. This is chrome now rather than
 * iron, which the prop's name doesn't mind and its silhouette needs.
 */
export function ironSkin(): THREE.CanvasTexture {
  return propCanvas((g) => {
    g.fillStyle = "#b3bac8";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#8a92a2";
    g.fillRect(0, 26, 64, 14);
    g.fillStyle = "#e6ebf4";
    g.fillRect(0, 8, 64, 6);
    g.fillStyle = "#6b7382";
    g.fillRect(0, 54, 64, 10);
    // Rust, in three blocks, same as the mower's — the alley has one weather.
    g.fillStyle = "#b0713a";
    g.fillRect(10, 44, 9, 6);
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
    // An ink socket under the whites, so the face survives the ball going
    // chrome — white eyes on a white sphere are no eyes at all.
    g.fillStyle = INK;
    g.fillRect(5, 15, 24, 26);
    g.fillRect(35, 15, 24, 26);
    g.fillStyle = "#ffffff";
    g.fillRect(8, 18, 18, 20);
    g.fillRect(38, 18, 18, 20);
    // The lids: a hard bar across the top half of each, which is the whole of
    // the expression. The ball's own mid tone, so it reads as its surface
    // coming down over the eye rather than as a second colour.
    g.fillStyle = "#8a92a2";
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
 * The foam finger's foam. Acid green, an ink outline, and nothing else.
 *
 * The word used to be baked in here and box-mapped onto every part, which put
 * `NO. 1` on the palm, the finger and the thumb at three different sizes — and
 * because the tile is the whole of each face, what came back was three green
 * boxes with writing on them rather than a hand. The livery is now plain and
 * outlined; the word is a decal on one quad (`foamNumber`), sized once.
 */
export function foamSkin(): THREE.CanvasTexture {
  return propCanvas((g) => {
    g.fillStyle = "#7fe018";
    g.fillRect(0, 0, 64, 64);
    // Foam has a nap. Two blocks of a lighter green, fixed, because wrongness
    // repeats — and because a completely flat fill on a box this big reads as
    // an untextured primitive, which is the accidental kind of bad.
    g.fillStyle = "#9bec3f";
    g.fillRect(6, 8, 22, 12);
    g.fillRect(36, 40, 20, 10);
    g.fillStyle = "#5fae10";
    g.fillRect(0, 50, 64, 8);
    inkEdge(g, 3);
  });
}

/** The finger's cuff: the wristband, in the disc crimson, outlined. */
export function foamCuff(): THREE.CanvasTexture {
  return propCanvas((g) => {
    g.fillStyle = "#a3164e";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#7a0f3a";
    g.fillRect(0, 26, 64, 12);
    g.fillStyle = "#e6d0dc";
    g.fillRect(0, 22, 64, 4);
    inkEdge(g, 3);
  });
}

/**
 * `NO. 1`, as a decal cut out of nothing rather than as text on a panel.
 *
 * Outlined in ink and shadowed a texel, which is the difference between a
 * printed decal and a system font: the old version was `fillText` straight onto
 * the livery, and at prop scale that is unmistakably Arial on a green box.
 *
 * `NO. 1` rather than `#1`: the hash sets narrow and closed up at this size and
 * came back from the harness as a smudge over the numeral.
 */
export function foamNumber(): THREE.CanvasTexture {
  return propCanvas((g) => {
    // A rosette behind the word, so the decal has a shape of its own and the
    // quad isn't just floating letters.
    g.fillStyle = INK;
    g.fillRect(2, 12, 60, 40);
    g.fillStyle = "#f4f2fa";
    g.fillRect(5, 15, 54, 34);
    g.fillStyle = "#a3164e";
    g.fillRect(5, 15, 54, 5);
    g.fillRect(5, 44, 54, 5);

    g.save();
    g.font = 'bold 26px "Arial Black", monospace';
    g.textAlign = "center";
    const width = g.measureText("NO. 1").width;
    const squeeze = Math.min(1, 48 / width);
    g.translate(32, 40);
    g.scale(squeeze, 1);
    g.lineJoin = "round";
    g.lineWidth = 6;
    g.strokeStyle = INK;
    g.strokeText("NO. 1", 0, 0);
    g.fillStyle = "#a3164e";
    g.fillText("NO. 1", 0, 0);
    g.restore();
  });
}

/**
 * Two eyes for the fingertip.
 *
 * The finger is the one act that turns round and points at the camera, and it
 * held that frame for a quarter of the act with nothing on it. Eyes on the tip
 * mean the thing pointing at you is also looking at you, which is the second
 * trait exactly — and it costs one quad.
 */
export function foamEyes(): THREE.CanvasTexture {
  return propCanvas((g) => {
    g.fillStyle = INK;
    g.fillRect(6, 16, 22, 30);
    g.fillRect(36, 16, 22, 30);
    g.fillStyle = "#ffffff";
    g.fillRect(9, 19, 16, 24);
    g.fillRect(39, 19, 16, 24);
    g.fillStyle = INK;
    // Both pupils hard to one side. It is not looking at you; it is looking
    // slightly past you, and it has been doing that the whole time.
    g.fillRect(16, 26, 8, 12);
    g.fillRect(46, 26, 8, 12);
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
 *
 * And there is a second half to that rule, which `chrome` and `void` both broke
 * (Connor, 2026-08-09: "pretty fucky"). **The horizon has to be a colour, not a
 * hole.** Both of them had it at a near-black within a few points of the ink
 * ring and of the void behind the word — so the horizon, the outline and the
 * background all merged into one dark mass across the middle of every letter,
 * and the ground band below was too dim to climb back out of it. `GAME OVER`
 * read as the top half of some letters floating over a smudge.
 *
 * `heat` is the one that was always right and is the reference for the other
 * four: its horizon is arterial red, which is dark *and* saturated, so it reads
 * as the far edge of a shiny surface rather than as a gap in the letter. Every
 * ramp's horizon now has real chroma, and every ground band is bright enough to
 * hold its own against the void.
 */
const WORD_ART: Record<WordArtStyle, { ramp: [number, string][]; ink: string }> = {
  // The wordmark's ramp, thinned to four. The one the software uses to say its
  // own name, so the act that states a fact gets to borrow it.
  chrome: {
    ramp: [
      [0.36, "#e8e4f0"],
      [0.48, "#ffffff"],
      // Slate violet rather than the near-black this was: at #2a1d40 the
      // horizon was four points off the ink ring and the word came apart.
      [0.58, "#5b4a86"],
      [1, "#c3b4e6"],
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
      // Same fix as chrome's, further round: saturated where chrome's is
      // greyed, so the two still read as two finishes of one object.
      [0.58, "#4a2b8c"],
      [1, "#8f66d6"],
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
 * 4:1 rather than square, and that's most of the reason it's legible. The banner
 * quad is 5.2 by 1.4 — nearly 4:1 — so a square tile spent three quarters of its
 * pixels on empty space above and below the word and then magnified the ten
 * pixels of actual letter across two metres of screen. Matching the tile's
 * aspect to the quad's puts every pixel in the budget into the letters.
 *
 * ## Why this one tile is bigger than 64 (Connor, 2026-08-09: "pretty fucky")
 *
 * The design below is authored in 64x16 units and rendered at `TILE`x that, so
 * the tile ships at 128x32 and every proportion in it — the lean, the ink ring,
 * the ramp's bands, the shadow offset — is identical to what it always was. It
 * is the same artifact sampled twice as finely, not a different one.
 *
 * The cap it breaks is real and so is the reason. ≤64px is the *prop* law, and
 * it is about liveries: a texture wrapped on an object, seen at an object's
 * size. This tile is type, it is the biggest thing that ever appears on screen —
 * a callout at the hold is seven world units across and fills most of the
 * frame — and at 64 texels wide that is fourteen screen pixels per texel. Ten
 * letters got five texels each, their outlines merged, and `INCREDIBLE` came
 * back as a rainbow smear with a shape somewhere inside it. That is not
 * intentional wrongness; it is a word you can't read.
 *
 * It is also the one place the vision asks for this. Pillar 1 puts the gloss in
 * the text specifically so the props can stay cheap — "the chrome/WordArt
 * callouts carry the shine. That was a decision, not a compromise" — and the
 * review screen's eval curve is SVG for exactly the same reason the repo
 * `CLAUDE.md` gives: the thing that has to be *read* gets display resolution,
 * and keeping it out of the sprite budget is what lets both budgets be right.
 *
 * Still nearest, still no mipmaps, still voted down to five flat colours. The
 * letters are as hard-edged and as banded as they ever were. What changed is
 * that there are now enough texels for the edge to be an edge.
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

  return propCanvas(
    (tile) => {
    // Everything below is drawn in 64x16 design units. `TILE` is a scale on the
    // way in and `SUPERSAMPLE` is another; the vote on the way out lands on the
    // shipped tile, and nothing in between knows about either.
    const hi = document.createElement("canvas");
    hi.width = TILE_W * SUPERSAMPLE;
    hi.height = TILE_H * SUPERSAMPLE;
    const g = hi.getContext("2d")!;
    g.scale(SUPERSAMPLE * TILE, SUPERSAMPLE * TILE);

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
      vote(g, tile, TILE_W, TILE_H, [ink, ...ramp.map(([, color]) => color)]);
    },
    TILE_H,
    TILE_W,
  );
}

/**
 * Design units per shipped texel for the WordArt tile. See the note on
 * `wordArt` for why this one texture is allowed past 64.
 *
 * Two, and not four. The vote's whole job is to hand back an edge that is one
 * texel of ink and then nothing, and the ink ring is authored a shade under one
 * design unit wide — at 4 it is four texels of ring around a letter, which is a
 * thick even border and reads as a sticker die-cut by a machine. At 2 the ring
 * still breaks raggedly across its texels, which is the hand-drawn artifact the
 * whole `vote`/`SUPERSAMPLE` apparatus exists to produce.
 */
const TILE = 2;
const TILE_W = 64 * TILE;
const TILE_H = 16 * TILE;

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
