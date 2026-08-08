/**
 * Disc geometry — a struck coin, not a slice of pipe.
 *
 * The discs are on the *expensive* side of the budget law (they're part of the
 * board, not a prop), so they get real geometry: a lathed cross-section with a
 * raised rim and a dished face, and a reeded edge like a coin's. The reeding is
 * what the eye actually reads as "coin" — a flat cylinder wall returns one
 * uniform highlight, a fluted one breaks that highlight into a ring of
 * glints that turns as the camera sways.
 *
 * Pure and unit-tested: the profile is the interesting part and it's easy to
 * get inside-out (a rim that dishes the wrong way reads as a bottle cap).
 *
 * Sampling matters. `FLUTES` grooves need at least ~4 radial segments each or
 * the ripple aliases — at two samples per period it disappears entirely into a
 * smooth cylinder, which looks exactly like the bug of forgetting to apply it.
 */

import * as THREE from "three";

const FLUTES = 20;
const SEGMENTS = FLUTES * 4;
/** Groove depth, as a fraction of the disc radius. */
const REED_AMPLITUDE = 0.03;
/** Vertices this far out (fraction of radius) are on the rim and get reeded. */
const RIM_FROM = 0.86;

/**
 * Half the coin's cross-section, center outward, as (radius, height) pairs in
 * fractions of radius and half-thickness. Mirrored to make the full profile.
 *
 *      face dish        rim lip
 *   ___________         ___
 *              \_______/   \      <- chamfer into the reeded wall
 */
const HALF_PROFILE: readonly [number, number][] = [
  [0.0, 0.78],
  [0.44, 0.8],
  [0.7, 0.84],
  [0.79, 0.99],
  [0.88, 1.0],
  [0.96, 0.9],
  [1.0, 0.6],
];

/** The full lathe profile, bottom face to top face, in world units. */
export function coinProfile(radius: number, thickness: number): THREE.Vector2[] {
  const half = thickness / 2;
  // Traced as one open curve: back-face center, out to the rim, around the
  // wall, back in to the front-face center. Order matters — a profile that
  // doubles back folds the lathed surface inside out.
  const back = HALF_PROFILE.map(([r, y]) => new THREE.Vector2(r * radius, -y * half));
  const front = [...HALF_PROFILE]
    .reverse()
    .map(([r, y]) => new THREE.Vector2(r * radius, y * half));
  return [...back, ...front];
}

/**
 * The disc, built once and shared by every mesh on the board. Callers dispose
 * it; nothing here caches, because the geometry depends on the variant's
 * layout and a stale cache would silently draw Connect 4 discs on a Connect 5
 * board.
 */
export function coinGeometry(radius: number, thickness: number): THREE.BufferGeometry {
  const geometry = new THREE.LatheGeometry(coinProfile(radius, thickness), SEGMENTS);

  // Reed the rim: a cosine ripple in the radial direction, applied only to the
  // vertices out at the wall so the faces stay flat and the silhouette only
  // wobbles where a coin's does.
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < RIM_FROM * radius) continue;
    const theta = Math.atan2(z, x);
    const scale = 1 + REED_AMPLITUDE * Math.cos(FLUTES * theta);
    pos.setX(i, x * scale);
    pos.setZ(i, z * scale);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}
