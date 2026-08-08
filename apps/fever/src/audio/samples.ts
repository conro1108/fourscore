/**
 * The sample loader, and the seam between the shopping list and the game.
 *
 * `public/samples/manifest.json` names, for every sound in the library, the
 * short CC0 recording it wants ("airhorn, dry, single blast, <1s"). Until a
 * file is dropped next to it and its `file` field filled in, that entry has no
 * source and the recipe renders its synthesized stand-in instead. So the game
 * is fully audible today, gets better one file at a time, and no caller ever
 * learns a filename — everything is still addressed by semantic name.
 *
 * Failure is always silence-shaped: a missing manifest, a 404, an
 * undecodable file all resolve to `null` and the placeholder plays. A sound
 * that can't load is not worth breaking a game over.
 */

export interface ManifestEntry {
  /** What to go find. This is the shopping list, in the shipped artifact. */
  want: string;
  /** Filename inside `public/samples/`, once Connor has sourced one. */
  file?: string;
}

const MANIFEST_URL = "/samples/manifest.json";

let manifest: Promise<Record<string, ManifestEntry>> | null = null;

function loadManifest(): Promise<Record<string, ManifestEntry>> {
  manifest ??= fetch(MANIFEST_URL)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  return manifest;
}

/** The installed source sample for a sound, or null if there isn't one yet. */
export async function loadSample(
  name: string,
  ctx: BaseAudioContext,
): Promise<AudioBuffer | null> {
  try {
    const entry = (await loadManifest())[name];
    if (!entry?.file) return null;
    const response = await fetch(`/samples/${entry.file}`);
    if (!response.ok) throw new Error(`${response.status}`);
    return await ctx.decodeAudioData(await response.arrayBuffer());
  } catch (e) {
    console.warn(`sample for "${name}" failed to load; using the placeholder`, e);
    return null;
  }
}
